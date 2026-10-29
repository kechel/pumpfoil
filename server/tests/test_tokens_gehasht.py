"""S-016 (29.10.2026): Geraete- und Reset-Tokens stehen nur noch als SHA-256 in der DB."""
import secrets


def _konto(client):
    mail = f"tok-{secrets.token_hex(3)}@b.de"
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return mail, {"Authorization": f"Bearer {r.json()['access_token']}"}


def _db():
    from app.db import SessionLocal
    return SessionLocal()


def test_mint_speichert_nur_den_hash_und_die_uhr_kommt_rein(client):
    from app import models
    from app.security import token_hash
    _, kopf = _konto(client)
    roh = client.post("/api/devices/mint?label=Uhr", headers=kopf).json()["device_token"]
    db = _db()
    try:
        assert db.query(models.DeviceToken).filter_by(token=roh).first() is None
        assert db.query(models.DeviceToken).filter_by(token=token_hash(roh)).first() is not None
    finally:
        db.close()
    assert client.get("/api/devices/config", headers={"X-Device-Token": roh}).status_code != 401
    assert client.get("/api/devices/config", headers={"X-Device-Token": token_hash(roh) + "x"}).status_code == 401


def test_umstellung_hasht_genau_einmal_und_alte_uhren_bleiben_drin(client):
    from sqlalchemy import text
    from app import db as dbmod, models
    from app.security import token_hash
    _, kopf = _konto(client)
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    roh = "altes-roh-token-" + secrets.token_hex(8)
    db = _db()
    try:
        d = models.DeviceToken(user_id=uid, token=roh, label="Alt")
        db.add(d); db.commit()
        db.execute(text("UPDATE device_tokens SET token_gehasht = NULL WHERE id = :i"), {"i": d.id}); db.commit()
        did = d.id
    finally:
        db.close()
    # Vor der Umstellung: roher Wert in der DB, die Uhr kommt trotzdem rein (token_kandidaten).
    assert client.get("/api/devices/config", headers={"X-Device-Token": roh}).status_code != 401
    dbmod._tokens_hashen()
    dbmod._tokens_hashen()            # zweiter Lauf darf NICHT noch einmal hashen
    db = _db()
    try:
        assert db.get(models.DeviceToken, did).token == token_hash(roh)
    finally:
        db.close()
    assert client.get("/api/devices/config", headers={"X-Device-Token": roh}).status_code != 401


def test_reverse_pairing_mit_hash(client):
    from app import models
    from app.security import token_hash
    _, kopf = _konto(client)
    init = client.post("/api/devices/pair-init", json={"label": "Uhr", "platform": "garmin"}).json()
    assert client.post("/api/devices/pair-claim", json={"code": init["code"]}, headers=kopf).json()["ok"]
    roh = client.get(f"/api/devices/pair-poll?claim_token={init['claim_token']}").json()["device_token"]
    db = _db()
    try:
        assert db.query(models.DeviceToken).filter_by(token=token_hash(roh)).first() is not None
    finally:
        db.close()
    assert client.get("/api/devices/config", headers={"X-Device-Token": roh}).status_code != 401


def test_reset_token_nur_als_hash(client, monkeypatch):
    from app import models
    from app.api import auth
    mail, _ = _konto(client)
    gesendet = []
    monkeypatch.setattr(auth, "send_email", lambda an, betreff, text, *a, **k: gesendet.append(text))
    client.post("/api/auth/forgot-password", json={"email": mail})
    roh = gesendet[0].split("token=")[1].split()[0].strip()
    db = _db()
    try:
        assert db.query(models.PasswordReset).filter_by(token=roh).first() is None
    finally:
        db.close()
    r = client.post("/api/auth/reset-password", json={"token": roh, "new_password": "nochgeheimer1"})
    assert r.status_code == 200
