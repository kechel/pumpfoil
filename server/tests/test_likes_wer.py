"""Wer hat geliked (02.11.2026): nur der Inhaber sieht die Namen, alle anderen weiter nur die Zahl."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, tag):
    r = client.post("/api/auth/register", json={"email": f"likes-{tag}-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
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


def test_nur_inhaber_sieht_wer(client):
    (a, ka), (b, kb), (c, kc) = _konto(client, "a"), _konto(client, "b"), _konto(client, "c")
    sid = _session(a)
    assert client.post(f"/api/community/sessions/{sid}/like", headers=kb).status_code == 200
    l = client.get(f"/api/community/sessions/{sid}/likes", headers=ka).json()
    assert [x["user_id"] for x in l] == [b]
    assert client.get(f"/api/community/sessions/{sid}/likes", headers=kc).status_code == 404
