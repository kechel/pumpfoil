"""15.11.2026 (Hinweis eines Nutzers): eine Session ohne Laeufe mitten in einem Spot bekam den Geocoder-Namen des
Nachbarorts und stand als eigener Marker auf der Karte. Sie traegt jetzt den Namen des Spots, in dem sie startet (ohne
spot_id). Dazu: Marker-Position eines Spots von Hand (spots.marker_lat/lon) statt des Mittels der Starts."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app import models, spots
from app.db import SessionLocal

STEG = (54.76300, 17.65500)


def _track(start):
    return [(start[0] + i * 0.0002, start[1]) for i in range(10)]


def _session(db, uid, start, runs):
    s = models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime.now(timezone.utc), user_id=uid,
                       status="analyzed", is_pumpfoil=True, place_lat=start[0], place_lon=start[1])
    db.add(s); db.flush()
    db.add(models.AnalysisResult(session_id=s.id, num_runs=runs, algo_version="test"))
    db.flush()
    return s


def test_ohne_laeufe_im_spot_traegt_dessen_namen_und_marker_von_hand(client, monkeypatch):
    import app.api.community as C
    db = SessionLocal()
    u = models.User(email="ohne-laeufe@spot.example.com", password_hash="x")
    db.add(u); db.flush()
    geo: dict[int, list] = {}
    monkeypatch.setattr(spots, "_session_geom",
                        lambda _db, s: spots.SessionGeom(sid=s.id, points=geo[s.id], dist_m=200, start=geo[s.id][0])
                        if s.id in geo else None)
    monkeypatch.setattr(spots, "name_for", lambda lat, lon, land=False: ("Nachbarort", "venue", None))

    def neu(start, runs):
        s = _session(db, u.id, start, runs)
        geo[s.id] = _track(start)
        db.refresh(s)
        spots.assign_one(db, s)
        db.refresh(s)
        return s

    mit = neu(STEG, 3)
    sp = db.get(models.Spot, mit.spot_id)
    spots.rename_spot_row(db, sp, "Seespot")
    db.commit()
    ohne = neu((STEG[0] + 0.0001, STEG[1]), 0)
    assert ohne.spot_id is None and ohne.place_name == "Seespot"
    weit = neu((STEG[0] + 0.2, STEG[1]), 0)                 # ~22 km weg: Geocoder wie bisher
    assert weit.place_name == "Nachbarort"

    def eintrag():
        return next(e for e in C._spot_eintraege(db, None, False, "all") if e["spot_id"] == sp.id)

    assert abs(eintrag()["lat"] - STEG[0]) < 0.01           # Mittel der Starts
    sp.marker_lat, sp.marker_lon = 54.7679, 17.5437
    db.commit()
    e = eintrag()
    assert (e["lat"], e["lon"]) == (54.7679, 17.5437)
    db.close()
