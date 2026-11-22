"""Kommentare zu Sessions (02.11.2026, app/kommentare.py): Chat-Raum `session:<id>` mit eigenen Regeln."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, tag):
    r = client.post("/api/auth/register", json={"email": f"komm-{tag}-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _session(uid):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=1)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(minutes=30),
                           sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True, status="analyzed")
        db.add(s); db.commit()
        return s.id
    finally:
        db.close()


def _post(client, kopf, sid, text):
    return client.post("/api/chat", params={"scope": f"session:{sid}"}, headers=kopf, json={"text": text})


def _liste(client, kopf, sid):
    return client.get("/api/chat", params={"scope": f"session:{sid}"}, headers=kopf).json()


def test_kommentieren_zaehlen_und_lesen(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    assert _post(client, kb, sid, "Starker Lauf!").status_code == 200
    assert [m["text"] for m in _liste(client, ka, sid)] == ["Starker Lauf!"]
    assert client.get(f"/api/sessions/{sid}", headers=kb).json()["comment_count"] == 1


def test_inhaber_kann_abschalten(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    assert _post(client, kb, sid, "vorher").status_code == 200
    assert client.put("/api/settings", headers=ka, json={"comments_off": True}).status_code == 200
    assert _post(client, kb, sid, "nachher").status_code == 403
    assert _liste(client, kb, sid) == []
    assert client.get(f"/api/sessions/{sid}", headers=kb).json()["comment_count"] == 0


def test_gesperrte_kommentieren_nicht(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    assert client.post("/api/chat/block", headers=ka, json={"user_id": b}).status_code == 200
    assert _post(client, kb, sid, "hallo").status_code == 403


def test_inhaber_loescht_fremden_kommentar(client):
    (a, ka), (b, kb), (c, kc) = _konto(client, "a"), _konto(client, "b"), _konto(client, "c")
    sid = _session(a)
    mid = _post(client, kb, sid, "doof").json()["id"]
    # Ein Dritter darf das nicht, der Inhaber schon.
    assert client.delete(f"/api/chat/{mid}", headers=kc).status_code == 403
    assert client.delete(f"/api/chat/{mid}", headers=ka).status_code == 200
    assert _liste(client, ka, sid) == []


def test_geloeschte_session_keine_kommentare(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    assert client.delete(f"/api/sessions/{sid}", headers=ka).status_code == 200
    assert _post(client, kb, sid, "hallo").status_code == 404


def test_kontoloeschung_nimmt_fremde_kommentare_mit(client):
    from app import kommentare, models
    from app.db import SessionLocal
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    sid = _session(a)
    assert _post(client, kb, sid, "bleibt nicht").status_code == 200
    db = SessionLocal()
    try:
        from app.loeschung import konto_loeschen
        konto_loeschen(db, db.get(models.User, a))
        assert db.query(models.ChatMessage).filter_by(scope=kommentare.scope(sid)).count() == 0
    finally:
        db.close()


def test_gemeldete_session_wie_beim_lesen(client):
    """R2-G6 (Security-Review 22.11.2026, S-041 vervollstaendigt): eine gemeldete Session ist fuer andere nicht lesbar —
    jetzt auch nicht ueber Kommentare, /social, Like, neue Stimme und den Teilen-Link. Besitzer sieht alles, die eigene
    Stimme zuruecknehmen geht weiter."""
    from app import models
    from app.db import SessionLocal
    (a, ka), (b, kb) = _konto(client, "g6a"), _konto(client, "g6b")
    sid = _session(a)
    assert client.post(f"/api/community/sessions/{sid}/vote", params={"kind": "inappropriate"}, headers=kb).status_code == 200
    tok = client.post(f"/api/sessions/{sid}/share", headers=ka).json()["token"]
    db = SessionLocal()
    try:
        assert db.get(models.Session, sid).flagged
    finally:
        db.close()
    assert _post(client, kb, sid, "hallo").status_code == 404
    assert _liste(client, kb, sid) == []
    assert client.get(f"/api/community/sessions/{sid}/social", headers=kb).status_code == 404
    assert client.post(f"/api/community/sessions/{sid}/like", headers=kb).status_code == 404
    assert client.post(f"/api/community/sessions/{sid}/vote", params={"kind": "fake"}, headers=kb).status_code == 404
    assert client.get(f"/api/public/session/{tok}").status_code == 404
    # Besitzer: alles wie bisher
    assert _post(client, ka, sid, "meins").status_code == 200
    assert client.get(f"/api/community/sessions/{sid}/social", headers=ka).status_code == 200
    # Ruecknahme der eigenen Meldung geht, danach ist die Session wieder sichtbar
    assert client.post(f"/api/community/sessions/{sid}/vote", params={"kind": "inappropriate"}, headers=kb).status_code == 200
    assert client.get(f"/api/community/sessions/{sid}/social", headers=kb).status_code == 200
    assert client.get(f"/api/public/session/{tok}").status_code == 200
