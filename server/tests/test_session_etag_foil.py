"""ETag der Session-Detailseite muss sich aendern, wenn der Foil-Name im Katalog sich aendert.

Anlass 04.10.2026: nach der Zusammenfuehrung „Gong TRAIL V3 / V3 ATMO PERF" zeigte die PWA den alten
Namen weiter — die Session selbst war unveraendert, der Server antwortete 304."""
from __future__ import annotations


def test_umbenanntes_foil_bricht_das_etag(client):
    r = client.post("/api/auth/register", json={"email": "etag@b.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]

    import secrets
    from datetime import datetime, timedelta, timezone
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        f = models.Foil(brand="Testmarke", model="ALT", size="M", span_cm=100, area_cm2=1000)
        db.add(f); db.flush()
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, foil_id=f.id,
                           started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           sport="pumpfoil", is_pumpfoil=True, status="analyzed")
        db.add(s); db.commit()
        sid, fid = s.id, f.id
    finally:
        db.close()

    a = client.get(f"/api/sessions/{sid}", headers=kopf)
    assert a.status_code == 200
    etag = a.headers["etag"]
    assert client.get(f"/api/sessions/{sid}", headers={**kopf, "If-None-Match": etag}).status_code == 304

    db = SessionLocal()
    try:
        db.get(models.Foil, fid).model = "NEU"; db.commit()
    finally:
        db.close()
    b = client.get(f"/api/sessions/{sid}", headers={**kopf, "If-None-Match": etag})
    assert b.status_code == 200
    assert b.json()["foil"]["model"] == "NEU"
