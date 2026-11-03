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
        # Mit Analyse, damit die Session in den Community-Listen (top-commented) zaehlt.
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=2)); db.commit()
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


def test_meist_kommentiert(client):
    (a, ka), (b, kb), (c, kc) = _konto(client, "a"), _konto(client, "b"), _konto(client, "c")
    s1, s2 = _session(a), _session(a)
    _kommentar(client, kb, s1, "eins")       # je Konto hoechstens zwei, sonst greift der Flood-Schutz neuer Konten
    _kommentar(client, kb, s2, "zwei")
    _kommentar(client, kc, s2, "drei")
    r = client.get("/api/community/top-commented", params={"limit": 20}, headers=kb).json()
    ids = [x["session_id"] for x in r]
    assert ids.index(s2) < ids.index(s1)
    assert next(x for x in r if x["session_id"] == s2)["comment_count"] == 2
    # Abgeschaltete Kommentare: die Session faellt raus.
    assert client.put("/api/settings", headers=ka, json={"comments_off": True}).status_code == 200
    r = client.get("/api/community/top-commented", params={"limit": 20}, headers=kb).json()
    assert s1 not in [x["session_id"] for x in r] and s2 not in [x["session_id"] for x in r]


def test_zeitraum_gilt_fuer_kommentar_und_like_nicht_fuer_fahrt(client):
    """„Heute" zeigt, was heute kommentiert/geliked wurde — auch an einer aelteren Session (Jan, 03.11.2026)."""
    from app import models
    from app.db import SessionLocal
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        s.started_at = s.started_at - timedelta(days=20); s.ended_at = s.ended_at - timedelta(days=20)
        db.commit()
    finally:
        db.close()
    _kommentar(client, kb, sid, "spaet, aber gern")
    _like(client, kb, sid)
    for pfad in ("top-commented", "top-liked"):
        r = client.get(f"/api/community/{pfad}", params={"period": "today", "limit": 20}, headers=kb).json()
        assert sid in [x["session_id"] for x in r], pfad
        r = client.get(f"/api/community/{pfad}", params={"period": "yesterday", "limit": 20}, headers=kb).json()
        assert sid not in [x["session_id"] for x in r], pfad
