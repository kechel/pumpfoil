#!/usr/bin/env python3
"""Wind-Sportarten: eigene Lauf-Erkennung per Tempo-Schwelle — Vorschlags-Auswertung (rein LESEND).

Anlass (Jan, 19.10.2026): „was halt noch fehlt beim wingfoilen ist, dass der run dann nicht mehr
staendig unterbrochen wird". Heute laufen Wing/Kite/Parawing durch die Pumpfoil-Erkennung (Foil-
Modell auf Pumpfoil-Handgelenk trainiert), Beispiel #17478: 57 Laeufe. Stufe 3 im Stand-Buch:
on-foil per Tempo-Schwelle + Haltezeit, das Foil-Modell fuer Wind NICHT verwenden.

Dieses Skript schreibt nichts. Es spielt je Parametersatz eine einfache Zustandsmaschine
(Hysterese + Haltezeiten, wie `analysis/gps._heuristic_mask`, aber mit waehlbaren Haltezeiten) auf
der bereinigten GPS-Geschwindigkeit (`clean_speed_series`, dieselbe Kette wie die Analyse) und
vergleicht mit den heute gespeicherten Laeufen (`segments_json`).

    cd server && .venv/bin/python ../scripts/wind-laeufe-pruefen.py [--limit N] [--session ID]
"""
from __future__ import annotations

import argparse
import json
import math
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

import numpy as np  # noqa: E402

from app import models, storage  # noqa: E402
from app.analysis.gps import clean_speed_series  # noqa: E402
from app.db import SessionLocal  # noqa: E402

WIND = ("wingfoil", "kitefoil", "parawing")
MIN_RUN_S = 5
GAP_SPLIT_S = 15          # wie heute: laengere GPS-Luecke = Sturz/Schwimmen -> Lauf endet
MAX_FOIL_KMH = 60.0       # Wind: deutlich schneller als Pumpfoil

# Voller Raster (--voll) oder die sechs Kandidaten aus dem Probelauf an #17478.
GITTER_VOLL = [(e, x, ed) for e in (10, 12, 14) for x in (8, 10, 12) if x <= e for ed in (3, 5, 8, 12)]
GITTER = [(10, 9, 3), (10, 8, 8), (10, 8, 12), (12, 10, 5), (12, 8, 8), (14, 10, 8)]


def _hav(a, b):
    r = 6371000.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def reihe(gps):
    """1-Hz-Reihe: Zeit (s), Tempo (m/s, bereinigt, 3-s-Median), Luecke vor dem Punkt (s)."""
    t = np.array([p[0] / 1000.0 for p in gps])
    v = []
    for i, p in enumerate(gps):
        s = p[3]
        if s is None:
            s = (_hav(gps[i - 1][1:3], p[1:3]) / max(t[i] - t[i - 1], 1e-3)) if i else 0.0
        v.append(float(s))
    v = clean_speed_series(np.array(v), 1)
    med = np.array([np.median(v[max(0, i - 1):i + 2]) for i in range(len(v))])
    luecke = np.concatenate([[0.0], np.diff(t)])
    return t, med, luecke


def laeufe(t, v, luecke, enter_kmh, exit_kmh, exit_dwell, enter_dwell=3):
    enter, exit_, vmax = enter_kmh / 3.6, exit_kmh / 3.6, MAX_FOIL_KMH / 3.6
    out, foil, start, cand, non, letzte_gute = [], False, 0, 0, 0, 0
    for i in range(len(v)):
        if luecke[i] > GAP_SPLIT_S and foil:
            out.append((start, letzte_gute)); foil = False; cand = 0
        if not foil:
            cand = cand + 1 if enter <= v[i] <= vmax else 0
            if cand >= enter_dwell:
                foil, start, non, letzte_gute = True, i - enter_dwell + 1, 0, i
        else:
            if exit_ <= v[i] <= vmax:
                non, letzte_gute = 0, i
            else:
                non += 1
                if non >= exit_dwell:
                    out.append((start, letzte_gute)); foil = False; cand = 0
    if foil:
        out.append((start, letzte_gute))
    return [(a, b) for a, b in out if t[b] - t[a] >= MIN_RUN_S]


def kennzahlen(t, v, runs):
    dauer = sum(t[b] - t[a] for a, b in runs)
    strecke = sum(float(np.sum(v[a:b + 1])) for a, b in runs)   # 1 Hz -> m
    return len(runs), dauer, strecke


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--session", type=int, default=0)
    ap.add_argument("--voll", action="store_true")
    a = ap.parse_args()
    global GITTER
    if a.voll:
        GITTER = GITTER_VOLL
    db = SessionLocal()
    q = (db.query(models.Session, models.AnalysisResult)
         .join(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
         .filter(models.Session.sport_class.in_(WIND), models.Session.deleted.isnot(True)))
    if a.session:
        q = q.filter(models.Session.id == a.session)
    q = q.order_by(models.Session.id.desc())
    if a.limit:
        q = q.limit(a.limit)
    zeilen = {k: [] for k in GITTER}
    heute = []
    n = 0
    for s, ar in q.all():
        try:
            gps = storage.load_gps(s.session_uuid, roh=True)
        except Exception:
            continue
        if len(gps) < 60:
            continue
        segs = json.loads(ar.segments_json or "[]")
        h_n = len(segs)
        h_d = sum((g.get("t_end_ms", 0) - g.get("t_start_ms", 0)) / 1000.0 for g in segs)
        h_m = sum(float(g.get("distance_m") or 0) for g in segs)
        t, v, lu = reihe(gps)
        bewegt = float(np.sum(v >= 4 / 3.6))
        if bewegt < 60:
            continue
        heute.append((s.id, h_n, h_d, h_m, bewegt))
        for k in GITTER:
            zeilen[k].append(kennzahlen(t, v, laeufe(t, v, lu, *k)))
        n += 1
    db.close()
    if not n:
        print("keine Sessions"); return
    hn = [x[1] for x in heute]; hd = [x[2] for x in heute]; hb = [x[4] for x in heute]
    print(f"{n} Wind-Sessions. HEUTE: Laeufe/Session Median {st.median(hn):.0f} (p90 {np.percentile(hn, 90):.0f}), "
          f"on-foil-Zeit/bewegt Median {st.median([d / b for d, b in zip(hd, hb)]):.0%}")
    print("enter exit halt | Laeufe Med p90 | on-foil/bewegt Med | Zeit neu/heute Med | weniger Laeufe")
    erg = []
    for k in GITTER:
        z = zeilen[k]
        ln = [x[0] for x in z]; ld = [x[1] for x in z]
        anteil = st.median([d / b for d, b in zip(ld, hb)])
        verh = st.median([d / h for d, h in zip(ld, hd) if h > 0]) if any(h > 0 for h in hd) else float("nan")
        weniger = sum(1 for a_, b_ in zip(ln, hn) if a_ < b_) / n
        erg.append((k, st.median(ln), np.percentile(ln, 90), anteil, verh, weniger))
    for k, m, p, an, ve, we in erg:
        print(f"{k[0]:5} {k[1]:4} {k[2]:4} | {m:6.0f} {p:5.0f} | {an:17.0%} | {ve:17.2f} | {we:6.0%}")
    if a.session:
        sid = heute[0][0]
        print(f"\nSession #{sid}: heute {heute[0][1]} Laeufe, {heute[0][2] / 60:.1f} min on-foil")


if __name__ == "__main__":
    main()
