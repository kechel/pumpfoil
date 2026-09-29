"""Sammel-Upload `POST /api/ingest/session/{uuid}/chunks` (seit 29.09.2026).

Dieselben Chunks wie einzeln, nur in einer Anfrage — fuer Apple Watch und Wear OS, die per HTTPS
laden und das Garmin-BLE-Limit nicht haben (#10266: 1848 Anfragen fuer 2,2 MB, drei Tage)."""
import uuid as _uuid

from test_api import _accel_chunk_b64, _gps_chunk


def _geraet(client):
    mail = f"sammel-{_uuid.uuid4().hex[:8]}@test.de"
    jwt = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    code = client.post("/api/devices/pairing-code", headers={"Authorization": f"Bearer {jwt}"}).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    sid = f"sammel-{_uuid.uuid4().hex[:8]}"
    r = client.post("/api/ingest/session", headers=dev, json={"session_uuid": sid, "started_at": "2026-09-29T09:00:00Z"})
    assert r.status_code == 200, r.text
    return dev, sid, {"Authorization": f"Bearer {jwt}"}


def _chunks(n_paare):
    out = []
    for k in range(n_paare):
        out.append({"index": 2 * k, "kind": "accel", "encoding": "int16-b64", "t0_ms": k * 10000,
                    "count": 250, "data": _accel_chunk_b64(n=250)})
        out.append({"index": 2 * k + 1, "kind": "gps", "encoding": "json", "t0_ms": k * 10000,
                    "count": 10, "data": _gps_chunk(n=10)})
    return out


def test_sammel_upload_speichert_alle_und_quittiert_jeden(client):
    dev, sid, _ = _geraet(client)
    r = client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": _chunks(5)})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] and sorted(r.json()["received"]) == list(range(10)) and r.json()["failed"] == []
    # Resume sieht sie wie einzeln hochgeladene
    r = client.post("/api/ingest/session", headers=dev, json={"session_uuid": sid, "started_at": "2026-09-29T09:00:00Z"})
    assert sorted(r.json()["received_chunks"]) == list(range(10))


def test_kaputter_chunk_haelt_die_anderen_nicht_auf(client):
    dev, sid, _ = _geraet(client)
    ch = _chunks(2)
    ch[1]["data"] = "kein array"                         # gps muss eine Liste sein
    r = client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": ch})
    assert r.status_code == 200
    j = r.json()
    assert j["ok"] is False and sorted(j["received"]) == [0, 2, 3]
    assert [f["index"] for f in j["failed"]] == [1]


def test_erneut_gesendet_ist_idempotent(client):
    dev, sid, _ = _geraet(client)
    for _ in range(2):
        r = client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": _chunks(3)})
        assert r.status_code == 200
    r = client.post("/api/ingest/session", headers=dev, json={"session_uuid": sid, "started_at": "2026-09-29T09:00:00Z"})
    assert sorted(r.json()["received_chunks"]) == list(range(6))


def test_zu_viele_und_leer_werden_abgelehnt(client):
    from app.api.ingest import MAX_SAMMEL_CHUNKS
    dev, sid, _ = _geraet(client)
    zu_viel = _chunks(MAX_SAMMEL_CHUNKS // 2 + 1)
    assert client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": zu_viel}).status_code == 413
    assert client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": []}).status_code == 400


def test_sammel_und_einzeln_ergeben_dieselbe_session(client):
    dev, sid, auth = _geraet(client)
    client.post(f"/api/ingest/session/{sid}/chunks", headers=dev, json={"chunks": _chunks(3)})
    r = client.post(f"/api/ingest/session/{sid}/complete", headers=dev,
                    json={"ended_at": "2026-09-29T09:00:30Z", "total_chunks": 6})
    assert r.status_code == 200, r.text
    s = client.get(f"/api/sessions/{r.json()['session_id']}", headers=auth).json()
    assert s["status"] == "analyzed"
