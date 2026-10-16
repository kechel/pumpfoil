"""Gemerkte Routen an einem Spot (Jan, 16.10.2026): oeffentlich, nur mit Datum, nie mit Namen."""


def _konto(client, name):
    r = client.post("/api/auth/register", json={"email": f"{name}@route.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _spot():
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    sp = models.Spot(name="RoutenSee", lat=-60.0, lon=20.0)
    db.add(sp); db.commit()
    sid = sp.id
    db.close()
    return sid


RUNDE = [[-60.0, 20.0], [-60.001, 20.002], [-60.002, 20.0], [-60.0, 20.0]]


def test_merken_liste_ohne_namen_und_zusammengelegt(client):
    sid = _spot()
    a, b = _konto(client, "routea"), _konto(client, "routeb")
    einst = {"min_starts": 3, "min_m": 50, "max_m": 300, "punkte": 3, "rundkurs": True, "ohne_kreuzung": True,
             "start": [-60.0, 20.0], "richtung": None, "unbekannt": "weg"}
    r = client.post(f"/api/community/spot/{sid}/routen", headers=a, json={"punkte": RUNDE, "einstellungen": einst})
    assert r.status_code == 200
    # dieselbe Runde andersherum von jemand anderem -> EIN Eintrag
    assert client.post(f"/api/community/spot/{sid}/routen", headers=b,
                       json={"punkte": list(reversed(RUNDE))}).status_code == 200
    liste_a = client.get(f"/api/community/spot/{sid}/routen", headers=a).json()
    liste_b = client.get(f"/api/community/spot/{sid}/routen", headers=b).json()
    assert len(liste_a) == 1 and liste_a[0]["eigene_id"] is not None and liste_b[0]["eigene_id"] is not None
    e = liste_a[0]
    assert set(e) == {"schluessel", "gemerkt_am", "punkte", "einstellungen", "meter", "eigene_id"}
    assert 400 < e["meter"] < 700
    dritter = _konto(client, "routec")
    assert client.get(f"/api/community/spot/{sid}/routen", headers=dritter).json()[0]["eigene_id"] is None


def test_einstellungen_gefiltert_und_formular_wiederherstellbar(client):
    sid = _spot()
    a = _konto(client, "routed")
    client.post(f"/api/community/spot/{sid}/routen", headers=a,
                json={"punkte": RUNDE, "einstellungen": {"min_m": 50, "max_m": 300, "rundkurs": True, "boese": "<x>"}})
    e = client.get(f"/api/community/spot/{sid}/routen", headers=a).json()[0]["einstellungen"]
    assert e == {"min_m": 50, "max_m": 300, "rundkurs": True}


def test_pruefungen_loeschen_und_grenze(client):
    from app.api import community as C
    sid = _spot()
    a, b = _konto(client, "routee"), _konto(client, "routef")
    url = f"/api/community/spot/{sid}/routen"
    assert client.post(url, headers=a, json={"punkte": [[-60.0, 20.0]]}).status_code == 422
    assert client.post(url, headers=a, json={"punkte": [[-60.0, 20.0], [10.0, 10.0]]}).status_code == 422
    assert client.post(url, headers=a, json={"punkte": [[-60.0, 20.0], ["x", 1]]}).status_code == 422
    assert client.post(url, json={"punkte": RUNDE}).status_code == 401
    rid = client.post(url, headers=a, json={"punkte": RUNDE}).json()["id"]
    assert client.delete(f"{url}/{rid}", headers=b).status_code == 404       # nur die eigene
    assert client.delete(f"{url}/{rid}", headers=a).status_code == 200
    assert client.get(url, headers=a).json() == []
    for i in range(C.ROUTEN_JE_NUTZER_UND_SPOT):
        assert client.post(url, headers=a, json={"punkte": [[-60.0, 20.0], [-60.0, 20.0 + 0.001 * (i + 1)]]}).status_code == 200
    assert client.post(url, headers=a, json={"punkte": [[-60.0, 20.0], [-60.01, 20.0]]}).status_code == 409


def test_spot_weg_routen_weg(client):
    from app.db import SessionLocal
    from app import models
    sid = _spot()
    a = _konto(client, "routeg")
    client.post(f"/api/community/spot/{sid}/routen", headers=a, json={"punkte": RUNDE})
    db = SessionLocal()
    db.delete(db.get(models.Spot, sid)); db.commit()
    assert db.query(models.GemerkteRoute).filter_by(spot_id=sid).count() == 0
    db.close()
