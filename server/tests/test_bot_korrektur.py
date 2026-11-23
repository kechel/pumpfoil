"""Bot-Reiter: Admin korrigiert/loescht Bot-Nachrichten, sieht den Lesestand (Jan, 23.11.2026)."""
from __future__ import annotations

import secrets

from test_medien_melden import _konto


def test_bot_nachricht_bearbeiten_loeschen_gelesen(client, monkeypatch):
    from app import models
    from app.config import get_settings
    from app.db import SessionLocal
    tag = secrets.token_hex(3)
    bot_mail = f"bot-{tag}@t.de"
    bot_id, _ = _konto(client, bot_mail)
    nutzer_id, hn = _konto(client, f"botnutzer-{tag}@t.de")
    _, ha = _konto(client, f"botadmin-{tag}@t.de", admin=True)
    monkeypatch.setattr(get_settings(), "bot_email", bot_mail)
    a, b = sorted((bot_id, nutzer_id))
    scope = f"dm:{a}-{b}"
    db = SessionLocal()
    m_bot = models.ChatMessage(scope=scope, user_id=bot_id, text="Thanks, that was exactly what we needed.")
    m_nutzer = models.ChatMessage(scope=scope, user_id=nutzer_id, text="hallo")
    db.add_all([m_bot, m_nutzer])
    db.commit()
    bot_mid, nutzer_mid = m_bot.id, m_nutzer.id
    db.close()

    msgs = client.get(f"/api/chat/bot/messages?scope={scope}", headers=ha).json()
    assert next(m for m in msgs if m["id"] == bot_mid)["read"] is False
    assert "read" not in next(m for m in msgs if m["id"] == nutzer_mid)

    # nur Admins, nur Bot-Nachrichten
    assert client.patch(f"/api/chat/bot/messages/{bot_mid}", json={"text": "x"}, headers=hn).status_code == 403
    assert client.patch(f"/api/chat/bot/messages/{nutzer_mid}", json={"text": "x"}, headers=ha).status_code == 404
    assert client.delete(f"/api/chat/bot/messages/{nutzer_mid}", headers=ha).status_code == 404

    r = client.patch(f"/api/chat/bot/messages/{bot_mid}", json={"text": "Thanks for the test."}, headers=ha)
    assert r.status_code == 200 and r.json()["text"] == "Thanks for the test."
    assert client.patch(f"/api/chat/bot/messages/{bot_mid}", json={"text": "  "}, headers=ha).status_code == 400

    db = SessionLocal()
    db.add(models.ChatRoomState(user_id=nutzer_id, scope=scope, last_read_id=bot_mid))
    db.commit()
    db.close()
    msgs = client.get(f"/api/chat/bot/messages?scope={scope}", headers=ha).json()
    assert next(m for m in msgs if m["id"] == bot_mid)["read"] is True

    assert client.delete(f"/api/chat/bot/messages/{bot_mid}", headers=ha).status_code == 200
    db = SessionLocal()
    assert db.get(models.ChatMessage, bot_mid) is None
    assert db.get(models.ChatMessage, nutzer_mid) is not None
    db.close()
