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


def test_standard_an_und_je_uhr_umschaltbar(client):
    auth, dev = _paar(client, "gs-1")
    assert _config(client, dev)["gpsSparen"] is True
    g = client.get("/api/devices/list", headers=auth).json()[0]
    assert g["gps_sparen"] is True
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
