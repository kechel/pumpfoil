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


def test_als_klassik_nimmt_die_ersten_drei_wertfelder_von_oben():
    # [typ, x, y, schritt, farbe, flags, feld]: Wertfelder (typ 1) bei y 700 / 200 / 450, dazu ein
    # Beschriftungsfeld (typ 2) und ein doppeltes Feld — gezaehlt werden nur Werte, jede ID einmal.
    layout = [1, 0, [[1, 500, 700, 2, 0, 0, 4], [2, 500, 150, 1, 0, 0, 9],
                     [1, 500, 200, 3, 0, 0, 1], [1, 300, 450, 2, 0, 0, 2],
                     [1, 700, 450, 2, 0, 0, 2]]]
    assert devices._als_klassik(layout) == [0, 1, 2, 4]
    assert devices._als_klassik([0, 12, 20, 2]) == [0, 12, 20, 2]
    # Ohne Wertfeld keine leere Seite, sondern Tempo.
    assert devices._als_klassik([1, 0, [[3, 500, 500, 1, 0, 0, "Hi"]]]) == [0, 1, 0, 0]


def test_nur_layouts_werden_fuer_kleine_uhren_umgerechnet(client):
    """Jans Fall: im Profil NUR eigene Layouts. Vorher zeigte die Instinct die alte, im Editor
    unsichtbare Ersatzliste; jetzt die Werte der Layouts in klassischer Anordnung."""
    auth = _konto(client, "klassik-layouts")
    dev = _paaren(client, auth)
    def anlegen(cat, felder):
        els = [[1, 500, 200 + 200 * i, 2, 0, 0, f] for i, f in enumerate(felder)]
        r = client.post("/api/layouts", headers=auth, json={"name": cat, "category": cat, "elements": els})
        assert r.status_code == 201, r.text
        return r.json()["id"]
    an = anlegen("on_foil", [1, 14, 2])
    aus = anlegen("off_foil", [17, 16, 12])
    pau = anlegen("pause", [12, 20])
    r = client.put("/api/settings", headers=auth, json={
        "views": [[16, 17, 18]], "pages": [an], "off_foil_pages": [aus], "pause_pages": [pau],
        "browse_all_pages": False})
    assert r.status_code == 200, r.text
    c = _config(client, dev, MITTEL)
    assert c["views"] == [[1, 14, 2]]              # nicht die alte Ersatzliste [16,17,18]
    assert c["offFoilView"] == [17, 16, 12]
    assert c["pauseView"] == [12, 20, 0]
    assert c["offFoilPages"] == [[0, 17, 16, 12]]
    # Die grosse Uhr bekommt die Layouts selbst, unveraendert.
    g = _config(client, dev, GROSS)
    assert g["pages"][0][0] == 1


def test_schwarzweiss_uhr_faerbt_nie_ein(client, monkeypatch):
    """1-Bit-Display: Zonenfarben waeren schwarz auf schwarz — der Server schaltet sie ab."""
    monkeypatch.setattr(devices, "_catalog_entry", lambda pn: {
        MITTEL: {"id": "instinct3solar45mm", "mem": 131072, "bpp": 1},
        GROSS: {"id": "fenix7xpro", "mem": 786432, "bpp": 8},
    }.get(pn))
    auth = _konto(client, "mono-farbe")
    dev = _paaren(client, auth)
    assert client.put("/api/settings", headers=auth, json={"colorByValue": True}).status_code == 200
    assert _config(client, dev, MITTEL)["colorByValue"] is False
    assert _config(client, dev, GROSS)["colorByValue"] is True
