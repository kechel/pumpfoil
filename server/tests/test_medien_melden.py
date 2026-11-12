"""Medien melden (12.11.2026): Anlass war ein Werbe-Link als „Video" an einer Session im Feed „Neueste Medien".
Melden je Nutzer einmal, ab 3 Meldungen gesperrt (weg aus Feed/Galerie), die Session zeigt die Zahl gesperrter
Medien; Admin sieht die Meldungen, sperrt/entsperrt (auch Videos) und markiert sie als erledigt."""
import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail, admin=False):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=h).json()["id"]
    if admin:
        from app import models
        from app.db import SessionLocal
        db = SessionLocal()
        db.get(models.User, uid).is_admin = True
        db.commit()
        db.close()
    return uid, h


def test_video_melden_sperren_hinweis_admin(client):
    from app import models
    from app.db import SessionLocal
    tag = secrets.token_hex(3)
    besitzer, hb = _konto(client, f"mm-besitzer-{tag}@t.de")
    melder = [_konto(client, f"mm-melder{i}-{tag}@t.de") for i in range(3)]
    _, ha = _konto(client, f"mm-admin-{tag}@t.de", admin=True)
    db = SessionLocal()
    t = datetime.now(timezone.utc) - timedelta(days=1)
    s = models.Session(session_uuid=secrets.token_hex(16), user_id=besitzer, started_at=t, ended_at=t + timedelta(minutes=30),
                       sport="pumpfoil", is_pumpfoil=True, status="analyzed", data_quality="ok")
    db.add(s)
    db.commit()
    v = models.SessionVideo(session_id=s.id, user_id=besitzer, youtube_url=f"https://www.youtube.com/watch?v=spam{tag}")
    db.add(v)
    db.commit()
    sid, vid = s.id, v.id
    db.close()
    feed = client.get("/api/community/latest-photos?limit=40", headers=melder[0][1]).json()
    assert any(x.get("video_id") == vid for x in feed)
    assert client.post(f"/api/community/media/video/{vid}/report", headers=hb).status_code == 400     # eigenes nicht
    for i, (_, h) in enumerate(melder):
        r = client.post(f"/api/community/media/video/{vid}/report", headers=h).json()
        assert r["hidden"] is (i == 2), r
    assert client.post(f"/api/community/media/video/{vid}/report", headers=melder[0][1]).json()["report_count"] == 3   # einmal je Nutzer
    feed = client.get("/api/community/latest-photos?limit=40", headers=melder[0][1]).json()
    assert not any(x.get("video_id") == vid for x in feed)
    assert client.get(f"/api/sessions/{sid}/videos", headers=melder[0][1]).json() == []
    assert client.get(f"/api/sessions/{sid}/blocked-media", headers=melder[0][1]).json() == {"photos": 0, "videos": 1, "total": 1}
    # Admin
    assert client.get("/api/admin/media-reports", headers=melder[0][1]).status_code == 403
    liste = client.get("/api/admin/media-reports", headers=ha).json()
    z = next(x for x in liste if x["art"] == "video" and x["id"] == vid)
    assert z["blocked"] and z["report_count"] == 3 and len(z["melder"]) == 3
    assert client.post(f"/api/admin/media/video/{vid}/block?blocked=false", headers=ha).json()["blocked"] is False
    assert client.get(f"/api/sessions/{sid}/blocked-media", headers=hb).json()["total"] == 0
    assert client.post(f"/api/admin/media/video/{vid}/dismiss", headers=ha).json()["erledigt"] == 3
    assert not any(x["id"] == vid and x["art"] == "video" for x in client.get("/api/admin/media-reports", headers=ha).json())
