"""Was beim Abhaken der Brett-Markierung in die DB gehoert.

Anlass (25.09.2026): Jan hatte #8546 — eine fenix-7X-Pro-Aufnahme — versehentlich als „am Brett"
markiert und den Haken wieder weggenommen. Danach stand dort `placement = "phone"`, also die
Behauptung, eine Uhr sei ein Handy-Recorder gewesen. `_handy_aufnahme` liest JEDEN gesetzten Wert
als „kam vom Handy", die Uhr waere damit dauerhaft falsch einsortiert.
"""
from __future__ import annotations


def test_leeres_placement_ist_erlaubt_und_leert_das_feld(client):
    """Der Server muss "" annehmen und daraus NULL machen — darauf stuetzt sich die Oberflaeche."""
    r = client.post("/api/auth/register", json={"email": "pl@b.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]

    import secrets
    from datetime import datetime, timedelta, timezone
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid,
                           started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           sport="pumpfoil", placement="board", is_pumpfoil=True)
        db.add(s); db.commit()
        sid = s.id
    finally:
        db.close()

    # Abhaken einer Aufnahme OHNE Kreisel -> leeres Feld, nicht "phone".
    r = client.patch(f"/api/sessions/{sid}/meta", headers=kopf, json={"placement": ""})
    assert r.status_code == 200, r.text
    assert r.json()["placement"] in (None, "")

    db = SessionLocal()
    try:
        assert db.get(models.Session, sid).placement is None
    finally:
        db.close()
