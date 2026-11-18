"""Trockenlauf V6 vs V7 ueber alle analysierten Sessions mit Sprintwerten (rein lesend). Ausgabe JSONL."""
import json, sys, os
from multiprocessing import Pool
sys.path.insert(0, os.path.dirname(__file__))
from sqlalchemy import text

OUT = sys.argv[1]


def init():
    global db, SP, V7, storage, grenzen_fuer, models
    from app.db import SessionLocal
    from app import models as M, storage as S
    from app.analysis import sprint as SP_
    from app.analysis.gps import grenzen_fuer as G
    import v7
    v7.install()
    db, SP, V7, storage, grenzen_fuer, models = SessionLocal(), SP_, v7, S, G, M


def eins(row):
    sid, uuid, sport, trim, segj, sj, plat = row
    try:
        segs = json.loads(segj or "[]")
        gps = storage.load_gps(uuid, roh=True) if segs else []
        mx = grenzen_fuer(sport)[1] / 3.6
        r = {"id": sid, "sport": sport, "plat": plat, "alt": (json.loads(sj) or {}).get("best", {})}
        for name, W in (("v6", None), ("v7", 0.5)):
            V7.CFG["W"] = W
            e = SP.session_sprints(gps, segs, int(trim or 0), max_mps=mx)
            r[name] = e["best"]
            r[name + "_l"] = [x for x in e["laeufe"]]
        return r
    except Exception as ex:
        return {"id": sid, "err": repr(ex)}


if __name__ == "__main__":
    from app.db import SessionLocal
    d = SessionLocal()
    rows = d.execute(text("""select s.id, s.session_uuid, s.sport_class, s.trim_start_ms, r.segments_json, r.sprint_json,
        coalesce(dt.platform, left(s.session_uuid,4)) from sessions s join analysis_results r on r.session_id=s.id
        left join device_tokens dt on dt.id=s.device_id
        where s.deleted is not true and s.merged_into is null and r.sprint_json is not null and r.num_runs>0""")).all()
    d.close()
    print(len(rows), "Sessions", file=sys.stderr)
    n = 0
    with Pool(3, initializer=init) as p, open(OUT, "w") as f:
        for r in p.imap_unordered(eins, [tuple(x) for x in rows], chunksize=8):
            f.write(json.dumps(r) + "\n"); n += 1
            if n % 500 == 0:
                print(n, file=sys.stderr, flush=True)
    print("fertig", n, file=sys.stderr)
