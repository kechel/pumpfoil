"""1:1 mit dem Bot-Account (Jan, 01.10.2026): kein Eingabefeld, sondern „Antworten bitte direkt an
Jan"; wer mit einer alten App trotzdem schreibt, landet im 1:1 mit Jan."""
from app.config import get_settings


def _konto(client, mail, admin=False):
    client.post("/api/auth/register", json={"email": mail, "password": "geheim123", "name": mail[:6]})
    tok = client.post("/api/auth/login", json={"email": mail, "password": "geheim123"}).json()["access_token"]
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    u = db.query(models.User).filter_by(email=mail).first()
    if admin:
        u.is_admin = True
    uid = u.id
    db.commit(); db.close()
    return {"Authorization": f"Bearer {tok}"}, uid


def test_bot_dm_leitet_an_jan_weiter(client, monkeypatch):
    bot_mail = get_settings().bot_email
    bot, bot_id = _konto(client, bot_mail, admin=True)
    jan, jan_id = _konto(client, "jan-weiter@example.com", admin=True)
    nutzer, nid = _konto(client, "fragend@example.com")
    monkeypatch.setenv("KONTAKT_EMAIL", "jan-weiter@example.com")

    bot_scope = "dm:%d-%d" % tuple(sorted([nid, bot_id]))
    jan_scope = "dm:%d-%d" % tuple(sorted([nid, jan_id]))

    st = client.get(f"/api/chat/state?scope={bot_scope}", headers=nutzer).json()
    assert st["weiter_an"]["id"] == jan_id
    # Der Bot selbst sieht in seinem Raum keinen Umleitungs-Hinweis und schreibt normal.
    assert client.get(f"/api/chat/state?scope={bot_scope}", headers=bot).json()["weiter_an"] is None
    r = client.post(f"/api/chat?scope={bot_scope}", headers=bot, json={"text": "Hallo vom Bot"})
    assert r.status_code == 200, r.text

    # Nutzer schreibt (alte App) in den Bot-Raum -> landet bei Jan.
    r = client.post(f"/api/chat?scope={bot_scope}", headers=nutzer, json={"text": "Frage an Claude"})
    assert r.status_code == 200, r.text
    bei_jan = [m["text"] for m in client.get(f"/api/chat?scope={jan_scope}", headers=jan).json()]
    im_bot = [m["text"] for m in client.get(f"/api/chat?scope={bot_scope}", headers=nutzer).json()]
    assert "Frage an Claude" in bei_jan
    assert "Frage an Claude" not in im_bot and "Hallo vom Bot" in im_bot

    # Andere 1:1-Chats bleiben unberuehrt.
    assert client.get(f"/api/chat/state?scope={jan_scope}", headers=nutzer).json()["weiter_an"] is None
