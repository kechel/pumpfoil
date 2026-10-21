"""Tanz-Variante der Garmin-App (watch-dance/, Jan 16.10.2026): kein GPS, Puls im eigenen Kanal
`hr`, Gyro wie beim Handy. Die Session landet als „other" in der normalen Liste, ohne Spot."""
import base64
import json
import math
import struct


def _konto(client):
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "tanz@b.de", "password": "supersecret"}).json()["access_token"]}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    return auth, uhr


def test_tanz_session_ohne_gps(client):
    from app.db import SessionLocal
    from app import models, storage
    auth, uhr = _konto(client)
    uuid = "dance-test-1"
    assert client.post("/api/ingest/session", headers=uhr, json={
        "session_uuid": uuid, "started_at": "2026-10-15T20:00:00Z", "sport": "dance",
        "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000}).status_code == 200
    n = 120
    hr = [[i * 1000, 95 + (i % 30)] for i in range(n)]
    assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
        "index": 0, "kind": "hr", "encoding": "json", "data": hr}).status_code == 200
    # kaputte Puls-Zeilen werden abgelehnt (ohne Zeit, Text statt Zahl)
    for kaputt in ([[None, 90]], [[0, "90"]], [[0]], [5]):
        assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
            "index": 1, "kind": "hr", "encoding": "json", "data": kaputt}).status_code == 400
    # ab Tanz-App 0.6: [t_ms, puls, kurs, kadenz, schritte], fehlende Werte null (TanzSensoren.mc)
    assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
        "index": 1, "kind": "hr", "encoding": "json",
        "data": [[n * 1000, None, None, None, 4711], [n * 1000 + 1000, 120, 271, 96, 4712]]}).status_code == 200
    vals = []
    for i in range(n * 25):
        t = i / 25.0
        vals += [int(300 * math.sin(t * 6)), int(200 * math.cos(t * 4)), 1000 + int(150 * math.sin(t * 8))]
    raw = base64.b64encode(struct.pack("<%dh" % len(vals), *vals)).decode()
    for kind in ("accel", "gyro"):
        assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
            "index": 0, "kind": kind, "encoding": "int16-b64", "t0_ms": 0, "data": raw}).status_code == 200
    r = client.post(f"/api/ingest/session/{uuid}/complete", headers=uhr,
                    json={"total_chunks": 1})          # die Garmin-App schickt kein Ende
    assert r.status_code == 200

    db = SessionLocal()
    s = db.query(models.Session).filter_by(session_uuid=uuid).one()
    assert (s.sport, s.sport_class, s.sport_source) == ("dance", "other", "owner")
    assert s.status == "analyzed" and s.spot_id is None
    # Endzeit aus dem letzten Puls-Zeitstempel (ohne GPS gaebe es sonst keine)
    assert (s.ended_at - s.started_at).total_seconds() == n + 1   # letzte Zeile: Chunk 1, auch ohne Puls
    assert json.loads((storage.session_dir(uuid) / "hr" / "0.json").read_text()) == hr
    kinds = {k for (k,) in db.query(models.IngestChunk.kind).filter_by(session_id=s.id)}
    assert kinds == {"hr", "accel", "gyro"}
    sid = s.id
    db.close()
    # steht in der normalen Liste, nicht bei den Aussortierten
    assert sid in [x["id"] for x in client.get("/api/sessions?filter=pump", headers=auth).json()]
    assert sid not in [x["id"] for x in client.get("/api/sessions?filter=other", headers=auth).json()]
