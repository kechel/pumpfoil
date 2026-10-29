"""S-016 / S-022 (29.10.2026): Anbieter-Tokens stehen verschluesselt in der DB, der PKCE-Verifier im
COROS-state ebenso."""
import secrets

from sqlalchemy import text


def _nutzer():
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        u = models.User(email=f"enc-{secrets.token_hex(3)}@b.de", password_hash="x")
        db.add(u); db.commit()
        return u.id
    finally:
        db.close()


def test_link_steht_verschluesselt_und_liest_sich_klar():
    from app import models
    from app.db import SessionLocal
    uid = _nutzer()
    db = SessionLocal()
    try:
        db.add(models.SuuntoLink(user_id=uid, access_token="klar-access", refresh_token="klar-refresh"))
        db.commit()
        roh = db.execute(text("SELECT access_token, refresh_token FROM suunto_links WHERE user_id = :u"),
                         {"u": uid}).one()
        assert roh[0].startswith("enc1:") and "klar" not in roh[0] and roh[1].startswith("enc1:")
        db.expire_all()
        l = db.query(models.SuuntoLink).filter_by(user_id=uid).one()
        assert (l.access_token, l.refresh_token) == ("klar-access", "klar-refresh")
    finally:
        db.close()


def test_altbestand_wird_einmal_verschluesselt():
    from app import db as dbmod, models
    from app.db import SessionLocal
    uid = _nutzer()
    db = SessionLocal()
    try:
        db.execute(text("INSERT INTO polar_links (user_id, polar_user_id, access_token, member_id, created_at, retry_count) "
                        "VALUES (:u, 'p', 'alt-klartext', 'm', now(), 0)"), {"u": uid})
        db.commit()
    finally:
        db.close()
    dbmod._tokens_verschluesseln()
    dbmod._tokens_verschluesseln()
    db = SessionLocal()
    try:
        roh = db.execute(text("SELECT access_token FROM polar_links WHERE user_id = :u"), {"u": uid}).scalar()
        assert roh.startswith("enc1:") and roh.count("enc1:") == 1
        assert db.query(models.PolarLink).filter_by(user_id=uid).one().access_token == "alt-klartext"
    finally:
        db.close()


def test_coros_state_verraet_den_verifier_nicht():
    import base64
    import json
    from app.api import coros_mcp
    st = coros_mcp._state_for(7, "geheimer-verifier-123")
    nutzlast = json.loads(base64.urlsafe_b64decode(st.split(".")[1] + "=="))
    assert "geheimer-verifier-123" not in json.dumps(nutzlast)
    assert coros_mcp._state_lesen(st) == (7, "geheimer-verifier-123")
