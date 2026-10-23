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
