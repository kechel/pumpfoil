"""`GET /api/settings` — „Automatisch (letzte Session)" muss wirklich automatisch sein.

Die Profil-Auswahl zeigt bei leerem Homespot seit Langem `profile.homespotAuto`
(„Automatisch (letzte Session)"). Implementiert war das nie: jeder Leser behandelte leer als
„kein Homespot", und damit blieben Wetterkarte, „Homespot"-Reiter und Spot-Chat-Vorwahl leer.
Nachgezaehlt am 18.09.2026: 17 von 572 Konten haben einen gesetzt, 269 weitere haetten einen
ableitbaren. Vorgabe Jan: „Wenn kein Homespot gesetzt ist Default Fallback für alle Homespot
abfragen genauso bitte."

Diese Datei haelt beides fest: dass abgeleitet wird, WORAUS abgeleitet wird (letzte Session,
nicht die haeufigste), und dass `homespot` dabei LEER bleibt — sonst schriebe das naechste
Speichern im Profil einen Ort fest, den der Nutzer nie gewaehlt hat.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app import models
from app.db import SessionLocal

T0 = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)


def _konto(client, mail: str) -> tuple[dict, int]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code == 200, r.text
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return auth, client.get("/api/auth/me", headers=auth).json()["id"]


def _session(db, uid: int, minuten: int, ort: str) -> None:
    db.add(models.Session(session_uuid=str(uuid.uuid4()), started_at=T0 + timedelta(minutes=minuten),
                          user_id=uid, place_name=ort, is_pumpfoil=True, status="done"))
    db.commit()


def _einst(client, auth) -> dict:
    r = client.get("/api/settings", headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


def test_ohne_session_bleibt_leer(client):
    """Neues Konto ohne jede Aufnahme: nichts zu erraten, also auch kein Ersatz."""
    auth, _uid = _konto(client, "leer@homespot.example.com")
    s = _einst(client, auth)
    assert s["homespot"] == ""
    assert s["homespot_effective"] == ""
    assert s["homespot_auto"] is False


def test_faellt_auf_die_LETZTE_session_zurueck(client):
    """Abgeleitet wird aus der neuesten Aufnahme — nicht aus der haeufigsten."""
    auth, uid = _konto(client, "auto@homespot.example.com")
    db = SessionLocal()
    _session(db, uid, 0, "Alter See")
    _session(db, uid, 10, "Alter See")     # haeufigster Spot, aber nicht der neueste
    _session(db, uid, 20, "Neuer See")
    db.close()
    s = _einst(client, auth)
    assert s["homespot_effective"] == "Neuer See"
    assert s["homespot_auto"] is True
    # Der GESETZTE Wert bleibt leer: das Profil zeigt weiter „Automatisch", und ein Speichern
    # schreibt keinen Ort fest, den niemand gewaehlt hat.
    assert s["homespot"] == ""


def test_gesetzter_homespot_gewinnt(client):
    """Wer selbst gewaehlt hat, bekommt seine Wahl — auch wenn er woanders zuletzt fuhr."""
    auth, uid = _konto(client, "gesetzt@homespot.example.com")
    db = SessionLocal()
    _session(db, uid, 0, "Woanders")
    db.close()
    r = client.put("/api/settings", json={"homespot": "Mein Heimsee"}, headers=auth)
    assert r.status_code == 200, r.text
    s = _einst(client, auth)
    assert s["homespot"] == "Mein Heimsee"
    assert s["homespot_effective"] == "Mein Heimsee"
    assert s["homespot_auto"] is False
