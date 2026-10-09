"""„Speicher voll" von der Amazfit-Uhr (Zepp ab 1.0.14, 09.10.2026): dieselben Parameter wie Garmin
(`sf=1&kb=…`). Der Server zaehlt und merkt sich das groesste Volumen — schaltet aber fuer Zepp NICHTS
um (Speicher sparen, Ablage-Budget und GPS-only sind Garmin-Automatiken). Erst messen, dann entscheiden."""
from __future__ import annotations


def _paar(client, kennung: str):
    # Eigene Kopie statt `from tests.test_gps_sparen import _paar`: `tests` ist kein Paket, das
    # ging nur lokal durch und brach in der CI mit „No module named 'tests'" (09.10.2026).
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Garmin"}).json()
    return auth, {"X-Device-Token": paar["device_token"]}


def _zepp(client, dev, extra=""):
    r = client.get(f"/api/devices/config?p=zepp&v=1.0.14&pn=Amazfit%20Balance%202{extra}", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def test_zepp_meldet_speicher_voll(client):
    from app import models
    from app.db import SessionLocal
    auth, dev = _paar(client, "zsf-1")
    _zepp(client, dev)
    _zepp(client, dev, "&sf=1&kb=464")
    _zepp(client, dev, "&sf=1&kb=300")          # kleinerer Wert ueberschreibt nicht
    db = SessionLocal()
    try:
        d = db.query(models.DeviceToken).filter_by(token=dev["X-Device-Token"]).one()
        assert d.platform == "zepp"
        assert d.storage_full_kb == 464
        assert d.storage_full_count == 1, "zwei Meldungen kurz hintereinander = ein Ereignis (entprellt)"
    finally:
        db.close()
    g = client.get("/api/devices/list", headers=auth).json()[0]
    assert g["storage_full_kb"] == 464
    # keine Garmin-Automatik fuer Zepp
    assert g["gps_sparen_moeglich"] is False and g["speicher_kb"] == 0
    assert "gpsSparen" not in _zepp(client, dev) or _zepp(client, dev)["gpsSparen"] is False
