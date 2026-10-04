#!/usr/bin/env python3
"""Grenzen je Sportart (gps.grenzen_fuer) gegen die alten Pumpfoil-Grenzen — REIN LESEND.
Je Wing/Kite/Parawing-Session die v2-Erkennung zweimal (alt: Pumpfoil-Band/-Spitze, neu: je
Sportart): Laeufe, Foil-Zeit, laengster Lauf, schnellster Lauf. run_analysis wird nie aufgerufen.
Aufruf (aus server/): DATABASE_URL=... nice .venv/bin/python ../scripts/sportgrenzen-regression.py --aus X.jsonl
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse, json, pathlib, sys
from multiprocessing import Pool
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))


def kz(segs):
    d = [s["duration_s"] for s in segs]
    v = [(s.get("max_speed_mps") or 0) * 3.6 for s in segs]
    return {"laeufe": len(segs), "foil_s": round(sum(d)), "laengster_s": round(max(d, default=0)),
            "vmax": round(max(v, default=0), 1)}


def eine(sid):
    import logging; logging.disable(logging.WARNING)
    from app.db import SessionLocal
    from app import models
    from app.analysis import gps as v1
    from app.analysis.detect_v2 import analyze_session_v2
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        judge = (s.sport_class or "pumpfoil") == "pumpfoil"
        alt = analyze_session_v2(s, judge_fremdkraft=judge, max_foil_speed=v1.MAX_FOIL_SPEED,
                                 run_max_kmh=v1.RUN_MAX_PLAUSIBLE_KMH)["segments"]
        neu = analyze_session_v2(s, judge_fremdkraft=judge)["segments"]
        return {"id": sid, "user": s.user_id, "sport": s.sport_class, "alt": kz(alt), "neu": kz(neu)}
    except Exception as e:
        return {"id": sid, "fehler": repr(e)[:200]}
    finally:
        db.rollback(); db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--aus", required=True); ap.add_argument("--jobs", type=int, default=12)
    a = ap.parse_args()
    from app.db import SessionLocal, engine
    from sqlalchemy import text
    db = SessionLocal()
    ids = [r[0] for r in db.execute(text("select id from sessions where not coalesce(deleted,false) and sport_class in ('wingfoil','kitefoil','parawing') order by id"))]
    db.close(); engine.dispose()
    with open(a.aus, "w") as f, Pool(a.jobs) as pool:
        for z in pool.imap_unordered(eine, ids, chunksize=4):
            f.write(json.dumps(z) + "\n")
    print("fertig", len(ids))
