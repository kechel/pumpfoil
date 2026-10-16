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
    # Selbst gesetzte Punkte gehen mit der Route, kaputte Eintraege fliegen raus, hoechstens 20
    from app.api import community as C
    eigene = [[-60.0011111111, 20.0022222222], ["x", 1], [1.0], [True, 2.0]] + [[-60.0, 20.0]] * 30
    assert client.post(f"/api/community/spot/{sid}/routen", headers=a,
                       json={"punkte": RUNDE, "einstellungen": {"eigene": eigene}}).status_code == 200
    e = client.get(f"/api/community/spot/{sid}/routen", headers=a).json()[0]["einstellungen"]["eigene"]
    assert e[0] == [-60.001111, 20.002222]
    assert len(e) == C.EIGENE_MAX - 3 and all(len(p) == 2 for p in e)


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


def test_startpositionen_im_umkreis(client, monkeypatch):
    from datetime import datetime, timezone
    """Umkreis-Regler: Startplaetze der Nachbarspots zaehlen mit, `vom_spot` markiert die eigenen,
    ausserhalb des Umkreises nichts, hoechstens POSITIONEN_MAX."""
    from app.db import SessionLocal
    from app import models, heatmap as H
    from app.api import community as C
    a = _konto(client, "routeu")
    db = SessionLocal()
    uid = db.query(models.User.id).order_by(models.User.id.desc()).first()[0]
    hier = models.Spot(name="Hier", lat=-61.0, lon=20.0)
    nachbar = models.Spot(name="Nachbar", lat=-61.0, lon=20.05)      # ~2,7 km
    weit = models.Spot(name="Weit", lat=-61.0, lon=21.0)             # ~54 km
    db.add_all([hier, nachbar, weit]); db.commit()
    cache, sid = {}, {}
    for sp in (hier, nachbar, weit):
        for k in range(2):
            s = models.Session(user_id=uid, session_uuid=f"umk-{sp.name}-{k}", spot_id=sp.id, status="analyzed",
                               started_at=datetime(2026, 10, 1, tzinfo=timezone.utc))
            db.add(s); db.commit()
            cache[s.id] = ("fp", None, None, H._zellen([[sp.lon, sp.lat]] * 2, eindeutig=False))
    hid = hier.id
    db.close()
    monkeypatch.setattr(H, "_zellen_cache", lambda: cache)
    url = f"/api/community/spot/{hid}/startpositionen?min_starts=2"
    assert len(client.get(url, headers=a).json()["positionen"]) == 1
    r = client.get(url + "&umkreis_km=5", headers=a).json()["positionen"]
    assert len(r) == 2 and sorted(p["vom_spot"] for p in r) == [False, True]
    monkeypatch.setattr(C, "POSITIONEN_MAX", 1)
    assert len(client.get(url + "&umkreis_km=5", headers=a).json()["positionen"]) == 1
