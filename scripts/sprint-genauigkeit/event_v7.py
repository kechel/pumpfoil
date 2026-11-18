"""Was-waere-wenn: Event-Sprint-Wertungen V6 vs V7 (rein lesend, rollback)."""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(sys.argv[0])))
import v7 as V7
V7.install()
from app.db import SessionLocal
from app import models, storage, teams as T, event_laeufe as EL
from app.analysis import sprint as SP
from app.analysis.gps import grenzen_fuer

db = SessionLocal()
db.commit = lambda: (_ for _ in ()).throw(RuntimeError("kein commit erlaubt"))
cache = {}
TOL = [None]
orig_werte = EL.werte

def neu_json(s):
    key = (s["id"], TOL[0])
    if key not in cache:
        se = db.get(models.Session, s["id"])
        segs = json.loads(s.get("segments_json") or "[]")
        plat = (db.get(models.DeviceToken, se.device_id).platform if se.device_id and db.get(models.DeviceToken, se.device_id) else None) or se.session_uuid[:4]
        V7.CFG["W"] = None if (TOL[0] == "v6" or (TOL[0] == "v7a" and plat == "apple")) else 0.5
        try:
            erg = SP.session_sprints(storage.load_gps(se.session_uuid, roh=True) if segs else [], segs,
                                     int(s.get("trim") or 0), max_mps=grenzen_fuer(se.sport_class)[1] / 3.6)
        finally:
            V7.CFG["W"] = None
        cache[key] = json.dumps(erg)
    return cache[key]

def werte(kennzahl, sessions, zaehl, pg):
    if kennzahl.startswith("sprint_") and TOL[0] is not None:
        sessions = [{**s, "sprint_json": neu_json(s)} if zaehl.get(s["id"]) else s for s in sessions]
    return orig_werte(kennzahl, sessions, zaehl, pg)
EL.werte = werte
T._cache_holen = lambda key: None
T._cache_setzen = lambda *a, **k: None if False else None

ergebnis = {}
for eid in map(int, sys.argv[1:]):
    e = db.get(models.TeamEvent, eid)
    t = db.get(models.Team, e.team_id)
    for tol in (None, "v6", "v7", "v7a"):
        TOL[0] = tol
        voll = T._event_voll(db, t, e, frisch=True)
        for tf in voll:
            if not (tf.get("kennzahl") or "").startswith("sprint_"):
                continue
            ergebnis.setdefault((eid, tf["kennzahl"], tf.get("sportart")), {})[str(tol)] = [
                (z["user_id"], z["value"]) for z in tf.get("zeilen") or []]
    db.rollback()
out = {f"{k[0]}|{k[1]}|{k[2]}": v for k, v in ergebnis.items()}
print(json.dumps(out)); print("cache", len(cache), file=sys.stderr)
