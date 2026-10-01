"""„Unangemessen"-Meldung zurueckgenommen -> Session wieder sichtbar (Jan, 01.10.2026: „behebe den bug").

Fall #8970: eine Meldung (vermutlich ein Fehlgriff) wurde zurueckgenommen und durch „fake" ersetzt;
die Session blieb trotzdem verborgen, ohne dass irgendwo stand, warum. Jetzt hebt die Ruecknahme
das Verbergen auf — aber nur, wenn es allein an Meldungen hing.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from app import models
from app.db import SessionLocal


def _konto(client, mail: str, admin: bool = False) -> tuple[dict, int]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code == 200, r.text
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    if admin:
        db = SessionLocal(); db.get(models.User, uid).is_admin = True; db.commit(); db.close()
    return auth, uid


def _session(uid: int) -> int:
    db = SessionLocal()
    s = models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime(2026, 9, 18, tzinfo=timezone.utc),
                       user_id=uid, is_pumpfoil=True, sport_class="pumpfoil", status="done")
    db.add(s); db.commit(); sid = s.id; db.close()
    return sid


def _flagged(sid: int) -> bool:
    db = SessionLocal(); v = bool(db.get(models.Session, sid).flagged); db.close()
    return v


def _melden(client, auth, sid, kind="inappropriate"):
    r = client.post(f"/api/community/sessions/{sid}/vote?kind={kind}", headers=auth)
    assert r.status_code == 200, r.text


def test_ruecknahme_hebt_das_verbergen_auf(client):
    _, owner = _konto(client, "besitzer@meldung.example.com")
    melder, _ = _konto(client, "melder@meldung.example.com")
    sid = _session(owner)
    _melden(client, melder, sid)
    assert _flagged(sid)
    _melden(client, melder, sid)          # zweiter Klick = Ruecknahme
    assert not _flagged(sid)


def test_andere_meldung_bleibt_bestehen(client):
    _, owner = _konto(client, "besitzer2@meldung.example.com")
    a, _ = _konto(client, "melder-a@meldung.example.com")
    b, _ = _konto(client, "melder-b@meldung.example.com")
    sid = _session(owner)
    _melden(client, a, sid); _melden(client, b, sid)
    _melden(client, a, sid)               # a nimmt zurueck, b nicht
    assert _flagged(sid)


def test_admin_verborgen_bleibt_verborgen(client):
    _, owner = _konto(client, "besitzer3@meldung.example.com")
    melder, _ = _konto(client, "melder3@meldung.example.com")
    admin, _ = _konto(client, "admin3@meldung.example.com", admin=True)
    sid = _session(owner)
    _melden(client, melder, sid)
    assert client.post(f"/api/admin/sessions/{sid}/hide", headers=admin).status_code == 200
    _melden(client, melder, sid)          # Ruecknahme hebt die Admin-Entscheidung NICHT auf
    assert _flagged(sid)


def test_fake_beruehrt_die_sichtbarkeit_nicht(client):
    _, owner = _konto(client, "besitzer4@meldung.example.com")
    melder, _ = _konto(client, "melder4@meldung.example.com")
    sid = _session(owner)
    _melden(client, melder, sid, "fake"); _melden(client, melder, sid, "fake")
    assert not _flagged(sid)
