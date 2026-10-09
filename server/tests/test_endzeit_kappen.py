"""Endzeit weit hinter den Daten wird beim Abschluss aufs Datenende gesetzt (09.10.2026).

Anlass #14325: iPhone-Handy-Recorder, Akku leer nach 13,7 h, Abschluss sechs Tage spaeter mit
„jetzt" als Ende -> ueberall gut 150 h Dauer. Eine echte (gemeldete) Pause bleibt unangetastet."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _geraet(client, mail):
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    return {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}


START = datetime(2026, 10, 3, 10, 48, 34, tzinfo=timezone.utc)


def _session(client, dev, uuid, ende, pauses=None, minuten=30):
    assert client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": uuid, "started_at": START.isoformat()}).status_code == 200
    pts = [[i * 1000, 47.81, 9.37, 0, 4.0] for i in range(minuten * 60)]
    r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                    json={"index": 0, "kind": "gps", "encoding": "json", "data": pts})
    assert r.status_code == 200, r.text
    body = {"total_chunks": 1, "ended_at": ende.isoformat()}
    if pauses:
        body["pauses"] = pauses
    assert client.post(f"/api/ingest/session/{uuid}/complete", headers=dev, json=body).status_code == 200
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Session).filter_by(session_uuid=uuid).one().ended_at
    finally:
        db.close()


def test_ende_tage_hinter_den_daten_wird_gekappt(client):
    dev = _geraet(client, "ende1@b.de")
    e = _session(client, dev, "ende-1", START + timedelta(days=6))
    assert e == START + timedelta(milliseconds=(30 * 60 - 1) * 1000)


def test_normales_ende_bleibt(client):
    dev = _geraet(client, "ende2@b.de")
    gemeldet = START + timedelta(minutes=35)          # 5 min nach dem letzten Punkt: normal
    assert _session(client, dev, "ende-2", gemeldet) == gemeldet


def test_gemeldete_lange_pause_bleibt(client):
    dev = _geraet(client, "ende3@b.de")
    # 2 h Pause nach 10 min: Wanduhr-Ende = 30 min Daten + 2 h Pause
    gemeldet = START + timedelta(minutes=30, hours=2)
    assert _session(client, dev, "ende-3", gemeldet, pauses=[[600_000, 7_200_000]]) == gemeldet
