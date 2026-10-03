#!/usr/bin/env python3
"""Gleitphasen Uhr gegen Brett MIT Zeitversatz-Suche und aus Sicht des Bretts. REIN LESEND.
Jan (03.10.2026): die Hand geht vor dem Brett runter und wieder hoch — Pumps sind zwischen Hand und
Brett systematisch versetzt, das ist Natur der Sache. Und: echtes Gleiten oft AM ENDE eines Laufs.
1. Brett-Gleitphasen: Luecken zwischen Brett-Pumps >= MIN_S innerhalb der Brett-Laeufe, dazu das
   Ende (letzter Pump -> Laufende). Wie viele davon sieht die Uhr ebenfalls als Gleiten?
2. Uhr-Gleitphasen >= MIN_S (zwischen Pumps + Ende) bei Versatz -800..+800 ms: Anteil ohne Brett-Pump.
Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/gleiten_versatz.py [--min 1.5]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse, json, pathlib, sys
import numpy as np
WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server")); sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))


def luecken(laeufe, mind):
    """laeufe: [(t0, t1, pumps)] -> [(a, b, art)] mit art 'mitte' | 'ende'."""
    out = []
    for t0, t1, ps in laeufe:
        ps = np.sort(ps[(ps >= t0) & (ps <= t1)])
        for k in range(ps.size - 1):
            if (ps[k + 1] - ps[k]) / 1000 >= mind:
                out.append((ps[k], ps[k + 1], "mitte"))
        if ps.size and (t1 - ps[-1]) / 1000 >= mind:
            out.append((ps[-1], t1, "ende"))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--min", type=float, default=1.5); a = ap.parse_args()
    import brett_wahrheit as BW, gleiten_pruefen as GP
    from app.db import SessionLocal
    paare = [p for p in json.load(open(WURZEL / "server/data/ml/v3/paare.json")) if p["streuung_ms"] <= 400]
    db = SessionLocal()
    daten = []
    for p in paare:
        b = BW.brett(db, p["brett"]); u = GP.uhr_pumps(db, p["uhr"])
        daten.append((p, np.sort(b["pumps"]), [(x, y, np.asarray(b["pumps"])) for x, y in b["laeufe"]], u))
    db.close()
    # 1. Brett-Gleitphasen und ob die Uhr sie sieht (Uhr-Zeit = Brett-Zeit - versatz)
    print(f"== 1. Gleitphasen des BRETTS (>= {a.min} s), gesehen von der Uhr?")
    zeilen = []
    for p, bp, bl, u in daten:
        up = np.sort(np.concatenate([x[2] for x in u])) if u else np.zeros(0)
        ul = [(x[0], x[1]) for x in u]
        for x, y, art in luecken(bl, a.min):
            xu, yu = x - p["versatz_ms"], y - p["versatz_ms"]
            if not any(xu < q1 and yu > q0 for q0, q1 in ul):
                continue                                   # Uhr hatte hier keinen Lauf
            n = int(((up > xu + 300) & (up < yu - 300)).sum())
            zeilen.append(((y - x) / 1000, art, n))
    for art in ("mitte", "ende"):
        z = [x for x in zeilen if x[1] == art]
        if z:
            d = np.array([x[0] for x in z])
            print(f"  {art:5s}: {len(z):3d} Brett-Gleitphasen, Laenge Median {np.median(d):.1f} s, max {d.max():.1f} s; "
                  f"Uhr ohne Pump darin: {sum(1 for x in z if x[2] == 0)} ({sum(1 for x in z if x[2] == 0) / len(z) * 100:.0f} %)")
    # 2. Uhr-Gleitphasen bei Versatz
    print(f"\n== 2. Gleitphasen der UHR (>= {a.min} s): Anteil ohne Brett-Pump, je Zusatzversatz (Rand 200 ms)")
    for lag in range(-800, 801, 200):
        res = {"mitte": [0, 0], "ende": [0, 0]}
        for p, bp, bl, u in daten:
            for x, y, art in luecken(u, a.min):
                xb, yb = x + p["versatz_ms"] + lag + 200, y + p["versatz_ms"] + lag - 200
                res[art][0] += 1; res[art][1] += int(((bp > xb) & (bp < yb)).sum() == 0)
        print(f"  Versatz {lag:+5d} ms: " + "   ".join(f"{k} {v[1]}/{v[0]} ({v[1] / max(v[0], 1) * 100:.0f} %)" for k, v in res.items()))


if __name__ == "__main__":
    main()
