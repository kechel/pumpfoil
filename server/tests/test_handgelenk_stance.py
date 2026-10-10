"""Handgelenk + Stance im Profil (10.10.2026, docs/GROUND-TRUTH.md §4)."""
from app.api.settings import uhr_hand


def _konto(client, kennung):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_standard_leer(client):
    s = client.get("/api/settings", headers=_konto(client, "hs-leer")).json()
    assert s["watch_wrist"] == "" and s["stance"] == ""


def test_speichern_und_ungueltig_verwerfen(client):
    auth = _konto(client, "hs-set")
    client.put("/api/settings", headers=auth, json={"watch_wrist": "left", "stance": "goofy"})
    s = client.get("/api/settings", headers=auth).json()
    assert s["watch_wrist"] == "left" and s["stance"] == "goofy"
    client.put("/api/settings", headers=auth, json={"watch_wrist": "links", "stance": 3})
    s = client.get("/api/settings", headers=auth).json()
    assert s["watch_wrist"] == "left" and s["stance"] == "goofy"
    client.put("/api/settings", headers=auth, json={"watch_wrist": "", "stance": ""})
    s = client.get("/api/settings", headers=auth).json()
    assert s["watch_wrist"] == "" and s["stance"] == ""


def test_vordere_oder_hintere_hand():
    assert uhr_hand({"watch_wrist": "left", "stance": "regular"}) == "front"
    assert uhr_hand({"watch_wrist": "right", "stance": "regular"}) == "back"
    assert uhr_hand({"watch_wrist": "left", "stance": "goofy"}) == "back"
    assert uhr_hand({"watch_wrist": "right", "stance": "goofy"}) == "front"
    assert uhr_hand({"watch_wrist": "left", "stance": ""}) is None
    assert uhr_hand({}) is None
