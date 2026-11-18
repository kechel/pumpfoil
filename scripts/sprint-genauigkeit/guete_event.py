import json, sys, numpy as np
sys.path.insert(0, sys.argv[1])
from guete import guete
from app.db import SessionLocal; from app import models, storage
from app.analysis import sprint as SP; from app.analysis.gps import grenzen_fuer
from sqlalchemy import text
db = SessionLocal()
ev = json.load(open(sys.argv[1] + "/event_v7.json"))
e = db.get(models.TeamEvent, 11)
out = {}
for kz in ("sprint_100m", "sprint_60s"):
    tab = ev[f"11|{kz}|pumpfoil"]["v6"]
    rows = []
    for rang, (uid, wert) in enumerate(tab, 1):
        best = None
        for (sid,) in db.execute(text("select id from sessions where user_id=:u and started_at < :b and coalesce(ended_at,started_at) > :a and deleted is not true and merged_into is null"), {"u": uid, "a": e.start - __import__("datetime").timedelta(hours=36), "b": e.ende + __import__("datetime").timedelta(hours=36)}).all():
            se = db.get(models.Session, sid); r = db.query(models.AnalysisResult).filter_by(session_id=sid).first()
            if not r: continue
            segs = json.loads(r.segments_json or "[]"); g = storage.load_gps(se.session_uuid, roh=True)
            erg = SP.session_sprints(g, segs, int(se.trim_start_ms or 0), max_mps=grenzen_fuer(se.sport_class)[1] / 3.6)
            for k, l in enumerate(erg["laeufe"]):
                if l and kz in l and abs(l[kz] - wert) < (best[5] if best else 0.3):
                    a, b = erg["laeufe_fenster"][k][kz]
                    seg = segs[k]; a0 = seg.get("t_start_session_ms"); b0 = seg.get("t_end_session_ms")
                    if a0 is None:
                        a0 = seg["t_start_ms"] + (se.trim_start_ms or 0); b0 = seg["t_end_ms"] + (se.trim_start_ms or 0)
                    P = np.array([[p[0] / 1000, p[1], p[2], p[3] if len(p) > 3 and p[3] is not None else np.nan] for p in g if a0 <= p[0] <= b0 and p[1] is not None], float)
                    q = guete(P[:, 0], P[:, 1], P[:, 2], P[:, 3])
                    dt = db.get(models.DeviceToken, se.device_id) if se.device_id else None
                    best = (sid, k, q, se.device_model or (dt.part_number if dt else "") or se.session_uuid[:4], (dt.platform if dt else se.session_uuid[:4]), abs(l[kz] - wert))
        name = db.get(models.User, uid).display_name
        rows.append((rang, name, wert * 3.6, best))
    out[kz] = [(r, n, w, b[0] if b else None, b[2] if b else None, b[3] if b else None, b[4] if b else None, b[5] if b else None) for r, n, w, b in rows]
json.dump(out, open(sys.argv[1] + "/guete_event.json", "w"), default=str)
