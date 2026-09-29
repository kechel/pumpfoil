"""Gepackte Uploads (`.gpx.gz` usw.), Nutzerwunsch 29.09.2026.

Anlass: die GPX mit Beschleunigung einer selbstgebauten Recorder-App sind 10–25 MB gross, die
groesste lag knapp unter der 25-MiB-Grenze. Gepackt sind es ~1/7. Der Import entpackt am
Gzip-Kopf, begrenzt den entpackten Umfang und behandelt den Rest wie die ungepackte Datei.
"""
import gzip

from app.api import sessions as sessions_api
from tests.test_gpx_accel import _gpx


def _auth(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_gpx_gz_ergibt_dieselbe_session_wie_gpx(client):
    from app import models, storage
    from app.db import SessionLocal
    roh = _gpx()
    auth = _auth(client, "gz-a@test.de")
    r = client.post("/api/sessions/upload-fit", headers=auth,
                    files={"file": ("lauf.gpx.gz", gzip.compress(roh), "application/gzip")})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        s = db.get(models.Session, r.json()["id"])
        assert s.accel_hz == 50
        assert len(storage.load_accel(s.session_uuid)) == 3200
        # Aufgehoben wird die ENTPACKTE Datei, unter dem Namen ohne .gz.
        d = storage.ensure_session_dir(s.session_uuid)
        orig = [p for p in d.iterdir() if p.name.startswith("original")]
        assert len(orig) == 1 and orig[0].suffix == ".gpx" and orig[0].read_bytes() == roh
    finally:
        db.close()


def test_gz_ohne_endung_wird_am_kopf_erkannt(client):
    auth = _auth(client, "gz-b@test.de")
    r = client.post("/api/sessions/upload-fit", headers=auth,
                    files={"file": ("export", gzip.compress(_gpx()), "application/octet-stream")})
    assert r.status_code == 200, r.text


def test_kaputtes_gzip_gibt_400(client):
    auth = _auth(client, "gz-c@test.de")
    r = client.post("/api/sessions/upload-fit", headers=auth,
                    files={"file": ("lauf.gpx.gz", b"\x1f\x8b\x08\x00kaputt", "application/gzip")})
    assert r.status_code == 400


def test_gzip_bombe_endet_mit_413(client, monkeypatch):
    monkeypatch.setattr(sessions_api, "MAX_ENTPACKT_BYTES", 1024 * 1024)
    auth = _auth(client, "gz-d@test.de")
    bombe = gzip.compress(b"<" + b" " * (3 * 1024 * 1024))
    assert len(bombe) < 20_000
    r = client.post("/api/sessions/upload-fit", headers=auth,
                    files={"file": ("lauf.gpx.gz", bombe, "application/gzip")})
    assert r.status_code == 413


def test_ungepackt_unveraendert():
    daten, name = sessions_api._gzip_entpacken(b"<?xml x", "lauf.gpx")
    assert daten == b"<?xml x" and name == "lauf.gpx"
    daten, name = sessions_api._gzip_entpacken(gzip.compress(b"abc"), "a.FIT.GZ")
    assert daten == b"abc" and name == "a.FIT"
