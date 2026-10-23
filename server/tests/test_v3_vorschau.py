"""`?v3=<kandidat>` (Admin-Vorschau, 23.10.2026): nur lesend, Namen streng geprueft, Nicht-Admins unberuehrt."""
from app.api import v3_vorschau


def test_kandidatennamen():
    assert v3_vorschau.kandidat("live") is not None
    assert v3_vorschau.kandidat("../etc") is None and v3_vorschau.kandidat("R5") is None
    assert v3_vorschau.kandidat("gibtsnicht123") is None


def test_vorschau_schreibt_nichts(client):
    from app.db import SessionLocal
    from app import models
    tok = client.post("/api/auth/register", json={"email": "v3v@b.de", "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": "Bearer " + tok}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    client.post("/api/ingest/session", headers=uhr, json={"session_uuid": "v3v-1", "started_at": "2026-10-21T19:00:00Z",
                "sport": "pumpfoil", "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000})
    client.post("/api/ingest/session/v3v-1/chunk", headers=uhr, json={"index": 0, "kind": "gps", "encoding": "json",
                "data": [[i * 1000, 47.0 + i * 5e-5, 9.0, 4.0, 120, 6.0] for i in range(90)]})
    sid = client.post("/api/ingest/session/v3v-1/complete", headers=uhr, json={"total_chunks": 1}).json()["session_id"]
    vorher = client.get(f"/api/sessions/{sid}", headers=auth).json()
    assert client.get(f"/api/sessions/{sid}?v3=live", headers=auth).status_code == 200   # kein Admin: normal
    db = SessionLocal()
    u = db.query(models.User).filter_by(email="v3v@b.de").one(); u.is_admin = True; db.commit()
    s = db.get(models.Session, sid); stempel = s.updated_at
    db.close()
    r = client.get(f"/api/sessions/{sid}?v3=live", headers=auth)
    assert r.status_code == 200 and r.json()["analysis"]["num_runs"] == vorher["analysis"]["num_runs"]
    db = SessionLocal()
    assert db.get(models.Session, sid).updated_at == stempel          # nichts gespeichert
    db.close()
