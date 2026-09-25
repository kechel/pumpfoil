"""Garmin OHNE Layout-Paket (128-KB-Klasse): Seiten-Saetze und „alle Seiten" kommen trotzdem an.

Anlass (25.09.2026, Roman, u244, Instinct 3 Solar): zwischen den Laeufen zeigte die Uhr nur die
erste Seite und blaetterte immer durch alle Zustaende — auch nach 1.0.89. Ursache: `offFoilPages`
und `browseAll` standen nur im Layout-Paket, und das bekommt eine Uhr unter 512 KB nicht.
Jetzt bekommt sie die KLASSISCHEN Seiten der Saetze (eigene Layouts kann ihr Build nicht zeichnen).
"""
from __future__ import annotations

import pytest

from app.api import devices

MITTEL = "006-B4585-00"   # Instinct 3 Solar, 128 KB
GROSS = "006-B4376-00"    # fenix 7X Pro


@pytest.fixture(autouse=True)
def _katalog(monkeypatch):
    monkeypatch.setattr(devices, "_catalog_entry", lambda pn: {
        MITTEL: {"id": "instinct3solar45mm", "mem": 131072},
        GROSS: {"id": "fenix7xpro", "mem": 786432},
    }.get(pn))


def _konto(client, kennung: str) -> dict:
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _paaren(client, auth: dict) -> dict:
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Garmin"}).json()
    return {"X-Device-Token": paar["device_token"]}


def _config(client, dev: dict, pn: str) -> dict:
    r = client.get(f"/api/devices/config?p=garmin&v=1.0.90&pn={pn}", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def _romans_seiten(client, auth):
    r = client.put("/api/settings", headers=auth, json={
        "pages": [[0, 2, 14]],
        "off_foil_pages": [[17, 16, 12], [20, 4, 2]],
        "pause_pages": [[0, 12, 0]],
        "browse_all_pages": False,
    })
    assert r.status_code == 200, r.text


def test_mittelklasse_bekommt_saetze_und_schalter(client):
    auth = _konto(client, "klassik-mittel")
    dev = _paaren(client, auth)
    _romans_seiten(client, auth)
    c = _config(client, dev, MITTEL)
    assert c["offFoilPages"] == [[0, 17, 16, 12], [0, 20, 4, 2]]
    assert c["pausePages"] == [[0, 0, 12, 0]]
    assert c["browseAll"] is False
    # Nur KLASSISCHE Seiten — eigene Layouts (`[1,…]`) kann der Build nicht zeichnen.
    assert all(e[0] == 0 for e in c["offFoilPages"] + c["pausePages"])


def test_grosse_uhr_unveraendert(client):
    auth = _konto(client, "klassik-gross")
    dev = _paaren(client, auth)
    _romans_seiten(client, auth)
    c = _config(client, dev, GROSS)
    assert c["browseAll"] is False
    assert c["offFoilPages"] == [[0, 17, 16, 12], [0, 20, 4, 2]]
