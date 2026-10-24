#!/usr/bin/env python3
"""Accel gegen GPS INNERHALB einer Session (24.10.2026, Jan: „nicht dass wir da aehnliche Ausrichtungsprobleme haben").
REIN LESEND. Live gibt es kein Brett-Paar; pg-1 legt aber Pumps (Accel) gegen Laufende/Aufsetzen/Tempo (GPS). Je
Session: Einhuellende der Armbewegung (1,5-s-RMS) gegen Betrag der GPS-Tempo-Aenderung, Kreuzkorrelation ±15 s;
gemeldet wird der Gipfel. Ein fester Grundversatz (Tempo reagiert nach der Bewegung) ist normal, Ausreisser nicht.
Aufruf (aus server/): DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/ausrichtung_bestand.py [--n 400]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse, json, random, sys, logging
import numpy as np
sys.path.insert(0, ".")


def glatt(x, n):
    return np.convolve(x, np.ones(n) / n, mode="same")


def eine(db, s, PG):
    U = PG.uhr_daten(s)
    if U is None:
        return None
    fs = U["fs"]; t = U["t"]
    mag = np.linalg.norm(U["acc"], axis=1)
    hp = mag - glatt(mag, max(int(2 * fs), 3))
    env = np.sqrt(glatt(hp ** 2, max(int(1.5 * fs), 3)))
    g = U["gps"]; g = g[np.isfinite(g[:, 3])]
    if g.shape[0] < 120:
        return None
    gr = np.arange(max(t[0], g[0, 0]), min(t[-1], g[-1, 0]), 250.0)
    if gr.size < 2400:
        return None
    e = np.interp(gr, t, env)
    v = glatt(np.interp(gr, g[:, 0], g[:, 3]), 8)
    dv = np.abs(np.gradient(v))
    best = []
    for k in range(-60, 61):               # ±15 s in 250-ms-Schritten; k>0: GPS spaeter als Accel
        a = e[max(0, -k): e.size - max(0, k)]; b = dv[max(0, k): dv.size - max(0, -k)]
        best.append((np.corrcoef(a, b)[0, 1], k * 250))
    r, off = max(best)
    return {"id": s.id, "r": round(float(r), 3), "off_ms": off, "tb": json.loads(s.result.metrics_json or "{}").get("time_base"),
            "geraet": (s.device_model or "Garmin").split(" ·")[0], "app": s.app_version}


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=400); a = ap.parse_args()
    logging.disable(logging.WARNING)
    from app import models
    from app.db import SessionLocal
    from app.analysis import pumpgleit as PG
    db = SessionLocal()
    try:
        R = models.AnalysisResult
        ids = [x[0] for x in db.query(models.Session.id).join(R, R.session_id == models.Session.id)
               .filter(R.pg_version.isnot(None), models.Session.deleted.isnot(True)).all()]
        random.Random(1).shuffle(ids)
        out = []
        for sid in ids[:a.n]:
            try:
                e = eine(db, db.get(models.Session, sid), PG)
            except Exception as ex:   # rein lesend, einzelne kaputte Sessions ueberspringen
                e = None
            if e: out.append(e)
    finally:
        db.rollback(); db.close()
    offs = np.array([o["off_ms"] for o in out if o["r"] >= 0.2])
    print(f"{len(out)} Sessions, davon r >= 0,2: {offs.size}")
    if offs.size:
        print(f"Versatz GPS gegen Accel: Median {np.median(offs):.0f} ms, P10/P90 {np.percentile(offs, 10):.0f}/{np.percentile(offs, 90):.0f} ms")
        med = np.median(offs)
        for key in ("tb", "geraet"):
            grp = {}
            for o in out:
                if o["r"] >= 0.2: grp.setdefault(o[key], []).append(o["off_ms"])
            for k_, v_ in sorted(grp.items(), key=lambda x: -len(x[1]))[:8]:
                print(f"  {key}={k_}: n {len(v_)}, Median {np.median(v_):.0f} ms, P10/P90 {np.percentile(v_, 10):.0f}/{np.percentile(v_, 90):.0f}")
        aus = [o for o in out if o["r"] >= 0.2 and abs(o["off_ms"] - med) > 3000]
        print(f"Ausreisser (> 3 s vom Median): {len(aus)}")
        for o in aus[:25]:
            print("  ", o)


if __name__ == "__main__":
    main()
