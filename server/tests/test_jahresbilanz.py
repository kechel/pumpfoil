"""Jahresbilanz je Sportart (19.10.2026): eigene Sessions je Jahr und Sportart."""
from datetime import datetime, timezone


def test_jahresbilanz(client):
    r = client.post("/api/auth/register", json={"email": "bilanz@x.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/sessions/jahresbilanz", headers=auth).json() == {"jahre": []}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    t = datetime(2026, 7, 1, 10, tzinfo=timezone.utc).isoformat()
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": "bil1", "started_at": t})
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": "bil2", "started_at": t, "sport_class": "wingfoil"})
    j = client.get("/api/sessions/jahresbilanz", headers=auth).json()["jahre"]
    assert [x["jahr"] for x in j] == [2026]
    sp = {x["sport"]: x["sessions"] for x in j[0]["sportarten"]}
    assert sp == {"pumpfoil": 1, "wingfoil": 1}
