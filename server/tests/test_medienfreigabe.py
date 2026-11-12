"""Medien neuer Konten erst nach Freigabe fuer alle sichtbar (Jan, 12.11.2026, app/medienfreigabe.py): der Uploader sieht
sie normal, alle anderen nicht (Feed, Session-Details, Galerie, oeffentlicher Link); Admin gibt frei."""
import io
import secrets
from datetime import datetime, timedelta, timezone

from PIL import Image


def _konto(client, mail, admin=False, alter_tage=0):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=h).json()["id"]
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    u = db.get(models.User, uid)
    u.is_admin = admin
    u.created_at = datetime.now(timezone.utc) - timedelta(days=alter_tage)
    db.commit()
    db.close()
    return uid, h


def _session(uid):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    t = datetime.now(timezone.utc) - timedelta(days=1)
    s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(minutes=30),
                       sport="pumpfoil", is_pumpfoil=True, status="analyzed", data_quality="ok")
    db.add(s)
    db.commit()
    sid = s.id
    db.close()
    return sid


def _bild():
    b = io.BytesIO()
    Image.new("RGB", (800, 600), (secrets.randbelow(255), 90, 30)).save(b, format="JPEG")
    return b.getvalue()


def test_neues_konto_nur_uploader_sieht_bis_freigabe(client):
    tag = secrets.token_hex(3)
    neu, hn = _konto(client, f"mf-neu-{tag}@t.de")
    alt, ha = _konto(client, f"mf-alt-{tag}@t.de", alter_tage=30)
    _, hadm = _konto(client, f"mf-adm-{tag}@t.de", admin=True, alter_tage=30)
    sid = _session(neu)
    assert client.post(f"/api/sessions/{sid}/photos", headers=hn, files={"file": ("a.jpg", _bild(), "image/jpeg")}).status_code == 200
    assert client.post(f"/api/sessions/{sid}/videos", headers=hn, json={"youtube_url": f"https://www.youtube.com/watch?v=mf{tag}xxxx"}).status_code in (200, 201)
    # Uploader sieht alles
    assert len(client.get(f"/api/sessions/{sid}/photos", headers=hn).json()) == 1
    assert len(client.get(f"/api/sessions/{sid}/videos", headers=hn).json()) == 1
    soz = client.get(f"/api/community/sessions/{sid}/social", headers=hn).json()
    assert len(soz["photos"]) == 1 and len(soz["videos"]) == 1 and not soz.get("blocked_media")
    # andere nicht — auch kein Hinweis
    assert client.get(f"/api/sessions/{sid}/photos", headers=ha).json() == []
    assert client.get(f"/api/sessions/{sid}/videos", headers=ha).json() == []
    soz = client.get(f"/api/community/sessions/{sid}/social", headers=ha).json()
    assert soz["photos"] == [] and soz["videos"] == [] and not soz.get("blocked_media")
    feed = client.get("/api/community/latest-photos?limit=40", headers=ha).json()
    assert not any(x["session_id"] == sid for x in feed)
    assert any(x["session_id"] == sid for x in client.get("/api/community/latest-photos?limit=40", headers=hn).json())
    # Admin: Liste, Freigabe
    assert client.get("/api/admin/media-pending", headers=ha).status_code == 403
    pend = client.get("/api/admin/pending", headers=hadm).json()
    assert pend["photos"] >= 2 and "bewertungen" in pend and pend["users"] >= 1   # Reiter-Zahlen (12.11.2026)
    offen = [x for x in client.get("/api/admin/media-pending", headers=hadm).json() if x["session_id"] == sid]
    assert {x["art"] for x in offen} == {"photo", "video"}
    for x in offen:
        assert client.post(f"/api/admin/media/{x['art']}/{x['id']}/approve", headers=hadm).json()["ok"]
    assert len(client.get(f"/api/sessions/{sid}/photos", headers=ha).json()) == 1
    assert len(client.get(f"/api/sessions/{sid}/videos", headers=ha).json()) == 1
    assert not [x for x in client.get("/api/admin/media-pending", headers=hadm).json() if x["session_id"] == sid]
    # altes Konto: sofort fuer alle
    sid2 = _session(alt)
    client.post(f"/api/sessions/{sid2}/photos", headers=ha, files={"file": ("b.jpg", _bild(), "image/jpeg")})
    assert len(client.get(f"/api/sessions/{sid2}/photos", headers=hn).json()) == 1
