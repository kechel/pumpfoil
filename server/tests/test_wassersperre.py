"""Wassersperre je Uhr: Voreinstellung, Uebersteuerung, Abweisung von Unsinn.

Beim Pumpen schlaegt Wasser aufs Display und loest Aktionen aus (gemeldet 27.07. und 04.09.).
Ob eine Uhr dagegen sperrt, steht je GERAET in `device_tokens.water_lock` — anders als
`stop_mode` ist das eine Eigenschaft der Uhr und keine Gewohnheit des Menschen: auf einer Uhr
mit zwei Tasten wuerde man sich aussperren, eine Apple Watch sperrt systemweit, Garmin braucht
es gar nicht.
"""
from __future__ import annotations


def _paar(client, kennung: str):
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Wear OS"}).json()
    return auth, {"X-Device-Token": paar["device_token"]}


def _config(client, dev):
    r = client.get("/api/devices/config?p=wear&v=1.2.30", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def test_voreinstellung_ist_auto(client):
    """Ohne Zutun entscheidet die UHR — sie kennt ihre Tasten, wir nicht."""
    _auth, dev = _paar(client, "wl-default")
    assert _config(client, dev)["waterLock"] == "auto"


def test_je_geraet_uebersteuerbar(client):
    auth, dev = _paar(client, "wl-geraet")
    geraete = client.get("/api/devices/list", headers=auth).json()
    gid = geraete[0]["id"]
    for modus in ("off", "on", "auto"):
        r = client.put(f"/api/devices/{gid}/water-lock", headers=auth, json={"water_lock": modus})
        assert r.status_code == 200, r.text
        assert _config(client, dev)["waterLock"] == modus


def test_unsinn_wird_abgewiesen(client):
    """Ein ungueltiger Wert darf die Einstellung NICHT stillschweigend kippen."""
    auth, dev = _paar(client, "wl-unsinn")
    geraete = client.get("/api/devices/list", headers=auth).json()
    gid = geraete[0]["id"]
    client.put(f"/api/devices/{gid}/water-lock", headers=auth, json={"water_lock": "on"})
    r = client.put(f"/api/devices/{gid}/water-lock", headers=auth, json={"water_lock": "quatsch"})
    assert r.status_code == 400, r.text
    assert _config(client, dev)["waterLock"] == "on"


def test_nutzer_voreinstellung_greift_ohne_geraete_wert(client):
    """Ohne Geraete-Wert zaehlt das Profil — dieselbe Rangfolge wie bei recordMode/gnssMode."""
    auth, dev = _paar(client, "wl-profil")
    r = client.put("/api/settings", headers=auth, json={"water_lock": "off"})
    assert r.status_code == 200, r.text
    assert _config(client, dev)["waterLock"] == "off"
