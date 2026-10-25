#!/usr/bin/env python3
"""Front-Start-Prototyp (anlauf.py) ueber den Bestand — REIN LESEND (25.10.2026).

Je Sportart eine Stichprobe mit Accel: Anlaeufe je Stunde; bei Pumpfoil zusaetzlich, wie viele Anlaeufe an einem
erkannten Lauf-Start liegen (-8..+3 s) und wie viele Laeufe einen Anlauf haben (Front-Start-Fahrer vs. andere).
Fehltreffer-Mass: Anlaeufe je Stunde in Sportarten ohne Front-Start (other = Wandern/Rad/Laufen, Wind, Welle).

    cd server && DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/frontstart/bestand.py [--n 120]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import json
import logging
import multiprocessing as mp
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, ".")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def _init():
    logging.disable(logging.WARNING)


def eine(sid):
    from anlauf import anlaeufe
    from app import models, storage
    from app.analysis.foil_model import magnitude_g
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        acc = storage.load_accel(s.session_uuid)
        t0 = storage.load_accel_t0(s.session_uuid)
        if len(acc) < 2000 or not t0:
            return None
        dauer = max(t0.values()) / 1000.0
        if dauer < 120:
            return None
        hz = len(acc) / dauer
        al = anlaeufe(magnitude_g(acc, s.accel_scale), hz)
        r = db.query(models.AnalysisResult).filter_by(session_id=sid).first()
        segs = json.loads(r.segments_json or "[]") if r else []
        trim = (s.trim_start_ms or 0) / 1000.0
        starts = np.array([g["t_start_ms"] / 1000.0 + trim for g in segs if g.get("t_start_ms") is not None])
        an_lauf = sum(1 for a, b, *_ in al if starts.size and np.any((starts - b > -3) & (starts - b < 8)))
        laeufe_mit = sum(1 for st in starts if any(-3 < st - b < 8 for a, b, *_ in al))
        return {"id": sid, "uid": s.user_id, "sport": s.sport_class, "hz": round(hz), "h": dauer / 3600, "n": len(al),
                "an_lauf": an_lauf, "laeufe": len(starts), "laeufe_mit": laeufe_mit,
                "geraet": (s.device_model or "Garmin").split(" ·")[0]}
    except Exception as ex:
        return {"id": sid, "fehler": str(ex)[:80]}
    finally:
        db.rollback(); db.close()


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=120); ap.add_argument("--jobs", type=int, default=4)
    a = ap.parse_args()
    from app import models
    from app.db import SessionLocal
    db = SessionLocal(); S = models.Session
    ids = []
    try:
        for sp in ("pumpfoil", "other", "wingfoil", "kitefoil", "surf_wave", "foil_scoot", "efoil"):
            ids += [x[0] for x in db.query(S.id).filter(S.status == "analyzed", S.deleted.isnot(True),
                    S.merged_into.is_(None), S.sport_class == sp).order_by(S.id.desc()).limit(a.n)]
    finally:
        db.rollback(); db.close()
    with mp.get_context("spawn").Pool(a.jobs, initializer=_init) as pool:
        erg = [r for r in pool.imap_unordered(eine, ids, chunksize=4) if r and "fehler" not in r]
    je = defaultdict(list)
    for r in erg:
        je[r["sport"]].append(r)
    print(f"{len(erg)} Sessions mit Accel")
    for sp, rs in je.items():
        h = sum(r["h"] for r in rs); n = sum(r["n"] for r in rs)
        mit = sum(1 for r in rs if r["n"] > 0)
        z = f"  {sp:11} {len(rs):4} Sess {h:6.1f} h  Anlaeufe {n:5} = {n / h:5.1f}/h  Sessions mit >=1: {mit}"
        if sp == "pumpfoil":
            la = sum(r["laeufe"] for r in rs); lm = sum(r["laeufe_mit"] for r in rs); al = sum(r["an_lauf"] for r in rs)
            z += f"  | Laeufe {la}, davon mit Anlauf {lm}; Anlaeufe an Lauf {al}"
        print(z)
        for hz in sorted({r["hz"] // 25 * 25 for r in rs}):
            sub = [r for r in rs if r["hz"] // 25 * 25 == hz]
            hh = sum(r["h"] for r in sub); nn = sum(r["n"] for r in sub)
            print(f"      ~{hz:3} Hz: {len(sub):4} Sess  {nn / hh if hh else 0:5.1f}/h")
    top = sorted((r for r in erg if r["sport"] != "pumpfoil"), key=lambda r: -r["n"] / r["h"])[:10]
    print("hoechste Raten ausserhalb Pumpfoil:", [(r["id"], r["sport"], r["geraet"], r["n"], round(r["n"] / r["h"], 1)) for r in top])
    topp = sorted((r for r in erg if r["sport"] == "pumpfoil"), key=lambda r: -r["n"] / r["h"])[:12]
    print("hoechste Raten Pumpfoil:", [(r["id"], r["uid"], r["geraet"], r["n"], r["laeufe"], r["laeufe_mit"]) for r in topp])


if __name__ == "__main__":
    main()
