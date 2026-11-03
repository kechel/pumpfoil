"""„Neu bei deinen Sessions" (03.11.2026, GET /api/community/my-activity): Kommentare und Likes anderer."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, tag):
    r = client.post("/api/auth/register", json={"email": f"akt-{tag}-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _session(uid):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=1)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(minutes=30),
                           sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True, status="analyzed", place_name="Testsee")
        db.add(s); db.commit()
        return s.id
    finally:
        db.close()


def _aktivitaet(client, kopf):
    r = client.get("/api/community/my-activity", headers=kopf)
    assert r.status_code == 200
    return r.json()


def _kommentar(client, kopf, sid, text):
    assert client.post("/api/chat", params={"scope": f"session:{sid}"}, headers=kopf, json={"text": text}).status_code == 200


def _like(client, kopf, sid):
    assert client.post(f"/api/community/sessions/{sid}/like", headers=kopf).json()["liked"] is True


def test_kommentare_und_likes_anderer(client):
    (a, ka), (b, kb), (c, kc) = _konto(client, "a"), _konto(client, "b"), _konto(client, "c")
    sid = _session(a)
    _like(client, kb, sid)
    _like(client, kc, sid)
    _kommentar(client, kb, sid, "Starker Lauf!")
    _kommentar(client, ka, sid, "danke")            # eigener Kommentar zaehlt nicht
    akt = _aktivitaet(client, ka)
    assert [e["typ"] for e in akt] == ["comment", "like"]
    assert akt[0]["text"] == "Starker Lauf!" and akt[0]["user"]["id"] == b and akt[0]["spot"] == "Testsee"
    assert akt[1]["anzahl"] == 2 and akt[1]["user"]["id"] == c      # Likes zusammengefasst, neuester Liker vorn
    # Fremde Sessions tauchen beim Liker nicht auf.
    assert _aktivitaet(client, kb) == []


def test_gesperrte_und_abgeschaltete_kommentare(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    _like(client, kb, sid)
    _kommentar(client, kb, sid, "hallo")
    assert client.put("/api/settings", headers=ka, json={"comments_off": True}).status_code == 200
    assert [e["typ"] for e in _aktivitaet(client, ka)] == ["like"]
    assert client.post("/api/chat/block", headers=ka, json={"user_id": b}).status_code == 200
    assert _aktivitaet(client, ka) == []


def test_geloeschte_session_faellt_raus(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    _like(client, kb, sid)
    assert client.delete(f"/api/sessions/{sid}", headers=ka).status_code == 200
    assert _aktivitaet(client, ka) == []
