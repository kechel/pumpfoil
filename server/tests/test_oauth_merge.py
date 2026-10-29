"""E-Mail-Merge bei Google/Apple-Anmeldung — Security-Review 29.10.2026 (Konto-Uebernahme vor der Registrierung).

Angriff: fremd@… mit eigenem Passwort registrieren und warten, bis sich der echte Besitzer erstmals per
Google anmeldet. Frueher landete er im Konto des Angreifers, dessen Passwort weiter galt.
"""
from __future__ import annotations

from app import models
from app.api import oauth
from app.db import SessionLocal


def _registrieren(client, mail, pw="angreifer123"):
    r = client.post("/api/auth/register", json={"email": mail, "password": pw})
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_bestaetigte_mail_uebernimmt_konto_und_verwirft_das_fremde_passwort(client, monkeypatch):
    import time
    mails = []
    monkeypatch.setattr("app.mailer.send_email", lambda *a, **k: mails.append(a))
    angreifer = _registrieren(client, "opfer-merge@b.de")
    uid = client.get("/api/auth/me", headers=angreifer).json()["id"]
    time.sleep(1.1)
    db = SessionLocal()
    try:
        u = oauth._login_or_create(db, "google", "sub-opfer-1", "opfer-merge@b.de", "Opfer",
                                   email_bestaetigt=True)
        assert u.id == uid
    finally:
        db.close()
    r = client.post("/api/auth/login", json={"email": "opfer-merge@b.de", "password": "angreifer123"})
    assert r.status_code == 401, "das vorab gesetzte Passwort darf nach dem Nachweis nicht mehr gelten"
    assert client.get("/api/auth/me", headers=angreifer).status_code == 401, "Sitzung des Angreifers beendet"
    assert mails and mails[0][0] == "opfer-merge@b.de"


def test_unbestaetigte_mail_fuehrt_nicht_zusammen(client):
    _registrieren(client, "opfer-unbestaetigt@b.de")
    db = SessionLocal()
    try:
        vorhanden = db.query(models.User).filter_by(email="opfer-unbestaetigt@b.de").one().id
        u = oauth._login_or_create(db, "google", "sub-opfer-2", "opfer-unbestaetigt@b.de", "X",
                                   email_bestaetigt=False)
        assert u.id != vorhanden
        assert u.email.endswith("@oauth.local"), u.email
    finally:
        db.close()
    r = client.post("/api/auth/login", json={"email": "opfer-unbestaetigt@b.de", "password": "angreifer123"})
    assert r.status_code == 200, "das bestehende Konto bleibt unberuehrt"


def test_zweiter_anbieter_auf_bestaetigtem_konto_laesst_passwort_in_ruhe(client, monkeypatch):
    """Traegt das Konto schon eine Anbieter-Anmeldung, war seine E-Mail bereits nachgewiesen."""
    monkeypatch.setattr("app.mailer.send_email", lambda *a, **k: None)
    db = SessionLocal()
    try:
        u1 = oauth._login_or_create(db, "apple", "sub-zwei-a", "zwei-anbieter@b.de", "Z", email_bestaetigt=True)
        hash_vorher = u1.password_hash
        u2 = oauth._login_or_create(db, "google", "sub-zwei-g", "zwei-anbieter@b.de", "Z", email_bestaetigt=True)
        assert u2.id == u1.id and u2.password_hash == hash_vorher
    finally:
        db.close()


def test_email_verified_als_text_wie_bei_apple():
    assert oauth._email_bestaetigt({"email_verified": "true"})
    assert oauth._email_bestaetigt({"email_verified": True})
    assert not oauth._email_bestaetigt({"email_verified": "false"})
    assert not oauth._email_bestaetigt({})
