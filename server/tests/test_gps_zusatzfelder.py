"""GPS-Punkte mit Zusatzfeldern 7-9 (iPhone-Recorder ab 1.1.41: speedAccuracy, course,
courseAccuracy). Feld 1-6 behalten ihre Bedeutung; alles dahinter muss die Auswertung
unbeschadet durchlaufen (29.09.2026)."""
import uuid as _uuid

from test_api import _accel_chunk_b64


def _gps9(n=120, v=4.0):
    out = []
    for i in range(n):
        out.append([i * 1000, 47.86 + i * v / 111320.0, 9.38, v, 0, 5.0, 0.4 if i % 7 else -1.0, 12.5, 3.0])
    return out


def test_neun_felder_werden_ausgewertet(client):
    mail = f"gps9-{_uuid.uuid4().hex[:8]}@test.de"
    jwt = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {jwt}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    sid = f"gps9-{_uuid.uuid4().hex[:8]}"
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": sid, "started_at": "2026-09-29T09:00:00Z"})
    r = client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": [
        {"index": 0, "kind": "gps", "encoding": "json", "t0_ms": 0, "count": 120, "data": _gps9()},
        {"index": 1, "kind": "accel", "encoding": "int16-b64", "t0_ms": 0, "count": 3000,
         "data": _accel_chunk_b64(n=3000)},
    ]})
    assert r.status_code == 200 and r.json()["ok"], r.text
    r = client.post(f"/api/ingest/session/{sid}/complete", headers=dev,
                    json={"ended_at": "2026-09-29T09:02:00Z", "total_chunks": 2})
    assert r.status_code == 200, r.text
    s_id = r.json()["session_id"]
    s = client.get(f"/api/sessions/{s_id}", headers=auth).json()
    assert s["status"] == "analyzed"
    assert s["analysis"]["total_distance_m"] > 0
    raw = client.get(f"/api/sessions/{s_id}/raw", headers=auth)
    assert raw.status_code == 200 and len(raw.json()["gps_t_ms"]) == 120
    # Rohdaten behalten die Zusatzfelder
    from app import storage
    assert len(storage.load_gps(sid)[0]) == 9
