"""Absturz-Logbuch der Uhren (models.DeviceCrash, 21.11.2026): eine Zeile je GEZAEHLTEM Ereignis, Zaehler je Modell
im Admin (GET /api/admin/abstuerze)."""
from __future__ import annotations

import secrets

from app import models
from app.db import SessionLocal


def _konto(client, admin=False):
    r = client.post("/api/auth/register", json={"email": f"crash-{secrets.token_hex(4)}@b.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    if admin:
        db = SessionLocal()
        try:
            db.get(models.User, uid).is_admin = True
            db.commit()
        finally:
            db.close()
    return uid, kopf


def test_logbuch_und_zaehler_je_modell(client):
    uid, kopf = _konto(client)
    tok = client.post("/api/devices/mint", params={"label": "Instinct Test"}, headers=kopf).json()["device_token"]
    h = {"X-Device-Token": tok}
    # ein App-Start schickt zwei Abrufe mit demselben Flag -> EIN Ereignis
    assert client.get("/api/devices/config", params={"p": "garmin", "v": "1.0.99", "crash": 2}, headers=h).status_code == 200
    assert client.get("/api/devices/config", params={"p": "garmin", "v": "1.0.99", "crash": 2}, headers=h).status_code == 200
    client.get("/api/devices/config", params={"p": "garmin", "v": "1.0.99", "sf": 1, "kb": 250}, headers=h)
    client.get("/api/devices/config", params={"p": "garmin", "v": "1.0.99", "canary": 1}, headers=h)
    db = SessionLocal()
    try:
        zeilen = db.query(models.DeviceCrash).filter_by(user_id=uid).order_by(models.DeviceCrash.id).all()
        assert [(z.art, z.phase, z.kb) for z in zeilen] == [("lauf", 2, None), ("speicher", None, 250), ("layout", None, None)]
        assert all(z.app_version == "1.0.99" for z in zeilen)
        dev = db.query(models.DeviceToken).filter_by(user_id=uid).one()
        assert dev.crash_count == 1 and dev.crash_phase == 2
    finally:
        db.close()
    _aid, akopf = _konto(client, admin=True)
    assert client.get("/api/admin/abstuerze", headers=kopf).status_code == 403
    d = client.get("/api/admin/abstuerze", headers=akopf).json()
    m = next(x for x in d["modelle"] if x["log_lauf"] and x["geraete_mit_absturz"])
    assert m["log_phasen"].get("2", 0) >= 1 and m["log_speicher"] >= 1 and m["log_layout"] >= 1
    assert any(z["user_id"] == uid and z["art"] == "lauf" for z in d["letzte"])
    # Tageszaehlung ohne Personenbezug ueberlebt die Kontoloeschung, das Logbuch je Uhr nicht
    db = SessionLocal()
    try:
        vorher = sum(z.anzahl for z in db.query(models.ModellAbsturzTag).filter_by(modell="Instinct Test"))
        assert vorher >= 3
    finally:
        db.close()
    from app.loeschung import konto_loeschen
    db = SessionLocal()
    try:
        konto_loeschen(db, db.get(models.User, uid))
    finally:
        db.close()
    db = SessionLocal()
    try:
        assert db.query(models.DeviceCrash).filter_by(user_id=uid).count() == 0
        assert sum(z.anzahl for z in db.query(models.ModellAbsturzTag).filter_by(modell="Instinct Test")) == vorher
    finally:
        db.close()
