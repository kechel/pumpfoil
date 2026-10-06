"""Fahrergewicht je Session (Nutzerwunsch 06.10.2026, Jans Vorgaben):
Schnappschuss beim Anlegen, je Session aenderbar, kein Nachtrag fuer den Bestand, fuer andere
sichtbar mit Opt-out im Profil, und die Leistung rechnet mit dem Gewicht DER Session."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _session(uid, **kw):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, sport="pumpfoil",
                           started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           is_pumpfoil=True, status="analyzed", **kw)
        db.add(s); db.commit()
        return s.id
    finally:
        db.close()


def test_schnappschuss_beim_anlegen():
    """standard_setup nimmt das Profilgewicht mit; 0 heisst „nicht angegeben" und bleibt NULL."""
    from app import models
    from app.setup_snapshot import standard_setup
    u = models.User(settings_json=json.dumps({"weight_kg": 82}))
    assert standard_setup(None, u)["rider_weight_kg"] == 82
    u0 = models.User(settings_json=json.dumps({"weight_kg": 0}))
    assert "rider_weight_kg" not in standard_setup(None, u0)


def test_je_session_setzen_und_profilwechsel_aendert_alte_nicht(client):
    kopf, uid = _konto(client, "gw1@b.de")
    client.put("/api/settings", headers=kopf, json={"weight_kg": 80})
    alt = _session(uid, rider_weight_kg=80)          # angelegt, als das Profil 80 sagte
    ohne = _session(uid)                               # Altbestand ohne Schnappschuss

    client.put("/api/settings", headers=kopf, json={"weight_kg": 75})
    d = client.get(f"/api/sessions/{alt}", headers=kopf).json()
    assert d["owner_weight_kg"] == 80                  # die Session behaelt IHR Gewicht
    assert d["setup"]["weight_kg"] == 80 and d["setup"]["weight_is_default"] is False
    d = client.get(f"/api/sessions/{ohne}", headers=kopf).json()
    assert d["owner_weight_kg"] == 75 and d["setup"]["weight_is_default"] is True   # erbt das Profil

    r = client.patch(f"/api/sessions/{ohne}/meta", headers=kopf, json={"rider_weight_kg": 78})
    assert r.status_code == 200, r.text
    assert r.json()["setup"]["weight_kg"] == 78
    assert client.patch(f"/api/sessions/{ohne}/meta", headers=kopf, json={"rider_weight_kg": 5}).status_code == 400
    r = client.patch(f"/api/sessions/{ohne}/meta", headers=kopf, json={"rider_weight_kg": None})
    assert r.json()["setup"]["weight_kg"] == 75     # zurueck aufs Profil

    h = client.get("/api/settings/weight-history", headers=kopf).json()
    assert [x["kg"] for x in h] == [80]


def test_opt_out_verbirgt_es_nur_vor_anderen(client):
    kopf, uid = _konto(client, "gw2@b.de")
    fremd, _ = _konto(client, "gw3@b.de")
    sid = _session(uid, rider_weight_kg=70)
    d = client.get(f"/api/sessions/{sid}", headers=fremd).json()
    assert d["owner_weight_kg"] == 70 and d["setup"]["weight_kg"] == 70     # Standard: sichtbar

    client.put("/api/settings", headers=kopf, json={"weight_hidden": True})
    d = client.get(f"/api/sessions/{sid}", headers=fremd).json()
    assert d["owner_weight_kg"] is None
    assert "weight_kg" not in (d.get("setup") or {})
    d = client.get(f"/api/sessions/{sid}", headers=kopf).json()             # der Besitzer sieht es
    assert d["owner_weight_kg"] == 70 and d["setup"]["weight_kg"] == 70

    # andere duerfen es nicht setzen
    assert client.patch(f"/api/sessions/{sid}/meta", headers=fremd, json={"rider_weight_kg": 90}).status_code in (403, 404)
