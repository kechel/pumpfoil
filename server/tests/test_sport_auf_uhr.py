"""Sportart an der Uhr waehlen (19.10.2026): Liste nur auf Nachfrage, Wahl landet als owner."""
from datetime import datetime, timezone


def _konto(client, name):
    r = client.post("/api/auth/register", json={"email": f"{name}@uhr.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    tok = client.post("/api/devices/pair", json={"code": code}).json()["device_token"]
    return auth, {"X-Device-Token": tok}


def test_liste_nur_mit_sp(client):
    auth, dev = _konto(client, "sportliste")
    client.put("/api/settings", headers=auth, json={"default_sport_class": "wingfoil"})
    ohne = client.get("/api/devices/config?p=garmin&v=1.0.94", headers=dev).json()
    assert "sports" not in ohne            # ausgelieferte Uhren: kein Byte mehr
    mit = client.get("/api/devices/config?p=garmin&v=1.0.95&sp=1", headers=dev).json()
    assert mit["sports"][0] == {"id": "wingfoil", "name": "Wingfoil"}


def test_gewaehlte_sportart_und_equipment(client):
    auth, dev = _konto(client, "sportwahl")
    client.put("/api/settings", headers=auth, json={"equipment_je_sport": {"kitefoil": {"mast_len_cm": 100}}})
    r = client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": "uhrsport1", "started_at": datetime.now(timezone.utc).isoformat(),
        "sport_class": "kitefoil"})
    assert r.status_code == 200, r.text
    from app.db import SessionLocal
    from app.models import Session as S
    db = SessionLocal()
    try:
        s = db.query(S).filter_by(session_uuid="uhrsport1").one()
        assert (s.sport_class, s.sport_source, s.mast_len_cm) == ("kitefoil", "owner", 100)
    finally:
        db.close()
    # Unbekannte Sportart wird ignoriert
    r = client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": "uhrsport2", "started_at": datetime.now(timezone.utc).isoformat(), "sport_class": "quatsch"})
    assert r.status_code == 200
