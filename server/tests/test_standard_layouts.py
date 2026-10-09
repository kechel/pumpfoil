"""Standard-Datenseiten aus der Community (09.10.2026, server/app/standard_layouts.py).

Wer nie eigene Seiten eingestellt hat, bekommt die meistkopierten Community-Layouts — auf der Uhr, im
Editor (Web) und ueber GET /api/layouts auch in den nativen Apps. Erst wer einen Satz aendert und
speichert, bekommt eigene Kopien. Wer schon eigene Seiten hat, merkt nichts.
"""
from __future__ import annotations

import json

import pytest

from app import standard_layouts as SL
from app.api import devices

MITTEL = "006-B4585-00"   # Instinct 3 Solar, 128 KB: kein Layout-Renderer
GROSS = "006-B4376-00"    # fenix 7X Pro


@pytest.fixture(autouse=True)
def _katalog(monkeypatch):
    monkeypatch.setattr(devices, "_catalog_entry", lambda pn: {
        MITTEL: {"id": "instinct3solar45mm", "mem": 131072},
        GROSS: {"id": "fenix7xpro", "mem": 786432},
    }.get(pn))


def _konto(client, kennung):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _paaren(client, auth):
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    return {"X-Device-Token": client.post("/api/devices/pair", json={"code": code, "label": "Garmin"}).json()["device_token"]}


def _config(client, dev, pn):
    r = client.get(f"/api/devices/config?p=garmin&v=1.0.92&pn={pn}", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def test_daten_vollstaendig():
    assert [l["name"] for l in SL.liste("on_foil")] == ["While riding", "BPM + Speed", "All in"]
    assert [l["name"] for l in SL.liste("off_foil")] == ["After a run", "All in betwene"]
    assert [l["name"] for l in SL.liste("pause")] == ["Between runs"]
    for k in SL.KATEGORIEN:
        for l in SL.liste(k):
            assert l["elements"] and isinstance(l["autor_id"], int)
            assert "autor" not in l and "author" not in l      # keine Namen im Repo


def test_neuer_nutzer_bekommt_standard_auf_der_uhr(client):
    auth = _konto(client, "std-neu")
    dev = _paaren(client, auth)
    c = _config(client, dev, GROSS)
    assert len(c["pages"]) == 3 and all(p[0] == 1 for p in c["pages"])
    assert c["pages"][0] == SL.payload(SL.liste("on_foil")[0])
    assert len(c["offFoilPages"]) == 2 and c["offFoil"] == SL.payload(SL.liste("off_foil")[0])
    assert c["pausePages"] == [SL.payload(SL.liste("pause")[0])]


def test_uhr_ohne_layout_renderer_bekommt_umgerechnete_seiten(client):
    auth = _konto(client, "std-klein")
    dev = _paaren(client, auth)
    c = _config(client, dev, MITTEL)
    assert len(c["views"]) == 3 and all(len(v) == 3 for v in c["views"])
    assert all(p[0] == 0 for p in c["offFoilPages"])        # klassisch, keine Layouts
    assert c["views"][0] == devices._als_klassik(SL.payload(SL.liste("on_foil")[0]))[1:4]


def test_eigene_seiten_bleiben_unberuehrt(client):
    auth = _konto(client, "std-eigen")
    dev = _paaren(client, auth)
    client.put("/api/settings", headers=auth, json={"pages": [[1, 2, 3]], "off_foil_pages": [[17, 16, 12]], "pause_pages": [[12, 20, 2]]})
    c = _config(client, dev, GROSS)
    assert c["pages"] == [[0, 1, 2, 3]] and c["offFoilPages"] == [[0, 17, 16, 12]] and c["pausePages"] == [[0, 12, 20, 2]]


def test_nur_ein_satz_eigen_die_anderen_standard(client):
    auth = _konto(client, "std-teil")
    dev = _paaren(client, auth)
    client.put("/api/settings", headers=auth, json={"pause_pages": [[12, 20, 2]]})
    c = _config(client, dev, GROSS)
    assert c["pausePages"] == [[0, 12, 20, 2]]
    assert len(c["pages"]) == 3 and c["pages"][0][0] == 1


def test_editor_und_native_apps_sehen_standard(client):
    auth = _konto(client, "std-editor")
    s = client.get("/api/settings", headers=auth).json()
    assert s["pages"] == SL.ids("on_foil") and s["off_foil_pages"] == SL.ids("off_foil") and s["pause_pages"] == SL.ids("pause")
    lay = client.get("/api/layouts", headers=auth).json()
    std = [l for l in lay if l.get("standard")]
    assert {l["id"] for l in std} == set(SL.ids("on_foil") + SL.ids("off_foil") + SL.ids("pause"))
    # dieselben Felder wie eigene Layouts (Android/iOS lesen genau diese)
    for k in ("id", "name", "category", "elements", "bg_color", "shape", "authored_w", "authored_h"):
        assert k in std[0]
    assert not [l for l in client.get("/api/layouts?standard=false", headers=auth).json() if l.get("standard")]


def test_speichern_mit_standard_ids_legt_eigene_kopien_an(client):
    auth = _konto(client, "std-kopie")
    dev = _paaren(client, auth)
    neu = [SL.ids("on_foil")[1], [1, 2, 0]]                # Standard-Seite + klassische
    r = client.put("/api/settings", headers=auth, json={"pages": neu})
    assert r.status_code == 200, r.text
    pages = client.get("/api/settings", headers=auth).json()["pages"]
    assert pages[1] == [1, 2, 0] and isinstance(pages[0], int) and pages[0] > 0
    eigene = [l for l in client.get("/api/layouts?standard=false", headers=auth).json()]
    assert len(eigene) == 1 and eigene[0]["name"] == "BPM + Speed" and eigene[0]["published"] is False
    c = _config(client, dev, GROSS)
    assert c["pages"][0] == SL.payload(SL.liste("on_foil")[1]) and c["pages"][1] == [0, 1, 2, 0]
    # die anderen Saetze bleiben Standard
    assert c["offFoil"] == SL.payload(SL.liste("off_foil")[0])


def test_falsche_kategorie_wird_verworfen(client):
    auth = _konto(client, "std-kat")
    client.put("/api/settings", headers=auth, json={"pause_pages": [SL.ids("on_foil")[0], [12, 20, 2]]})
    assert client.get("/api/settings", headers=auth).json()["pause_pages"] == [[12, 20, 2]]


def test_standard_layout_nicht_bearbeitbar(client):
    auth = _konto(client, "std-edit")
    lid = SL.ids("on_foil")[0]
    assert client.put(f"/api/layouts/{lid}", headers=auth, json={"name": "x"}).status_code in (404, 422)
    assert client.delete(f"/api/layouts/{lid}", headers=auth).status_code in (404, 422)
