"""GPS nur um bewegte Abschnitte speichern (Garmin 96/128-KB-Uhren ab 1.0.92, Jan 09.10.2026):
Standard an, je Uhr in „Meine Uhren" abschaltbar; die Uhr bekommt den Wert ueber /config."""
from __future__ import annotations


def _paar(client, kennung: str):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Garmin"}).json()
    return auth, {"X-Device-Token": paar["device_token"]}


def _config(client, dev):
    r = client.get("/api/devices/config?p=garmin&v=1.0.92", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def test_je_uhr_umschaltbar(client):
    auth, dev = _paar(client, "gs-1")
    # ohne Modell/Messung (Testgeraet): Voreinstellung aus
    assert _config(client, dev)["gpsSparen"] is False
    g = client.get("/api/devices/list", headers=auth).json()[0]
    assert g["gps_sparen"] is False
    for an in (False, True, False):
        r = client.put(f"/api/devices/{g['id']}/gps-sparen", headers=auth, json={"gps_sparen": an})
        assert r.status_code == 200, r.text
        assert _config(client, dev)["gpsSparen"] is an
        assert client.get("/api/devices/list", headers=auth).json()[0]["gps_sparen"] is an


def test_unsinn_und_fremde_uhr_abgewiesen(client):
    auth, _ = _paar(client, "gs-2")
    gid = client.get("/api/devices/list", headers=auth).json()[0]["id"]
    assert client.put(f"/api/devices/{gid}/gps-sparen", headers=auth, json={"gps_sparen": "ja"}).status_code == 400
    fremd, _ = _paar(client, "gs-3")
    assert client.put(f"/api/devices/{gid}/gps-sparen", headers=fremd, json={"gps_sparen": False}).status_code == 404


def test_voreinstellung_nach_gemessener_ablage(client):
    """Eine Uhr mit viel RAM, aber kleiner Ablage (fenix 5X: voll bei 180 KB) bekommt es von selbst;
    ein Geraet desselben Modells, das selbst nie voll lief, ebenfalls."""
    from app import models
    from app.db import SessionLocal
    auth_a, dev_a = _paar(client, "gs-4")
    auth_b, dev_b = _paar(client, "gs-5")
    db = SessionLocal()
    try:
        for d in db.query(models.DeviceToken).filter(models.DeviceToken.token.in_([dev_a["X-Device-Token"], dev_b["X-Device-Token"]])):
            d.platform = "garmin"; d.part_number = "006-TEST-5X"
        db.query(models.DeviceToken).filter_by(token=dev_a["X-Device-Token"]).one().storage_full_kb = 180
        db.commit()
    finally:
        db.close()
    assert _config(client, dev_a)["gpsSparen"] is True
    assert _config(client, dev_b)["gpsSparen"] is True, "gleiches Modell, selbst nie voll"
    g = client.get("/api/devices/list", headers=auth_b).json()[0]
    assert g["gps_sparen_standard"] is True and g["gps_sparen_moeglich"] is True
    r = client.put(f"/api/devices/{g['id']}/gps-sparen", headers=auth_b, json={"gps_sparen": False})
    assert r.status_code == 200 and _config(client, dev_b)["gpsSparen"] is False, "eigene Wahl schlaegt die Voreinstellung"
