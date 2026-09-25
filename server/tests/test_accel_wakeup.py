"""Wake-up-Sensor auf Wear OS: Geraete-Override vor Konto-Einstellung vor globalem Standard.

Eingefuehrt wird stufenweise (25.09.2026): der Standard steht auf "off", wer testen will, stellt
es im Profil je Uhr um — und muss auch wieder auf „Standard" zurueckkommen koennen, damit er
spaeter mitzieht, wenn der Standard umgestellt wird.
"""
from __future__ import annotations

from app.api import devices


def _paar(client, kennung: str):
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Wear OS"}).json()
    return auth, {"X-Device-Token": paar["device_token"]}


def _config(client, dev):
    r = client.get("/api/devices/config?p=wear&v=1.2.33", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def _geraet(client, auth):
    return client.get("/api/devices/list", headers=auth).json()[0]


def test_standard_ist_aus_waehrend_der_einfuehrung(client):
    assert devices.ACCEL_WAKEUP_DEFAULT == "off"
    auth, dev = _paar(client, "aw-default")
    assert _config(client, dev)["accelWakeup"] == "off"
    g = _geraet(client, auth)
    assert g["accel_wakeup"] is None
    assert g["accel_wakeup_standard"] == "off"


def test_je_geraet_umschaltbar_und_zurueck_auf_standard(client):
    auth, dev = _paar(client, "aw-geraet")
    gid = _geraet(client, auth)["id"]
    for modus in ("on", "off", "on"):
        r = client.put(f"/api/devices/{gid}/accel-wakeup", headers=auth, json={"accel_wakeup": modus})
        assert r.status_code == 200, r.text
        assert _config(client, dev)["accelWakeup"] == modus
        assert _geraet(client, auth)["accel_wakeup"] == modus
    r = client.put(f"/api/devices/{gid}/accel-wakeup", headers=auth, json={"accel_wakeup": "default"})
    assert r.status_code == 200, r.text
    assert _geraet(client, auth)["accel_wakeup"] is None
    assert _config(client, dev)["accelWakeup"] == devices.ACCEL_WAKEUP_DEFAULT


def test_konto_einstellung_greift_ohne_geraete_wert(client):
    """Die Konto-Einstellung ist der Weg fuer die Testgruppe — sie gilt, solange die Uhr nichts
    eigenes hat, und der Geraete-Wert schlaegt sie."""
    from app import models
    from app.db import SessionLocal
    import json

    auth, dev = _paar(client, "aw-konto")
    g = _geraet(client, auth)
    db = SessionLocal()
    try:
        uid = db.get(models.DeviceToken, g["id"]).user_id
        u = db.get(models.User, uid)
        s = json.loads(u.settings_json) if u.settings_json else {}
        s["accel_wakeup"] = "on"
        u.settings_json = json.dumps(s)
        db.commit()
    finally:
        db.close()
    assert _config(client, dev)["accelWakeup"] == "on"
    assert _geraet(client, auth)["accel_wakeup_standard"] == "on"
    client.put(f"/api/devices/{g['id']}/accel-wakeup", headers=auth, json={"accel_wakeup": "off"})
    assert _config(client, dev)["accelWakeup"] == "off"


def test_unsinn_wird_abgewiesen(client):
    auth, dev = _paar(client, "aw-unsinn")
    gid = _geraet(client, auth)["id"]
    client.put(f"/api/devices/{gid}/accel-wakeup", headers=auth, json={"accel_wakeup": "on"})
    r = client.put(f"/api/devices/{gid}/accel-wakeup", headers=auth, json={"accel_wakeup": "quatsch"})
    assert r.status_code == 400, r.text
    assert _config(client, dev)["accelWakeup"] == "on"


def test_fremde_uhr_nicht_umstellbar(client):
    auth_a, _ = _paar(client, "aw-a")
    auth_b, _ = _paar(client, "aw-b")
    gid_a = _geraet(client, auth_a)["id"]
    r = client.put(f"/api/devices/{gid_a}/accel-wakeup", headers=auth_b, json={"accel_wakeup": "on"})
    assert r.status_code == 404, r.text
