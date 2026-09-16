#!/usr/bin/env python3
"""Regressionslauf: was wuerde die vorgeschlagene Touchdown-Regel am Bestand aendern?

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" DETECTOR_V2=1 \
        .venv/bin/python ../scripts/regression-merge-touchdown.py --limit 500

SCHREIBT NICHTS. Weder in die DB noch in Dateien — `analyze_session_v2` ist ausdruecklich
schreibfrei, und `run_analysis` wird bewusst NICHT angefasst (das committet selbst).
Die Regel wird zur LAUFZEIT gepatcht, nicht im Quelltext geaendert: solange nicht entschieden
ist, bleibt die Pipeline unberuehrt.

HINTERGRUND (docs/TODO.md, „LAUF-TRENNUNG IM TURN"): `_merge_no_stop` fragt heute, ob die
Positions-Geschwindigkeit in der Luecke NIE unter NOSTOP_SPEED fiel. Ein einzelner Messpunkt am
Rand kippt das. Vorgeschlagen ist stattdessen die DAUER des Einbruchs — ein Stopp ist eine Dauer,
kein Punkt — und eine Luecken-Obergrenze von 7 statt 5 s. An 170 accel-belegten Laufpaaren traf
die Regel bis 7 s 4 von 4 richtig; ab 8 s kamen Fehler dazu.
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import sys
from collections import Counter

import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

NEU_TOUCHDOWN_S = 7      # war 5
NEU_DIP_MAX_S = 2        # laengster zusammenhaengender Einbruch unter NOSTOP_SPEED (Marcs Fall hat 2 s)


def laengster_dip(werte, schwelle) -> int:
    best = akt = 0
    for x in werte:
        akt = akt + 1 if x < schwelle else 0
        best = max(best, akt)
    return best


def baue_neue_regel(v1):
    """Kopie von `_merge_no_stop` mit der vorgeschlagenen Aenderung — sonst Zeile fuer Zeile gleich."""
    def _merge_no_stop_neu(segments, speed_s, t_ms, step, speeds, gps_hz, pos_speed_s=None):
        if len(segments) < 2:
            return segments
        out = [segments[0]]
        for seg in segments[1:]:
            prev = out[-1]
            i_a, i_b = prev["i_end"] + 1, seg["i_start"]
            gap = speed_s[i_a:i_b]
            no_stop = gap.size == 0 or float(np.nanmin(gap)) >= v1.NOSTOP_SPEED
            if not no_stop and pos_speed_s is not None and gap.size:
                pg = pos_speed_s[i_a:i_b]
                if pg.size:
                    pos_min = float(np.nanmin(pg))
                    luecke_s = float(t_ms[i_b] - t_ms[i_a - 1]) / 1000.0 if i_b < t_ms.size else 0.0
                    # (a) unveraendert: Position bleibt durchgehend im Foil-Band.
                    # (b) NEU: kurze Luecke UND kein laenger anhaltender Einbruch.
                    dip = laengster_dip(pg, v1.NOSTOP_SPEED)
                    if pos_min >= v1.NOSTOP_POS_SPEED or (luecke_s <= NEU_TOUCHDOWN_S and dip <= NEU_DIP_MAX_S):
                        no_stop = True
                        seg = {**seg, "merged_dip_s": round(luecke_s, 1)}
            seg_t = t_ms[prev["i_end"]: seg["i_start"] + 1]
            max_dt = float(np.max(np.diff(seg_t))) / 1000.0 if seg_t.size >= 2 else 0.0
            if no_stop and max_dt <= v1.GAP_SPLIT_S:
                out[-1] = v1._seg_fields(prev["i_start"], seg["i_end"] + 1, t_ms, step, speeds)
            else:
                out.append(seg)
        return out
    return _merge_no_stop_neu


def kennzahlen(res) -> dict:
    segs = res["segments"]
    return {
        "laeufe": len(segs),
        "foil_m": round(sum(s.get("distance_m", 0) for s in segs)),
        "bester_m": round(max((s.get("distance_m", 0) for s in segs), default=0)),
        "beste_s": round(max((s.get("duration_s", 0) for s in segs), default=0)),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=300)
    ap.add_argument("--zeige", type=int, default=30, help="wie viele geaenderte Sessions auflisten")
    args = ap.parse_args()

    if not os.environ.get("DATABASE_URL"):
        sys.exit("DATABASE_URL fehlt (s. Kopf dieser Datei).")
    os.environ.setdefault("DETECTOR_V2", "1")

    from app import models
    from app.analysis import gps as v1
    from app.analysis.detect_v2 import analyze_session_v2
    from app.db import SessionLocal

    db = SessionLocal()
    ss = (db.query(models.Session)
          .filter(models.Session.deleted.isnot(True), models.Session.is_pumpfoil.is_(True))
          .order_by(models.Session.started_at.desc()).limit(args.limit).all())

    alt_fn = v1._merge_no_stop
    neu_fn = baue_neue_regel(v1)

    geaendert, gleich, fehler = [], 0, 0
    art = Counter()
    for s in ss:
        try:
            v1._merge_no_stop = alt_fn
            a = kennzahlen(analyze_session_v2(s))
            v1._merge_no_stop = neu_fn
            b = kennzahlen(analyze_session_v2(s))
        except Exception as e:                      # eine kaputte Session stoppt den Lauf nicht
            fehler += 1
            continue
        finally:
            v1._merge_no_stop = alt_fn
            # Eine Session traegt ihre komplette Accel-Spur im Speicher. Ohne das hier lief der
            # Lauf am 16.09.2026 in den OOM-Killer der VM (s. Memory `vm-oom-protection`).
            gc.collect()
        if a == b:
            gleich += 1
            continue
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        geaendert.append((s, a, b, "gps_only" if (ar and ar.detection == "gps_only") else "mit Accel"))
        art["gps_only" if (ar and ar.detection == "gps_only") else "mit Accel"] += 1

    n = len(ss)
    print(f"\n{n} Sessions gerechnet · {gleich} unveraendert · {len(geaendert)} geaendert "
          f"({100*len(geaendert)/max(n,1):.1f} %) · {fehler} Fehler")
    print(f"davon {art['mit Accel']} mit Accel, {art['gps_only']} GPS-only\n")

    if geaendert:
        dl = sum(b["laeufe"] - a["laeufe"] for _, a, b, _ in geaendert)
        dm = sum(b["foil_m"] - a["foil_m"] for _, a, b, _ in geaendert)
        db_ = sum(b["bester_m"] - a["bester_m"] for _, a, b, _ in geaendert)
        print(f"Summen ueber die geaenderten Sessions:")
        print(f"  Laeufe          {dl:+d}")
        print(f"  Foil-Distanz    {dm:+d} m   (sollte ~0 sein: Zusammenfuehren erzeugt keine Strecke,")
        print(f"                              aber die Luecke zaehlt danach mit)")
        print(f"  bester Lauf     {db_:+d} m\n")
        print(f"{'Session':>8} {'Art':>10} {'Laeufe':>12} {'Foil m':>16} {'bester Lauf m':>20}")
        for s, a, b, k in sorted(geaendert, key=lambda x: -(x[2]["bester_m"] - x[1]["bester_m"]))[:args.zeige]:
            print(f"{s.id:>8} {k:>10} {a['laeufe']:>5} -> {b['laeufe']:<4} "
                  f"{a['foil_m']:>7} -> {b['foil_m']:<7} {a['bester_m']:>9} -> {b['bester_m']:<8}")
        print("\nURLs der zehn groessten Aenderungen:")
        for s, a, b, _k in sorted(geaendert, key=lambda x: -(x[2]["bester_m"] - x[1]["bester_m"]))[:10]:
            print(f"  https://pumpfoil.org/sessions/{s.id}   bester Lauf {a['bester_m']} -> {b['bester_m']} m")


if __name__ == "__main__":
    main()
