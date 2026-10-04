"""Export aller Daten (04.10.2026, Nutzerwunsch „export all data including accelerometer"):
FIT mit accelerometer_data, ZIP mit CSV je Sensor, Originaldaten unveraendert."""
from __future__ import annotations

import base64
import io
import secrets
import zipfile
from datetime import datetime, timedelta, timezone

import numpy as np


def _anlegen(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    from app import models, storage
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, sport="pumpfoil",
                           started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           accel_hz=25, accel_scale=2048, gps_hz=1, status="analyzed")
        db.add(s); db.commit()
        sid, uuid = s.id, s.session_uuid
    finally:
        db.close()
    spur = [[i * 1000, 47.0 + i * 1e-5, 9.0, 3.0, 120, 4.0] for i in range(60)]
    storage.save_gps_chunk(uuid, 0, spur)
    acc = (np.tile([[0, 0, 2048]], (25 * 60, 1)) + np.arange(25 * 60)[:, None] % 7).astype("<i2")
    storage.save_accel_chunk(uuid, 1, base64.b64encode(acc.tobytes()).decode(), t0_ms=0)
    return kopf, sid, acc


def test_fit_enthaelt_beschleunigung(client):
    import fitparse
    kopf, sid, acc = _anlegen(client, "exp1@b.de")
    r = client.get(f"/api/sessions/{sid}/export.fit", headers=kopf)
    assert r.status_code == 200, r.text
    f = fitparse.FitFile(io.BytesIO(r.content)); f.parse()
    msgs = [m.get_values() for m in f.get_messages("accelerometer_data")]
    x = np.concatenate([np.atleast_1d(np.array(m["calibrated_accel_x"], float)) for m in msgs])
    z = np.concatenate([np.atleast_1d(np.array(m["calibrated_accel_z"], float)) for m in msgs])
    # Fenster wie der Track: bis zum letzten GPS-Punkt (59 s), die letzte Sekunde faellt weg
    assert 59 * 25 <= x.size <= acc.shape[0]
    assert np.allclose(z, acc[:z.size, 2] / 2048 * 1000, atol=1e-3)     # milli-g, wie Garmin


def test_zip_mit_csv_und_original_unveraendert(client):
    kopf, sid, acc = _anlegen(client, "exp2@b.de")
    r = client.get(f"/api/sessions/{sid}/export.zip", headers=kopf)
    assert r.status_code == 200, r.text
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert {"gps.csv", "accel.csv", "meta.json", "README.txt"} <= set(z.namelist())
    zeilen = z.read("accel.csv").decode().splitlines()
    assert zeilen[0] == "t_ms,ax_g,ay_g,az_g" and len(zeilen) == acc.shape[0] + 1

    o = client.get(f"/api/sessions/{sid}/export-original", headers=kopf)
    assert o.status_code == 200, o.text
    oz = zipfile.ZipFile(io.BytesIO(o.content))
    assert oz.read("accel/1.bin") == acc.tobytes()          # Byte fuer Byte wie empfangen
    assert "gps/0.json" in oz.namelist()


def test_nur_der_besitzer_auch_kein_admin(client):
    """Alle Exporte NUR fuer die eigene Session — auch ein Admin bekommt fremde nicht (Jan)."""
    _, sid, _ = _anlegen(client, "exp3@b.de")
    r = client.post("/api/auth/register", json={"email": "exp4@b.de", "password": "supersecret"})
    fremd = {"Authorization": f"Bearer {r.json()['access_token']}"}
    pfade = ("export.gpx", "export.fit", "export.zip", "export-original")
    for pfad in pfade:
        assert client.get(f"/api/sessions/{sid}/{pfad}", headers=fremd).status_code == 404
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        db.query(models.User).filter_by(email="exp4@b.de").update({"is_admin": True}); db.commit()
    finally:
        db.close()
    for pfad in pfade:
        assert client.get(f"/api/sessions/{sid}/{pfad}", headers=fremd).status_code == 404
    for pfad in pfade:                                   # ohne Anmeldung erst recht nicht
        assert client.get(f"/api/sessions/{sid}/{pfad}").status_code in (401, 403)
