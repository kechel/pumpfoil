"""Polar/Suunto: vom Anbieter abgelehnter Zugang wird gemerkt und als expired gemeldet (19.10.2026)."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException


class _A:
    def __init__(self, code, text="", daten=None):
        self.status_code, self.text, self._d = code, text, daten or {}

    def json(self):
        return self._d


def _konto(client, name):
    r = client.post("/api/auth/register", json={"email": f"{name}@zugang.de", "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _user(db, name):
    from app.models import User
    return db.query(User).filter_by(email=f"{name}@zugang.de").one()


def test_polar_401_markiert_und_erfolg_loescht(client, monkeypatch):
    from app import models
    from app.api import polar
    from app.db import SessionLocal
    auth = _konto(client, "polar401")
    db = SessionLocal()
    try:
        u = _user(db, "polar401")
        link = models.PolarLink(user_id=u.id, polar_user_id="x1", access_token="t", member_id="m")
        db.add(link); db.commit()
        monkeypatch.setattr(polar.httpx, "post", lambda *a, **k: _A(401, "unauthorized"))
        with pytest.raises(HTTPException):
            polar._pull_import(db, u, link)
        assert link.zugang_abgelehnt_at is not None
    finally:
        db.close()
    monkeypatch.setattr(polar, "_cfg", lambda: {"client_id": "a", "client_secret": "b"})
    assert client.get("/api/integrations/polar/status", headers=auth).json()["expired"] is True
    db = SessionLocal()
    try:
        u = _user(db, "polar401")
        link = db.query(models.PolarLink).filter_by(user_id=u.id).one()
        monkeypatch.setattr(polar.httpx, "post", lambda *a, **k: _A(204))
        polar._pull_import(db, u, link)
        assert link.zugang_abgelehnt_at is None
    finally:
        db.close()
    assert client.get("/api/integrations/polar/status", headers=auth).json()["expired"] is False


def test_suunto_invalid_grant_markiert(client, monkeypatch):
    from app import models
    from app.api import suunto
    from app.db import SessionLocal
    _konto(client, "suuntoig")
    db = SessionLocal()
    try:
        u = _user(db, "suuntoig")
        link = models.SuuntoLink(user_id=u.id, access_token="alt", refresh_token="rt",
                                 token_expires_at=datetime.now(timezone.utc) - timedelta(hours=1))
        db.add(link); db.commit()
        monkeypatch.setattr(suunto, "_token_post", lambda *a, **k: _A(503, "busy"))
        suunto._fresh_token(link, db)
        assert link.zugang_abgelehnt_at is None          # Suunto kurz weg: nichts markieren
        monkeypatch.setattr(suunto, "_token_post", lambda *a, **k: _A(400, '{"error":"invalid_grant"}'))
        suunto._fresh_token(link, db)
        assert link.zugang_abgelehnt_at is not None
        monkeypatch.setattr(suunto, "_token_post",
                            lambda *a, **k: _A(200, daten={"access_token": "neu", "refresh_token": "rt2", "expires_in": 86400}))
        assert suunto._fresh_token(link, db) == "neu"
        assert link.zugang_abgelehnt_at is None
    finally:
        db.close()
