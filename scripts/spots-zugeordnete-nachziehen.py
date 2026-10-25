#!/usr/bin/env python3
"""Spots fuer Sessions nachziehen, die einer anderen Sportart zugeordnet sind (spots.spot_berechtigt, Jans OK 25.10.2026).

Bis 25.10.2026 bekam nur `is_pumpfoil` einen Spot; schnelle Wing-/Kite-Sessions ohne Accel (gps_only, > 30 km/h) blieben
ohne. Dieses Skript ordnet die Bestands-Sessions ohne Spot zu, die nach der neuen Regel einen bekommen (assign_one,
committet je Session). Vorher Sicherung der spots-Tabelle und der Spot-Felder der betroffenen Sessions.

    cd server && .venv/bin/python ../scripts/spots-zugeordnete-nachziehen.py          # nur zaehlen
    cd server && .venv/bin/python ../scripts/spots-zugeordnete-nachziehen.py --echt
"""
import datetime
import json
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "server"))
from app import models  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.spots import assign_one, zugeordnet_cond  # noqa: E402

db = SessionLocal()
S, A = models.Session, models.AnalysisResult
ids = [i for (i,) in db.query(S.id).join(A, A.session_id == S.id)
       .filter(S.deleted.isnot(True), S.spot_id.is_(None), S.place_lat.isnot(None), A.num_runs > 0,
               S.is_pumpfoil.isnot(True), zugeordnet_cond())
       .order_by(S.started_at.asc()).all()]
spots_vorher = db.query(models.Spot).filter(models.Spot.merged_into.is_(None)).count()
print(f"{len(ids)} Sessions ohne Spot, aktive Spots vorher: {spots_vorher}")
if "--echt" not in sys.argv:
    sys.exit(0)

sich = pathlib.Path("data/sicherung")
sich.mkdir(parents=True, exist_ok=True)
tag = datetime.date.today().isoformat()
spalten = [c.name for c in models.Spot.__table__.columns]
(sich / f"spots-vor-zugeordnete-{tag}.json").write_text(json.dumps(
    [{c: getattr(sp, c) for c in spalten} for sp in db.query(models.Spot).all()], default=str))
(sich / f"sessions-spotfelder-vor-zugeordnete-{tag}.json").write_text(json.dumps(
    [{"id": s.id, "spot_id": s.spot_id, "place_name": s.place_name, "place_water": s.place_water}
     for s in db.query(S).filter(S.id.in_(ids)).all()], default=str))
print("Sicherung in", sich)

ok = fehler = 0
for n, sid in enumerate(ids, 1):
    s = db.get(S, sid)
    try:
        assign_one(db, s)
        ok += s.spot_id is not None
    except Exception as e:   # einzelne Session darf den Lauf nicht beenden
        db.rollback()
        fehler += 1
        print("Fehler", sid, type(e).__name__)
    if n % 50 == 0:
        print(n, "/", len(ids), flush=True)
spots_nachher = db.query(models.Spot).filter(models.Spot.merged_into.is_(None)).count()
print(f"fertig: {ok} mit Spot, {fehler} Fehler, aktive Spots {spots_vorher} -> {spots_nachher}")
