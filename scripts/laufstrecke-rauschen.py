#!/usr/bin/env python3
"""Lauf-Strecke gegen Doppler-Strecke (24.10.2026) — REIN LESEND.

Die Lauf-Strecke (`segments[].distance_m`) kommt aus den GPS-POSITIONEN, das Tempo aus dem DOPPLER. Springen die
Positionen (Uhr: 10-20 m), bekommt vor allem ein kurzer Lauf zu viel Strecke. Je Lauf: Verhaeltnis gespeicherte
Strecke / (Summe Doppler-Tempo x Zeit) aus der gespeicherten Spur (speeds["1"]), nach Laufdauer und Geraet; dazu die
Rekord-Frage: wie oft der laengste Lauf einer Session (best_distance_m) nach Doppler ein anderer waere bzw. um wie viel
kuerzer.

    cd server && DATABASE_URL=... .venv/bin/python ../scripts/laufstrecke-rauschen.py [--n 3000]
"""
import argparse
import json
import logging
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, ".")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=3000); a = ap.parse_args()
    logging.disable(logging.WARNING)
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    R = models.AnalysisResult
    zeilen, rekord = [], []
    try:
        q = (db.query(models.Session, R).join(R, R.session_id == models.Session.id)
             .filter(models.Session.status == "analyzed", models.Session.deleted.isnot(True),
                     models.Session.merged_into.is_(None))
             .order_by(models.Session.id.desc()).limit(a.n))
        for s, r in q:
            try:
                segs = json.loads(r.segments_json or "[]")
                tr = json.loads(r.track_geojson or "{}")
            except ValueError:
                continue
            v1 = ((tr.get("properties") or {}).get("speeds") or {}).get("1") or []
            if not segs or not v1:
                continue
            geraet = (s.device_model or "Garmin").split(" ·")[0]
            geraet = "Garmin" if geraet == "Garmin" else ("Apple" if geraet.startswith("Watch") else
                     ("Handy" if any(x in geraet for x in ("iPhone", "Pixel", "SM-S", "SM-G", "Samsung")) else "andere"))
            paare = []
            for g in segs:
                i0, i1 = g.get("i_start"), g.get("i_end")
                d, dist = g.get("duration_s"), g.get("distance_m")
                if i0 is None or i1 is None or not d or not dist or i1 >= len(v1):
                    continue
                if abs((i1 - i0) - d) > max(2, 0.1 * d):      # Spur hier nicht 1 Hz -> nicht vergleichbar
                    continue
                dop = float(np.sum(np.asarray(v1[i0 + 1:i1 + 1], float)))
                if dop <= 0:
                    continue
                zeilen.append((d, dist, dop, geraet, s.sport_class or "pumpfoil"))
                paare.append((dist, dop))
            if len(paare) >= 2:
                ig = int(np.argmax([p[0] for p in paare])); idp = int(np.argmax([p[1] for p in paare]))
                rekord.append((ig != idp, paare[ig][0], paare[ig][1], s.id))
    finally:
        db.rollback(); db.close()
    z = np.array([(d, dist / dop) for d, dist, dop, *_ in zeilen])
    print(f"{len(zeilen)} Laeufe")
    for lo, hi in ((0, 10), (10, 20), (20, 60), (60, 300), (300, 1e9)):
        m = (z[:, 0] >= lo) & (z[:, 0] < hi)
        if m.any():
            q = np.percentile(z[m, 1], [10, 50, 90])
            print(f"  Dauer {lo:>4}-{hi if hi < 1e9 else '':<4} s: n {m.sum():6}  Strecke/Doppler P10/P50/P90 "
                  f"{q[0]:.2f}/{q[1]:.2f}/{q[2]:.2f}  > 1,3: {np.mean(z[m, 1] > 1.3) * 100:.1f} %")
    je = defaultdict(list)
    for d, dist, dop, ger, sp in zeilen:
        je[ger].append(dist / dop)
    for k, v in sorted(je.items(), key=lambda x: -len(x[1])):
        print(f"  {k:7}: n {len(v):6}  P50 {np.median(v):.2f}  P90 {np.percentile(v, 90):.2f}")
    gesamt_pos = sum(x[1] for x in zeilen); gesamt_dop = sum(x[2] for x in zeilen)
    print(f"Summe aller Laeufe: Positionen {gesamt_pos / 1000:.0f} km, Doppler {gesamt_dop / 1000:.0f} km "
          f"({(gesamt_pos / gesamt_dop - 1) * 100:+.1f} %)")
    if rekord:
        anders = [x for x in rekord if x[0]]
        print(f"Laengster Lauf je Session: {len(anders)} von {len(rekord)} Sessions waere nach Doppler ein anderer Lauf")
        ueber = sorted(((x[1] / x[2], x[3], round(x[1]), round(x[2])) for x in rekord), reverse=True)[:8]
        print("  groesste Ueberschaetzung des laengsten Laufs (Faktor, Session, Positionen m, Doppler m):", ueber)


if __name__ == "__main__":
    main()
