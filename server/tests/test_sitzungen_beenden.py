"""Passwortwechsel, Zuruecksetzen und „ueberall abmelden" beenden alte Anmeldungen (Security-Review 29.10.2026).

Vorher prueften alle Anfragen `users.session_epoch`, aber nichts setzte die Spalte — ein entwendetes Token
ueberlebte jedes neue Passwort.
"""
from __future__ import annotations

import secrets
import time


def _anmelden(client, mail, pw="supersecret"):
    r = client.post("/api/auth/login", json={"email": mail, "password": pw})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _neu(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code in (200, 201), r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _me(client, kopf):
    return client.get("/api/auth/me", headers=kopf).status_code


def test_passwortwechsel_meldet_andere_geraete_ab_und_dieses_nicht(client):
    handy = _neu(client, "sitzung-pw@b.de")
    time.sleep(1.1)                  # iat ist sekundengenau: das alte Token muss AELTER sein
    r = client.put("/api/auth/me/password", headers=handy,
                   json={"current_password": "supersecret", "new_password": "nochgeheimer"})
    assert r.status_code == 200, r.text
    frisch = r.headers.get("X-Refresh-Token")
    assert frisch, "ohne frisches Token waere auch dieses Geraet abgemeldet"
    assert _me(client, handy) == 401, "das alte Token gilt nach dem Passwortwechsel nicht mehr"
    assert _me(client, {"Authorization": f"Bearer {frisch}"}) == 200
    assert _me(client, _anmelden(client, "sitzung-pw@b.de", "nochgeheimer")) == 200


def test_ueberall_abmelden(client):
    pc = _neu(client, "sitzung-alle@b.de")
    handy = _anmelden(client, "sitzung-alle@b.de")
    time.sleep(1.1)
    r = client.post("/api/auth/logout-all", headers=pc)
    assert r.status_code == 200, r.text
    assert _me(client, handy) == 401
    assert _me(client, {"Authorization": f"Bearer {r.json()['access_token']}"}) == 200


def test_reset_beendet_sitzungen_und_alte_reset_links(client):
    from datetime import datetime, timedelta, timezone

    from app import models
    from app.db import SessionLocal
    alt = _neu(client, "sitzung-reset@b.de")
    uid = client.get("/api/auth/me", headers=alt).json()["id"]
    db = SessionLocal()
    try:
        bis = datetime.now(timezone.utc) + timedelta(minutes=30)
        db.add_all([models.PasswordReset(user_id=uid, token="reset-eins-" + str(uid), expires_at=bis),
                    models.PasswordReset(user_id=uid, token="reset-zwei-" + str(uid), expires_at=bis)])
        db.commit()
    finally:
        db.close()
    time.sleep(1.1)
    r = client.post("/api/auth/reset-password", json={"token": f"reset-eins-{uid}", "new_password": "ganzneu123"})
    assert r.status_code == 200, r.text
    assert _me(client, alt) == 401
    assert _me(client, {"Authorization": f"Bearer {r.json()['access_token']}"}) == 200
    r = client.post("/api/auth/reset-password", json={"token": f"reset-zwei-{uid}", "new_password": "nochmal123"})
    assert r.status_code == 400, "ein zweiter offener Reset-Link darf nach dem Reset nicht mehr gehen"


def test_aufnahmen_gesperrter_konten_und_gemeldete_nicht_per_id(client):
    """Security-Review 29.10.2026 (S-041): dieselben Riegel wie im Feed, Besitzer sieht weiter alles."""
    import secrets
    from datetime import datetime, timezone

    from app import models
    from app.db import SessionLocal
    besitzer = _neu(client, "readable-besitzer@b.de")
    leser = _neu(client, "readable-leser@b.de")
    uid = client.get("/api/auth/me", headers=besitzer).json()["id"]
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=datetime.now(timezone.utc),
                           sport="pumpfoil", is_pumpfoil=True, status="done")
        db.add(s); db.commit()
        sid = s.id
    finally:
        db.close()

    def setzen(**f):
        db = SessionLocal()
        try:
            for k, v in f.items():
                obj = db.get(models.User, uid) if k in ("hidden", "blocked") else db.get(models.Session, sid)
                setattr(obj, k, v)
            db.commit()
        finally:
            db.close()

    assert client.get(f"/api/sessions/{sid}", headers=leser).status_code == 200
    setzen(flagged=True)
    assert client.get(f"/api/sessions/{sid}", headers=leser).status_code == 404
    assert client.get(f"/api/sessions/{sid}/attempts", headers=leser).status_code == 404
    assert client.get(f"/api/sessions/{sid}", headers=besitzer).status_code == 200
    setzen(flagged=False, hidden=True)
    assert client.get(f"/api/sessions/{sid}", headers=leser).status_code == 404
    assert client.get(f"/api/sessions/{sid}", headers=besitzer).status_code == 200


def test_login_alte_hashes_werden_aufgefrischt(client):
    from app import models
    from app.db import SessionLocal
    from app.security import needs_rehash
    import hashlib, secrets
    _neu(client, "rehash@b.de")
    salt = secrets.token_bytes(16)
    alt = f"pbkdf2_sha256$200000${salt.hex()}${hashlib.pbkdf2_hmac('sha256', b'supersecret', salt, 200000).hex()}"
    db = SessionLocal()
    try:
        u = db.query(models.User).filter_by(email="rehash@b.de").one()
        u.password_hash = alt
        db.commit()
    finally:
        db.close()
    assert _me(client, _anmelden(client, "rehash@b.de")) == 200, "alter Hash muss weiter gelten"
    db = SessionLocal()
    try:
        assert not needs_rehash(db.query(models.User).filter_by(email="rehash@b.de").one().password_hash)
    finally:
        db.close()


def test_login_fehlversuche_je_konto_begrenzt(client):
    from app.api import auth
    _neu(client, "bruteforce@b.de")
    # IP-Limit (10/5 min) umgehen wie ein verteilter Angreifer: der Test ruft die Funktion direkt.
    from app.db import SessionLocal
    from fastapi import BackgroundTasks, HTTPException
    from app.schemas import LoginIn
    db = SessionLocal()
    try:
        codes = []
        for _ in range(31):
            try:
                auth.login(LoginIn(email="bruteforce@b.de", password="falsch-falsch"), BackgroundTasks(), db)
            except HTTPException as e:
                codes.append(e.status_code)
        assert codes[:30] == [401] * 30 and codes[30] == 429, codes
    finally:
        db.close()


def test_register_vergeben_global_gebremst(client, monkeypatch):
    """S-017 (29.10.2026): „schon vergeben" bleibt, aber ueber alle IPs gedeckelt."""
    from app.api import auth
    monkeypatch.setattr(auth, "REGISTER_VERGEBEN_MAX", 2)
    mail = f"vergeben-{secrets.token_hex(3)}@b.de"
    assert client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).status_code == 200
    codes = [client.post("/api/auth/register", json={"email": mail, "password": "supersecret"},
                         headers={"X-Forwarded-For": f"10.0.0.{i}"}).status_code for i in range(3)]
    assert codes == [409, 409, 429]
