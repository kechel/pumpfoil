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


def test_meine_sportarten_aus_dem_profil(client):
    auth, dev = _konto(client, "meinesport")
    client.put("/api/settings", headers=auth, json={"default_sport_class": "pumpfoil",
                                                    "my_sports": ["wingfoil", "quatsch", "pumpfoil", "kitefoil"]})
    st = client.get("/api/settings", headers=auth).json()
    assert st["my_sports"] == ["wingfoil", "pumpfoil", "kitefoil"]
    ids = [x["id"] for x in client.get("/api/devices/config?p=wear&sp=1", headers=dev).json()["sports"]]
    assert ids == ["pumpfoil", "wingfoil", "kitefoil"]


def test_suunto_sportmodus_zuordnung(client):
    """Suunto: Sportmodus der Uhr (Kitesurfing = 91 auf der Uhr, 87 in der Cloud) -> Zuordnung des Nutzers."""
    auth, dev = _konto(client, "suuntomodus")
    t = datetime.now(timezone.utc).isoformat()
    # Ohne Zuordnung: Standard-Sportart, aber der Modus erscheint in der Modusliste
    r = client.post("/api/ingest/session", headers=dev, json={"session_uuid": "suuntomod1", "started_at": t,
                                                              "suunto_aktivitaet": 91})
    assert r.status_code == 200, r.text
    from app.db import SessionLocal
    from app.models import Session as S
    db = SessionLocal()
    try:
        assert db.query(S).filter_by(session_uuid="suuntomod1").one().sport_class == "pumpfoil"
    finally:
        db.close()
    liste = client.get("/api/integrations/suunto/sports", headers=auth).json()["sports"]
    assert any(x["sport_key"] == "87" for x in liste)
    # Zuordnung setzen (ungueltiges wird verworfen) -> naechste Aufnahme bekommt kitefoil als owner
    client.put("/api/settings", headers=auth, json={"suunto_sport_je_modus": {"87": "kitefoil", "x": "wingfoil", "61": "quatsch"}})
    assert client.get("/api/settings", headers=auth).json()["suunto_sport_je_modus"] == {"87": "kitefoil"}
    r = client.post("/api/ingest/session", headers=dev, json={"session_uuid": "suuntomod2", "started_at": t,
                                                              "suunto_aktivitaet": 91})
    db = SessionLocal()
    try:
        s = db.query(S).filter_by(session_uuid="suuntomod2").one()
        assert (s.sport_class, s.sport_source) == ("kitefoil", "owner")
    finally:
        db.close()
