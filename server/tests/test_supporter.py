"""Supporter-Beitraege (23.10.2026): Stufen, Admin-Liste/Eintragen/Loeschen, Konto-Loeschung raeumt mit ab."""
from datetime import datetime, timedelta, timezone

from app import models, supporter
from app.db import SessionLocal


def _konto(client, mail):
    tok = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    return {"Authorization": "Bearer " + tok}


def test_stufen_und_admin(client):
    assert [supporter.stufe_fuer(n) for n in (0, 1, 4, 5, 14, 15)] == [0, 1, 1, 2, 2, 3]
    admin = _konto(client, "sup-admin@b.de")
    _konto(client, "sup-fahrer@b.de")
    db = SessionLocal()
    a = db.query(models.User).filter_by(email="sup-admin@b.de").one(); a.is_admin = True
    f = db.query(models.User).filter_by(email="sup-fahrer@b.de").one()
    alt = datetime.now(timezone.utc) - timedelta(days=40)
    for i in range(6):   # 6 Tage, aber alle vor 40 Tagen -> Stufe gespeichert, Badge nicht sichtbar
        db.add(models.FeedbackBeitrag(user_id=f.id, quelle="chat_jan", ref=f"t{i}", at=alt - timedelta(days=i)))
    db.commit()
    fid = f.id
    db.close()
    d = supporter.uebersicht(SessionLocal(), [fid])[fid]
    assert d["tage_jahr"] == 6 and not d["sichtbar"] and d["stufe"] == 0
    assert client.post("/api/admin/supporter", headers=admin, json={"user_id": fid, "quelle": "mail", "notiz": "Mail"}).status_code == 200
    d = supporter.uebersicht(SessionLocal(), [fid])[fid]
    assert d["sichtbar"] and d["stufe"] == 2                       # 7 Tage, juengster heute
    assert client.get(f"/api/supporter?ids={fid},999999", headers=admin).json() == {"stufen": {str(fid): 2}}
    liste = client.get("/api/admin/supporter", headers=admin).json()["nutzer"]
    assert next(r for r in liste if r["user_id"] == fid)["quellen"] == {"chat_jan": 6, "mail": 1}
    det = client.get(f"/api/admin/supporter/{fid}", headers=admin).json()
    assert client.delete(f"/api/admin/supporter/beitrag/{det[0]['id']}", headers=admin).status_code == 200
    fahrer = {"Authorization": "Bearer " + client.post("/api/auth/login", json={"email": "sup-fahrer@b.de", "password": "supersecret"}).json()["access_token"]}
    assert client.get("/api/admin/supporter", headers=fahrer).status_code == 403
    assert client.request("DELETE", "/api/auth/me", headers=fahrer).status_code in (200, 204)
    db = SessionLocal()
    assert db.query(models.FeedbackBeitrag).filter_by(user_id=fid).count() == 0
    db.close()


def test_bewertung_und_feedback_zaehlen_sofort(client):
    """Formular-Feedback und Session-Bewertung landen ohne Skript in feedback_beitraege (Jan, 23.10.2026)."""
    auth = {"Authorization": "Bearer " + client.post("/api/auth/register", json={"email": "sup-auto@b.de", "password": "supersecret"}).json()["access_token"]}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    client.post("/api/ingest/session", headers=uhr, json={"session_uuid": "sup-auto-1", "started_at": "2026-10-21T19:00:00Z",
                "sport": "pumpfoil", "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000})
    client.post("/api/ingest/session/sup-auto-1/chunk", headers=uhr, json={"index": 0, "kind": "gps", "encoding": "json",
                "data": [[i * 1000, 47.0 + i * 1e-5, 9.0, 4.0, 120, 5.0] for i in range(30)]})
    sid = client.post("/api/ingest/session/sup-auto-1/complete", headers=uhr, json={"total_chunks": 1}).json()["session_id"]
    assert client.post("/api/feedback", headers=auth, json={"text": "Toll!", "url": "/x"}).status_code == 200
    for _ in range(2):   # zweimal am selben Tag bewertet -> ein Beitrag
        assert client.put(f"/api/sessions/{sid}/bewertung", headers=auth, json={"antworten": {"sterne": 4}}).status_code == 200
    db = SessionLocal()
    uid = db.query(models.User).filter_by(email="sup-auto@b.de").one().id
    assert sorted(q for (q,) in db.query(models.FeedbackBeitrag.quelle).filter_by(user_id=uid)) == ["bewertung", "feedback"]
    db.close()
