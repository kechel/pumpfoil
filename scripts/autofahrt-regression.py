#!/usr/bin/env python3
"""Autofahrt-Erkennung (app/analysis/autofahrt.py) ueber den ganzen Bestand. REIN LESEND.
Je Session: gefundene Fahrten (Spitze, Dauer, betroffene gespeicherte Laeufe) und die hoechste
5-Punkt-Geschwindigkeit AUSSERHALB der Fahrten (zeigt, wie nah echtes Fahren an die Schwelle kommt).
Aufruf (aus server/): DATABASE_URL=... nice .venv/bin/python ../scripts/autofahrt-regression.py --aus X.jsonl [--jobs 12]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse, json, pathlib, sys
from multiprocessing import Pool
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))


def eine(sid):
    from app.db import SessionLocal
    from app import models, storage
    from app.analysis import autofahrt as A
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        g = storage.load_gps(s.session_uuid)
        if len(g) < 20:
            return None
        sp = A.spitze_fuer(s.sport_class)
        f = A.fahrten(g, sp) if sp is not None else []
        t, v = A._tempo_kmh(g)
        v5 = v
        m = np.ones(len(t), bool)
        for a, b, _ in f:
            m &= ~((t >= a) & (t <= b))
        segs = json.loads(s.result.segments_json) if s.result and s.result.segments_json else []
        off = s.trim_start_ms or 0
        laeufe = [(g2.get("t_start_session_ms", g2["t_start_ms"] + off), g2.get("t_end_session_ms", g2["t_end_ms"] + off)) for g2 in segs]
        return {"id": sid, "user": s.user_id, "sport": s.sport_class,
                "rest_max": round(float(v5[m].max()), 1) if m.any() else None,
                "fahrten": [{"a": a, "b": b, "spitze": p, "min": round((b - a) / 60000, 1),
                             "laeufe": sum(1 for x, y in laeufe if x < b and y > a)} for a, b, p in f]}
    except Exception as e:
        return {"id": sid, "fehler": repr(e)[:200]}
    finally:
        db.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--aus", required=True); ap.add_argument("--jobs", type=int, default=12)
    a = ap.parse_args()
    from app.db import SessionLocal, engine
    from sqlalchemy import text
    db = SessionLocal()
    ids = [r[0] for r in db.execute(text("select id from sessions where not coalesce(deleted,false) order by id"))]
    db.close(); engine.dispose()
    with open(a.aus, "w") as f, Pool(a.jobs) as pool:
        for z in pool.imap_unordered(eine, ids, chunksize=8):
            if z: f.write(json.dumps(z) + "\n")
    print("fertig", len(ids))
