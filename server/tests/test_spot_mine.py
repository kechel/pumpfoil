"""`GET /api/sessions/spot-mine` — darf jemand fuer DIESEN Spot einen Namen vorschlagen?

Vorgabe Jan (12.09.2026): der Knopf „Namen vorschlagen" nur „bei spots an denen man selber auch
mind. eine session gefahren ist (egal ob pumpfoil oder nicht oder on-foil erkannt)".

Der zweite Teil ist der Grund fuer diese Datei. Eine Aufnahme bekommt naemlich NUR dann eine
`spot_id`, wenn sie Pumpfoil ist UND mindestens ein Lauf erkannt wurde (`spots.assign_one`) — wer
dort war, aber ohne erkannten Lauf, haengt an gar keinem Spot. Wuerde der Endpunkt nur auf
`spot_id` schauen, waere genau die Gruppe ausgesperrt, die Jan ausdruecklich einschliessen wollte.
Deshalb prueft er zusaetzlich geometrisch gegen das Spot-Polygon, und deshalb steht das hier fest.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app import models
from app.db import SessionLocal

# Ein winziges Quadrat um (50.0, 8.0); WKT traegt lon lat (wie `spots._m_to_wkt` es schreibt).
POLY = "POLYGON ((7.99 49.99, 8.01 49.99, 8.01 50.01, 7.99 50.01, 7.99 49.99))"


def _spot(db):
    sp = models.Spot(name="Testspot", name_source="manual", lat=50.0, lon=8.0, poly_wkt=POLY)
    db.add(sp)
    db.commit()
    return sp.id


def _konto(client, mail: str) -> dict:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _frage(client, auth, spot_id: int) -> dict:
    r = client.get(f"/api/sessions/spot-mine?spot_id={spot_id}", headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def test_fremder_spot_ist_nicht_meiner(client):
    db = SessionLocal()
    spot_id = _spot(db)
    db.close()
    auth = _konto(client, "fremd@spotmine.example.com")
    assert _frage(client, auth, spot_id) == {"mine": False, "sessions": 0}


def test_eigene_aufnahme_mit_spot_id_zaehlt(client):
    db = SessionLocal()
    spot_id = _spot(db)
    db.close()
    auth = _konto(client, "mitspot@spotmine.example.com")
    me = client.get("/api/auth/me", headers=auth).json()

    db = SessionLocal()
    db.add(models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime.now(timezone.utc), user_id=me["id"], spot_id=spot_id, is_pumpfoil=True))
    db.commit()
    db.close()
    assert _frage(client, auth, spot_id)["mine"] is True


def test_aufnahme_OHNE_spot_id_zaehlt_ueber_die_geometrie(client):
    """Der eigentliche Punkt: kein Lauf erkannt -> keine `spot_id` -> nur Koordinaten.

    Zusaetzlich `is_pumpfoil=False` gesetzt, also eine ausdruecklich AUSSORTIERTE Aufnahme —
    auch die soll laut Vorgabe zaehlen.
    """
    db = SessionLocal()
    spot_id = _spot(db)
    db.close()
    auth = _konto(client, "nurkoords@spotmine.example.com")
    me = client.get("/api/auth/me", headers=auth).json()

    db = SessionLocal()
    db.add(models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime.now(timezone.utc), user_id=me["id"], spot_id=None, is_pumpfoil=False,
                          place_lat=50.0, place_lon=8.0))
    db.commit()
    db.close()
    assert _frage(client, auth, spot_id)["mine"] is True


def test_aufnahme_NEBEN_dem_spot_zaehlt_nicht(client):
    """Gegenprobe zur Geometrie: knapp ausserhalb des Polygons ist aussen."""
    db = SessionLocal()
    spot_id = _spot(db)
    db.close()
    auth = _konto(client, "daneben@spotmine.example.com")
    me = client.get("/api/auth/me", headers=auth).json()

    db = SessionLocal()
    db.add(models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime.now(timezone.utc), user_id=me["id"], spot_id=None, is_pumpfoil=True,
                          place_lat=50.05, place_lon=8.05))   # ausserhalb, aber im Vorfilter
    db.commit()
    db.close()
    assert _frage(client, auth, spot_id) == {"mine": False, "sessions": 0}
