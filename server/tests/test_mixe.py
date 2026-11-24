"""Musik-Mixe der Media-Ansicht (24.11.2026, app/api/mixe.py): speichern, teilen, laden — und vor allem pruefen, denn
aus einem geteilten Mix wird bei anderen Strudel-Code."""
from __future__ import annotations


def _konto(client, kennung):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


CFG = {"vorlage": "klavier", "fxLaut": 0.5, "fx": {"topSpeed": True, "boese": True},
       "stimmen": [{"name": "Melodie", "instrument": "pf_piano", "muster": "melodie", "wann": "lauf", "ton": "tempo",
                    "laut": "puls", "farbe": "fest", "pan": "carve", "dichte": "tempo", "oktave": 4, "lautstaerke": 0.6}]}


def test_speichern_teilen_laden(client):
    a, b = _konto(client, "mix-a"), _konto(client, "mix-b")
    m = client.post("/api/media/mixe", json={"name": "Mein Piano", "cfg": CFG}, headers=a).json()
    assert m["cfg"]["vorlage"] == "klavier" and m["cfg"]["stimmen"][0]["ton"] == "tempo"
    assert "boese" not in m["cfg"]["fx"]                       # unbekannte Felder fallen weg
    assert client.get("/api/media/mixe/community", headers=b).json() == []   # noch nicht geteilt
    client.post(f"/api/media/mixe/{m['id']}/publish?published=true", headers=a)
    liste = client.get("/api/media/mixe/community", headers=b).json()
    assert [x["name"] for x in liste] == ["Mein Piano"] and liste[0]["eigen"] is False
    client.post(f"/api/media/mixe/{m['id']}/geladen", headers=b)
    client.post(f"/api/media/mixe/{m['id']}/geladen", headers=a)   # eigenes Laden zaehlt nicht
    assert client.get("/api/media/mixe", headers=a).json()[0]["geladen"] == 1
    client.post(f"/api/media/mixe/{m['id']}/exportiert", headers=b)
    client.post(f"/api/media/mixe/{m['id']}/exportiert", headers=a)   # eigener Export zaehlt nicht
    assert client.get("/api/media/mixe/community", headers=b).json()[0]["exportiert"] == 1
    # Fremde koennen weder aendern noch loeschen
    assert client.put(f"/api/media/mixe/{m['id']}", json={"name": "x", "cfg": CFG}, headers=b).status_code == 404
    assert client.delete(f"/api/media/mixe/{m['id']}", headers=b).status_code == 404
    assert client.delete(f"/api/media/mixe/{m['id']}", headers=a).status_code == 204


def test_pruefung_gegen_code_einschleusung(client):
    a = _konto(client, "mix-c")
    boese = {"vorlage": "x'); hush(); //", "fxLaut": "viel",
             "stimmen": [{"name": "a\n}); fetch('//evil')//", "instrument": "pf_piano'); hush();//",
                          "muster": "melodie; x", "wann": "lauf", "ton": "D.x", "oktave": 99, "lautstaerke": 7}]}
    m = client.post("/api/media/mixe", json={"name": "Böse\nZeile", "cfg": boese}, headers=a).json()
    v = m["cfg"]["stimmen"][0]
    assert "\n" not in v["name"] and "\n" not in m["name"]
    assert v["instrument"] == "synth:triangle" and v["muster"] == "melodie" and v["ton"] == "akkorde"
    assert v["oktave"] == 6 and v["lautstaerke"] == 1.0
    assert m["cfg"]["vorlage"] == "techno" and m["cfg"]["fxLaut"] == 0.8
