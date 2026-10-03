#!/usr/bin/env python3
"""Gleitphasen der Uhr gegen die Physik: ohne Vortrieb wird ein Foil stetig langsamer. REIN LESEND.
Je Luecke >= 1 s zwischen zwei Pumps (gerechnet wie run_analysis, s. gleiten_pruefen.uhr_pumps):
GPS-Tempo (3-s-Median) am Anfang und am Ende der Luecke. Haelt oder steigt das Tempo ueber eine lange
„Gleitphase", gab es Vortrieb — also verpasste Pumps (oder Beine/Welle), kein Gleiten.
Stichprobe: Sessions, deren laengster gespeicherter Lauf eine Gleitphase >= MIN_GLIDE hat.
Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/gleiten_physik.py [--n 300] [--jobs 8]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import json
import pathlib
import sys
from multiprocessing import Pool
import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
KLASSEN = [(1, 2), (2, 3), (3, 5), (5, 10), (10, 15), (15, 999)]


def eine(sid):
    import logging
    logging.disable(logging.WARNING)
    from app.db import SessionLocal
    from app import models, storage
    from app.analysis.gps import _running_median
    import gleiten_pruefen as GP
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        g = storage.load_gps(s.session_uuid)
        t = np.array([float(r[0]) for r in g]); v = np.array([float(r[3]) if len(r) > 3 and r[3] is not None else np.nan for r in g])
        v = _running_median(np.nan_to_num(v), 3)
        out = []
        for t0, t1, ps in GP.uhr_pumps(db, sid):
            for k in range(ps.size - 1):
                d = (ps[k + 1] - ps[k]) / 1000.0
                if d >= 1.0:
                    va, vb = np.interp(ps[k], t, v), np.interp(ps[k + 1], t, v)
                    out.append((round(d, 2), round(float(va), 2), round(float(vb), 2)))
        return {"id": sid, "user": s.user_id, "luecken": out}
    except Exception as e:
        return {"id": sid, "fehler": repr(e)[:200]}
    finally:
        db.close()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=300); ap.add_argument("--jobs", type=int, default=8); ap.add_argument("--min", type=float, default=5)
    a = ap.parse_args()
    from app.db import SessionLocal, engine
    from sqlalchemy import text
    db = SessionLocal()
    ids = [r[0] for r in db.execute(text(
        "select a.session_id from analysis_results a join sessions s on s.id = a.session_id "
        "where a.metrics_json::jsonb ? 'v3' and not coalesce(s.deleted, false) "
        "and exists (select 1 from json_array_elements(a.segments_json::json) e where (e->>'longest_glide_s')::float >= :min) "
        "order by random() limit :n"), {"n": a.n, "min": a.min})]
    db.close(); engine.dispose()
    with Pool(a.jobs) as pool:
        R = pool.map(eine, ids, chunksize=4)
    L = [(d, va, vb, r["user"]) for r in R if "luecken" in r for d, va, vb in r["luecken"]]
    print(f"{len(ids)} Sessions, {len({x[3] for x in L})} Fahrer, {len(L)} Luecken >= 1 s, Fehler {sum('fehler' in r for r in R)}")
    print(f"{'Laenge':>9} {'Anzahl':>7} {'Tempo Anfang':>13} {'Ende':>6} {'Abnahme':>8} {'Tempo haelt/steigt':>19}")
    for lo, hi in KLASSEN:
        z = [x for x in L if lo <= x[0] < hi]
        if not z:
            continue
        va = np.median([x[1] for x in z]) * 3.6; vb = np.median([x[2] for x in z]) * 3.6
        haelt = np.mean([x[2] >= x[1] - 0.1 for x in z]) * 100
        print(f"{lo:>3}-{hi:<4}s {len(z):>7} {va:>10.1f} km/h {vb:>5.1f} {va - vb:>7.1f} {haelt:>17.0f} %")


if __name__ == "__main__":
    main()
