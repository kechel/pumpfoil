"""„Eingefrorene Ortung" nur bei Uhren melden, nicht bei Handy-Aufnahmen (15.10.2026).

Der Hinweis rät, das Handy nicht mit ans Wasser zu nehmen, damit die Uhr ihr eigenes GPS benutzt.
Bei einer Handy-Aufnahme ergibt das keinen Sinn — dort heißt „immer dieselbe Position" schlicht,
dass das Handy still lag (Jans iPhone-Test #16777, 24 min auf dem Tisch).
"""
from __future__ import annotations

import json


def _stehende_session(client, kennung: str, placement: str | None) -> int:
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair",
                                         json={"code": code, "label": "Test"}).json()["device_token"]}
    uuid = f"uuid-{kennung}"
    meldung = {"session_uuid": uuid, "started_at": "2026-10-15T04:30:00Z"}
    if placement:
        meldung["placement"] = placement
    client.post("/api/ingest/session", headers=dev, json=meldung)
    # 300 Fixes, alle exakt dieselbe Position, beste Genauigkeit.
    gps = [[i * 1000, 47.9, 9.35, 0.0, 0, 3.0] for i in range(300)]
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "gps", "encoding": "json", "data": gps})
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Session).filter_by(session_uuid=uuid).one().id
    finally:
        db.close()


def _frozen(sid: int) -> bool:
    from app import models
    from app.analysis import run_analysis
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        run_analysis(db, db.get(models.Session, sid), final=True)
        a = db.query(models.AnalysisResult).filter_by(session_id=sid).one()
        return json.loads(a.metrics_json)["gps_frozen"]
    finally:
        db.close()


def test_uhr_mit_stehender_position_wird_gemeldet(client):
    assert _frozen(_stehende_session(client, "frozen-uhr", None)) is True


def test_handy_mit_stehender_position_nicht(client):
    assert _frozen(_stehende_session(client, "frozen-handy", "phone")) is False
