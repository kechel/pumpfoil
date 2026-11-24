"""Zepp-Sammel-Upload (24.11.2026): `uploadBatch` geht nur an Zepp-Uhren, und der Sammel-Endpunkt nimmt die Chunks an."""
from __future__ import annotations

from app.api import devices


def _paar(client, kennung: str):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Uhr"}).json()
    return {"X-Device-Token": paar["device_token"]}


def test_upload_batch_nur_fuer_zepp(client):
    zepp = _paar(client, "zb-zepp")
    r = client.get("/api/devices/config?p=zepp&v=1.0.18", headers=zepp)
    assert r.status_code == 200, r.text
    assert r.json()["uploadBatch"] == devices.ZEPP_UPLOAD_SAMMEL == 25
    garmin = _paar(client, "zb-garmin")
    r = client.get("/api/devices/config?p=garmin&v=1.0.105", headers=garmin)
    assert r.status_code == 200, r.text
    assert "uploadBatch" not in r.json()


def test_sammel_endpunkt_mit_zehn_accel_chunks(client):
    dev = _paar(client, "zb-sammel")
    client.get("/api/devices/config?p=zepp&v=1.0.18", headers=dev)
    uuid = "zb-sammel-1"
    r = client.post("/api/ingest/session", headers=dev, json={"session_uuid": uuid, "started_at": "2026-11-24T10:00:00Z",
                                                              "sport": "pumpfoil", "gps_hz": 1, "accel_hz": 100, "accel_scale": 2048})
    assert r.status_code in (200, 201), r.text
    import base64
    data = base64.b64encode(bytes(range(256)) * 3).decode()   # 768 Byte = 128 Proben int16 x/y/z
    chunks = [{"index": i, "kind": "accel", "encoding": "int16-b64", "t0_ms": i * 1280, "count": 128, "data": data}
              for i in range(10)]
    r = client.post(f"/api/ingest/session/{uuid}/chunks", headers=dev, json={"chunks": chunks})
    assert r.status_code == 200, r.text
    assert sorted(r.json()["received"]) == list(range(10)) and r.json()["ok"] is True
