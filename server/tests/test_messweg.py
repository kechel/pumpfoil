"""Messweg nach Doku (Wear 1.2.40, 07.10.2026): die Uhr meldet im /complete, woher das GPS kam und
wie die Beschleunigung lief; die Config schickt die zwei Notschalter mit (Standard an)."""
from __future__ import annotations

import json


def _geraet(client, mail):
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    return auth, {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}


def test_complete_speichert_den_messweg(client):
    from app import models
    from app.db import SessionLocal
    _, dev = _geraet(client, "messweg@b.de")
    uuid = "messweg-uuid-1"
    assert client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": uuid, "started_at": "2026-10-07T09:00:00Z"}).status_code == 200
    r = client.post(f"/api/ingest/session/{uuid}/complete", headers=dev, json={
        "total_chunks": 0,
        "messweg": {"gps": "lm", "gps_neu": 2, "gps_wechsel": "tethered" + "x" * 200,
                    "accel": "batch", "fremd": "wird verworfen"}})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        s = db.query(models.Session).filter_by(session_uuid=uuid).one()
        mw = json.loads(s.messweg_json)
    finally:
        db.close()
    assert mw["gps"] == "lm" and mw["gps_neu"] == 2 and mw["accel"] == "batch"
    assert "fremd" not in mw and len(mw["gps_wechsel"]) == 60


def test_ohne_messweg_bleibt_das_feld_leer(client):
    from app import models
    from app.db import SessionLocal
    _, dev = _geraet(client, "messweg2@b.de")
    uuid = "messweg-uuid-2"
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": uuid, "started_at": "2026-10-07T09:00:00Z"})
    client.post(f"/api/ingest/session/{uuid}/complete", headers=dev, json={"total_chunks": 0})
    db = SessionLocal()
    try:
        assert db.query(models.Session).filter_by(session_uuid=uuid).one().messweg_json is None
    finally:
        db.close()


def test_config_schickt_die_notschalter(client):
    _, dev = _geraet(client, "messweg3@b.de")
    c = client.get("/api/devices/config?p=wear", headers=dev).json()
    assert c["accelBatch"] == "on" and c["gpsHs"] == "on"
