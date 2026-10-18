"""Push-Einstellungen je Typ (notify_prefs). Bis 18.10.2026 verwarf der Server den Chat-Schalter."""
from app import models
from app.push import wants


def _konto(client, kennung):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_chat_und_freunde_abschaltbar(client):
    auth = _konto(client, "push-prefs")
    client.put("/api/settings", headers=auth,
               json={"notify_prefs": {"chat": False, "friend": False, "like": True, "unbekannt": False}})
    np = client.get("/api/settings", headers=auth).json()["notify_prefs"]
    assert np["chat"] is False and np["friend"] is False and np["like"] is True
    assert "unbekannt" not in np
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        uid = db.query(models.User).filter_by(email="push-prefs@test.de").one().id
        assert not wants(db, uid, "chat") and not wants(db, uid, "friend") and wants(db, uid, "analyzed")
    finally:
        db.close()


def test_teil_speichern_behaelt_den_rest(client):
    auth = _konto(client, "push-teil")
    client.put("/api/settings", headers=auth, json={"notify_prefs": {"chat": False}})
    client.put("/api/settings", headers=auth, json={"notify_prefs": {"like": False}})
    np = client.get("/api/settings", headers=auth).json()["notify_prefs"]
    assert np["chat"] is False and np["like"] is False
