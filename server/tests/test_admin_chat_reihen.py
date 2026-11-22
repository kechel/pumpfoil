"""Admin-Verlauf: Kommentare zu Sessions und alle Chatnachrichten als eigene Reihen (Jan, 22.11.2026)."""
from __future__ import annotations

import secrets
from datetime import datetime, timezone

from test_medien_melden import _konto


def test_kommentare_und_chat_im_verlauf(client):
    from app import models
    from app.db import SessionLocal
    tag = secrets.token_hex(3)
    uid, _ = _konto(client, f"chatreihe-{tag}@t.de")
    _, ha = _konto(client, f"chatreihe-admin-{tag}@t.de", admin=True)
    vorher = client.get("/api/admin/stats-series?period=today", headers=ha).json()["totals"]
    db = SessionLocal()
    jetzt = datetime.now(timezone.utc)
    for scope in ("session:999999", "global", "spot:x"):
        db.add(models.ChatMessage(scope=scope, user_id=uid, text="hallo", created_at=jetzt))
    db.commit()
    db.close()
    r = client.get("/api/admin/stats-series?period=today", headers=ha).json()
    assert r["totals"]["comments"] - vorher["comments"] == 1
    assert r["totals"]["chat"] - vorher["chat"] == 3
    heute = next(b for b in r["buckets"] if b["date"] == str(jetzt.date()))
    assert heute["comments"] >= 1 and heute["chat"] >= 3
