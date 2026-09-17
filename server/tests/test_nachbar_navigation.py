"""`GET /api/sessions/{id}/neighbors` — „älter/neuer" muss dem Listen-Filter folgen.

Vorgabe Jan (17.09.2026): „wenn ich auf meine bin, mit nur Accel, dann auch bei meinen nur Accel
die frühere oder nächste Session … wenn ich aber an diesem Spot bin, die nächste an meinem Spot
von allen Fahrern. Und genauso, wenn ich in der Gesamtansicht bin … aber halt innerhalb der
Filter, auch nach Sportart."

Der Endpunkt nimmt deshalb dieselben Parameter wie die Listen (`scope`, `spot`, `sport`,
`accel_only`, `filter`, `month`). Diese Datei nagelt die vier Fälle fest, die man beim Umbauen
leicht kaputt macht:

1. OHNE Parameter bleibt alles wie vorher (eigene Sessions, gleiche Art) — ältere App-Versionen
   fragen genau so.
2. `accel_only=true` überspringt eigene GPS-only-Aufnahmen.
3. `spot=<id>` navigiert durch die Sessions ALLER Fahrer an diesem Spot.
4. `sport` grenzt dabei wirklich auf die Sportart ein.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app import models
from app.db import SessionLocal

T0 = datetime(2026, 5, 1, 10, 0, tzinfo=timezone.utc)


def _konto(client, mail: str) -> tuple[dict, int]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code == 200, r.text
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return auth, client.get("/api/auth/me", headers=auth).json()["id"]


def _session(db, uid: int, minuten: int, *, spot_id=None, detection="model",
             is_pumpfoil=True, sport="pumpfoil", runs=3) -> int:
    s = models.Session(session_uuid=str(uuid.uuid4()), started_at=T0 + timedelta(minutes=minuten),
                       user_id=uid, spot_id=spot_id, is_pumpfoil=is_pumpfoil,
                       sport_class=sport, status="done")
    db.add(s)
    db.flush()
    db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection=detection, num_runs=runs))
    db.commit()
    return s.id


def _nb(client, auth, sid: int, query: str = "") -> dict:
    r = client.get(f"/api/sessions/{sid}/neighbors{query}", headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def test_ohne_parameter_bleibt_es_bei_den_eigenen(client):
    """Altverhalten: eigene Sessions, unabhängig von Spot und fremden Fahrern."""
    auth, uid = _konto(client, "ohne@nachbarn.example.com")
    _fremd_auth, fremd = _konto(client, "fremd1@nachbarn.example.com")
    db = SessionLocal()
    a = _session(db, uid, 0)
    b = _session(db, uid, 20)
    c = _session(db, uid, 40)
    _session(db, fremd, 10)      # dazwischen, aber nicht meine
    db.close()
    assert _nb(client, auth, b) == {"older": a, "newer": c}


def test_accel_only_ueberspringt_gps_only(client):
    """„nur präzise" in der Liste -> auch die Nachbarn überspringen GPS-only-Aufnahmen."""
    auth, uid = _konto(client, "accel@nachbarn.example.com")
    db = SessionLocal()
    a = _session(db, uid, 0)
    gps = _session(db, uid, 10, detection="gps_only")
    b = _session(db, uid, 20)
    db.close()
    assert _nb(client, auth, b) == {"older": gps, "newer": None}
    assert _nb(client, auth, b, "?accel_only=true") == {"older": a, "newer": None}


def test_spot_nimmt_alle_fahrer(client):
    """Spot-Ansicht: der Nachbar ist die zeitlich nächste Session AM SPOT, egal von wem."""
    auth, uid = _konto(client, "spot@nachbarn.example.com")
    _fremd_auth, fremd = _konto(client, "fremd2@nachbarn.example.com")
    db = SessionLocal()
    sp = models.Spot(name="Nachbarspot", name_source="manual", lat=50.0, lon=8.0)
    db.add(sp)
    db.commit()
    spot_id = sp.id
    meine_frueh = _session(db, uid, 0, spot_id=spot_id)
    fremde = _session(db, fremd, 10, spot_id=spot_id)
    meine = _session(db, uid, 20, spot_id=spot_id)
    _session(db, fremd, 30)                       # anderer Spot -> zählt nicht
    db.close()
    # Ohne Spot-Filter: nur meine eigene davor.
    assert _nb(client, auth, meine)["older"] == meine_frueh
    # Mit Spot-Filter: die des anderen Fahrers liegt dazwischen.
    assert _nb(client, auth, meine, f"?spot={spot_id}")["older"] == fremde


def test_sportart_grenzt_ein(client):
    """Sportart-Filter der Community-Liste gilt auch für die Nachbarn."""
    auth, uid = _konto(client, "sport@nachbarn.example.com")
    db = SessionLocal()
    sp = models.Spot(name="Sportspot", name_source="manual", lat=51.0, lon=9.0)
    db.add(sp)
    db.commit()
    spot_id = sp.id
    pump = _session(db, uid, 0, spot_id=spot_id, sport="pumpfoil")
    _session(db, uid, 10, spot_id=spot_id, sport="wingfoil")
    hier = _session(db, uid, 20, spot_id=spot_id, sport="pumpfoil")
    db.close()
    assert _nb(client, auth, hier, f"?spot={spot_id}&sport=all")["older"] != pump
    assert _nb(client, auth, hier, f"?spot={spot_id}&sport=pumpfoil")["older"] == pump
