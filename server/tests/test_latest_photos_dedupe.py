"""„Neueste Medien": dasselbe Bild an mehreren Sessions nur einmal (Jan, 18.10.2026).

Anlass: ein Nutzer haengte ein Bild an vier Sessions, im Community-Streifen stand es viermal
nebeneinander. Gleicher Upload ergibt beim Re-Encode byte-gleiche Dateien -> Hash erkennt es.
"""
import io
import secrets
from datetime import datetime, timedelta, timezone

from PIL import Image


def _bild(farbe):
    b = io.BytesIO()
    Image.new("RGB", (800, 600), farbe).save(b, format="JPEG")
    return b.getvalue()


def test_gleiches_bild_nur_einmal(client):
    from app import models
    from app.db import SessionLocal
    r = client.post("/api/auth/register", json={"email": "fotodoppelt@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    db = SessionLocal()
    sids = []
    try:
        t = datetime.now(timezone.utc) - timedelta(days=1)
        for i in range(4):
            s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t + timedelta(hours=i),
                               ended_at=t + timedelta(hours=i, minutes=30), sport="pumpfoil",
                               is_pumpfoil=True, status="analyzed", data_quality="ok")
            db.add(s); db.commit()
            sids.append(s.id)
    finally:
        db.close()
    gleich = _bild((10, 120, 200))
    for sid in sids[:3]:
        r = client.post(f"/api/sessions/{sid}/photos", headers=auth, files={"file": ("a.jpg", gleich, "image/jpeg")})
        assert r.status_code == 200, r.text
    r = client.post(f"/api/sessions/{sids[3]}/photos", headers=auth,
                    files={"file": ("b.jpg", _bild((220, 60, 20)), "image/jpeg")})
    assert r.status_code == 200, r.text

    feed = client.get("/api/community/latest-photos?limit=20", headers=auth).json()
    meine = [x for x in feed if x["kind"] == "photo" and x["session_id"] in sids]
    # zwei verschiedene Bilder -> zwei Kacheln; vom dreifachen das neueste (Session 3)
    assert sorted(x["session_id"] for x in meine) == sorted([sids[2], sids[3]])
