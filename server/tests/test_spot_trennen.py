"""Von Hand getrennte Spots (Jan, 23.10.2026, Roman u244): zwei Stege 350 m auseinander. Die Track-Puffer
ueberlappen; nach dem Trennen muss eine neue Session vom zweiten Steg dort landen, und weder die laufende
Zuordnung noch `repair` duerfen die beiden wieder zusammenlegen."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app import models, spots
from app.db import SessionLocal

A = (42.43900, 18.68950)          # Steg A
B = (42.44047, 18.68570)          # Steg B, ~350 m daneben


def _track(start):
    # kurze Fahrt 200 m nach Norden ab dem Steg
    return [(start[0] + i * 0.0002, start[1]) for i in range(10)]


def _session(db, uid, start):
    s = models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime.now(timezone.utc), user_id=uid,
                       is_pumpfoil=True, place_lat=start[0], place_lon=start[1])
    db.add(s); db.flush()
    db.add(models.AnalysisResult(session_id=s.id, num_runs=3, algo_version="test"))
    db.flush()
    return s


def test_trennen_bleibt_getrennt(client, monkeypatch):
    db = SessionLocal()
    u = models.User(email="trennen@spot.example.com", password_hash="x")
    db.add(u); db.flush()
    geo: dict[int, list] = {}
    monkeypatch.setattr(spots, "_session_geom",
                        lambda _db, s: spots.SessionGeom(sid=s.id, points=geo[s.id], dist_m=200, start=geo[s.id][0])
                        if s.id in geo else None)
    monkeypatch.setattr(spots, "name_for", lambda lat, lon: ("Ort", "venue", "Bucht"))

    def neu(start):
        s = _session(db, u.id, start)
        geo[s.id] = _track(start)
        db.refresh(s)
        spots.assign_one(db, s)
        db.refresh(s)
        return s

    a1, a2 = neu(A), neu(A)
    b1 = neu(B)
    assert a1.spot_id == a2.spot_id == b1.spot_id            # das war der Fehler: alles ein Spot
    alt = a1.spot_id
    sp_neu = spots.trennen(db, alt, [b1.id], name="Steg B", notiz="Test")
    db.commit()
    db.refresh(b1)
    assert b1.spot_id == sp_neu.id and b1.place_name == "Steg B"
    assert spots.getrennt(db, [alt, sp_neu.id])
    # neue Sessions: Steg B -> B, Steg A -> A (Start liegt in beiden Puffern, der naehere Steg zaehlt)
    b2, a3 = neu(B), neu(A)
    assert b2.spot_id == sp_neu.id and a3.spot_id == alt
    # Aufraeumen darf sie nicht wieder zusammenlegen
    rep = spots.repair(db, apply=True)
    assert db.get(models.Spot, sp_neu.id).merged_into is None and db.get(models.Spot, alt).merged_into is None
    assert any(e["into"] in (alt, sp_neu.id) for e in rep["needs_review"])
    db.close()
