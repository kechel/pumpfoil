"""Demo-Modus: gruene Spots + „gerade am Pumpen" zu einem vergangenen Zeitpunkt (20.10.2026)."""
from datetime import datetime, timedelta, timezone


def test_demo_aktiv_nur_admin_und_regeln_wie_live(client):
    from app.db import SessionLocal
    from app import models

    def konto(mail):
        r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
        auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
        return auth, client.get("/api/auth/me", headers=auth).json()["id"]

    nutzer, _ = konto("demo-nutzer@x.de")
    admin, aid = konto("demo-admin@x.de")
    db = SessionLocal()
    db.get(models.User, aid).is_admin = True
    gross = models.Spot(name="DemoGross", lat=-60.0, lon=-120.0)
    klein = models.Spot(name="DemoKlein", lat=-62.0, lon=-125.0)
    db.add_all([gross, klein]); db.flush()
    t = datetime(2026, 9, 1, 12, tzinfo=timezone.utc)
    uids = []
    for i in range(4):
        u = models.User(email=f"demo{i}@spot.de", password_hash="x"); db.add(u); db.flush(); uids.append(u.id)
        # Vier Fahrer am grossen Spot im Fenster davor (-> einzeln gruen), zwei davon laufen um t.
        db.add(models.Session(session_uuid=f"demo-alt-{i}", user_id=u.id, spot_id=gross.id, status="analyzed",
                              started_at=t - timedelta(days=10), ended_at=t - timedelta(days=10, hours=-1)))
    for i in range(2):
        db.add(models.Session(session_uuid=f"demo-jetzt-{i}", user_id=uids[i], spot_id=gross.id, status="analyzed",
                              started_at=t - timedelta(minutes=30), ended_at=t + timedelta(minutes=30)))
    # Ein Fahrer allein am kleinen Spot: zaehlt mit, aber der Spot bleibt verborgen.
    db.add(models.Session(session_uuid="demo-klein", user_id=uids[2], spot_id=klein.id, status="analyzed",
                          started_at=t - timedelta(minutes=10), ended_at=t + timedelta(minutes=10)))
    # Schon vorbei -> zaehlt nicht.
    db.add(models.Session(session_uuid="demo-vorbei", user_id=uids[3], spot_id=gross.id, status="analyzed",
                          started_at=t - timedelta(hours=3), ended_at=t - timedelta(hours=2)))
    db.commit(); gid, kid = gross.id, klein.id; db.close()

    url = f"/api/admin/demo-aktiv?t={t.isoformat().replace('+', '%2B')}"
    assert client.get(url, headers=nutzer).status_code == 403
    d = client.get(url, headers=admin).json()
    assert gid in d["spots"] and kid not in d["spots"] and kid not in d["area"]
    assert d["pumping_now"] == 3 and d["friends"] == [] and d["freunde"] == []   # Admin ohne Freunde
    assert client.get("/api/admin/demo-aktiv?t=2999-01-01T00:00:00", headers=admin).status_code == 400
    # Standard ohne t: der festgelegte Demo-Zeitpunkt
    assert client.get("/api/admin/demo-aktiv", headers=admin).json()["t"].startswith("2026-10-04T13:05")
    # Mit zwei echten Freunden: beide stehen an einem gruenen Spot der Wiederholung, mit Spotnamen.
    db = SessionLocal()
    for uid in uids[:2]:
        lo, hi = sorted((aid, uid))
        db.add(models.Friendship(user_lo=lo, user_hi=hi, requester_id=aid, status="accepted"))
    db.commit(); db.close()
    fr = client.get(url, headers=admin).json()["freunde"]
    assert sorted(f["user_id"] for f in fr) == sorted(uids[:2])
    assert all(f["spot_id"] == gid and f["spot"] == "DemoGross" for f in fr)
