"""Gruener Online-Punkt am Profilbild (Jan, 01.10.2026): wer gerade App oder Seite offen hat.

Standard an, im Profil abschaltbar; nie fuer Blockierte, unter 13, Testkonten, den KI-Account.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app import models
from app.config import get_settings
from app.db import SessionLocal


def _konto(client, mail: str) -> tuple[dict, int]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    if r.status_code == 409:   # schon angelegt (z. B. der KI-Account aus einem anderen Test)
        db = SessionLocal(); u = db.query(models.User).filter_by(email=mail).first(); uid = u.id; db.close()
        from app.security import create_access_token
        return {"Authorization": f"Bearer {create_access_token(uid)}"}, uid
    assert r.status_code == 200, r.text
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return auth, client.get("/api/auth/me", headers=auth).json()["id"]


def _online(client, auth, *ids) -> list[int]:
    r = client.get("/api/chat/online?ids=" + ",".join(map(str, ids)), headers=auth)
    assert r.status_code == 200, r.text
    return r.json()["online"]


def _setze(uid, **werte):
    db = SessionLocal(); u = db.get(models.User, uid)
    for k, v in werte.items(): setattr(u, k, v)
    db.commit(); db.close()


def test_aktiv_heisst_online_und_veraltet_nicht(client):
    ich, _ = _konto(client, "ich@online.example.com")
    a_auth, a = _konto(client, "aktiv@online.example.com")
    client.get("/api/auth/me", headers=a_auth)            # a hat die App offen
    assert _online(client, ich, a) == [a]
    _setze(a, online_at=datetime.now(timezone.utc) - timedelta(minutes=10))
    assert _online(client, ich, a) == []


def test_hintergrund_tab_zaehlt_nicht(client):
    ich, _ = _konto(client, "ich2@online.example.com")
    a_auth, a = _konto(client, "tab@online.example.com")
    _setze(a, online_at=None)
    client.get("/api/auth/me", headers={**a_auth, "X-Foil-Sichtbar": "0"})
    assert _online(client, ich, a) == []


def test_schalter_im_profil(client):
    ich, _ = _konto(client, "ich3@online.example.com")
    a_auth, a = _konto(client, "schalter@online.example.com")
    assert client.get("/api/auth/me", headers=a_auth).json()["show_online"] is True   # Standard an
    r = client.put("/api/auth/me", headers=a_auth, json={"show_online": False})
    assert r.status_code == 200 and r.json()["show_online"] is False
    client.get("/api/auth/me", headers=a_auth)
    assert _online(client, ich, a) == []


def test_blockiert_unter13_und_bot_nie(client):
    ich, me = _konto(client, "ich4@online.example.com")
    b_auth, b = _konto(client, "blockiert@online.example.com")
    k_auth, k = _konto(client, "kind@online.example.com")
    bot_auth, bot = _konto(client, get_settings().bot_email)
    for auth in (b_auth, k_auth, bot_auth):
        client.get("/api/auth/me", headers=auth)
    db = SessionLocal(); db.add(models.UserBlock(blocker_id=b, blocked_id=me)); db.commit(); db.close()
    _setze(k, social_allowed=False)
    assert _online(client, ich, b, k, bot) == []


def test_lesebestaetigung_nur_im_1zu1(client):
    """/api/chat/state meldet im 1:1, bis wohin das Gegenueber gelesen hat (✓✓); sonst None."""
    a, ida = _konto(client, "lesen-a@online.example.com")
    b, idb = _konto(client, "lesen-b@online.example.com")
    scope = "dm:%d-%d" % tuple(sorted([ida, idb]))
    m = client.post(f"/api/chat?scope={scope}", headers=a, json={"text": "hallo"}).json()
    assert client.get(f"/api/chat/state?scope={scope}", headers=a).json()["gelesen_bis"] == 0   # ✓
    client.post("/api/chat/read", headers=b, json={"scope": scope, "up_to": m["id"]})
    assert client.get(f"/api/chat/state?scope={scope}", headers=a).json()["gelesen_bis"] == m["id"]   # ✓✓
    assert client.get("/api/chat/state?scope=global:main", headers=a).json()["gelesen_bis"] is None
