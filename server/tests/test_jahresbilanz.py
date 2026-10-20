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


def test_fremde_auswertung_nur_fuer_admin(client):
    """Admin-Kontrollansicht (20.10.2026): `?user_id=` liefert die Auswertung eines anderen Fahrers,
    aber nur einem Admin; alle anderen bekommen 403."""
    from app import models
    from app.db import SessionLocal

    def konto(mail):
        r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
        tok = r.json()["access_token"]
        auth = {"Authorization": f"Bearer {tok}"}
        return auth, client.get("/api/auth/me", headers=auth).json()["id"]

    fahrer, fid = konto("fahrer-bil@x.de")
    neugierig, _ = konto("neugierig-bil@x.de")
    admin, aid = konto("admin-bil@x.de")
    db = SessionLocal(); db.get(models.User, aid).is_admin = True; db.commit(); db.close()
    code = client.post("/api/devices/pairing-code", headers=fahrer).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    t = datetime(2026, 7, 1, 10, tzinfo=timezone.utc).isoformat()
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": "bil-a1", "started_at": t, "sport_class": "wingfoil"})
    for pfad in ("jahresbilanz", "manoever-verlauf"):
        assert client.get(f"/api/sessions/{pfad}?user_id={fid}", headers=neugierig).status_code == 403
        assert client.get(f"/api/sessions/{pfad}?user_id={fid}", headers=admin).status_code == 200
        assert client.get(f"/api/sessions/{pfad}?user_id=999999", headers=admin).status_code == 404
    j = client.get(f"/api/sessions/jahresbilanz?user_id={fid}", headers=admin).json()["jahre"]
    assert {x["sport"] for x in j[0]["sportarten"]} == {"wingfoil"}
    assert client.get("/api/sessions/jahresbilanz", headers=admin).json() == {"jahre": []}
