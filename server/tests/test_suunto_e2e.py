"""SuuntoPlus-App ueber die Handy-Bruecke, Teil Server (17.10.2026, docs/SUUNTO.md).

Die Dateien hat die Android-Bruecke (SuuntoAblage) im Kotlin-Test aus den Paketen der ECHTEN Uhr-App
geschrieben (watch-suunto/test/golden.mjs -> SuuntoAblageTest). Hier gehen sie so hoch wie in
SuuntoBruecke.session: Token per /devices/mint, /config?p=suunto (setzt die Plattform), Meta mit
expected_chunks, GPS zuerst in Paketen zu 30, dann /complete. Danach darf der Cloud-Import fuer
dieselbe Aufnahme keine zweite Session anlegen.
"""
from __future__ import annotations

import json
from datetime import timedelta, timezone
from pathlib import Path

FIX = Path(__file__).resolve().parents[2] / "watch-suunto" / "test" / "fixtures" / "suunto-e2e-dateien.json"


def _dateien():
    d = json.loads(FIX.read_text())
    meta = json.loads(d["meta.json"])
    ende = json.loads(d["complete.json"])
    chunks = [json.loads(v) for k, v in sorted(d.items()) if k.startswith("chunk-")]
    return meta, chunks, ende


def test_suunto_bruecke_aufnahme_kommt_an_und_cloud_import_doppelt_nicht(client):
    from app import models
    from app.api.suunto import bruecken_session
    from app.db import SessionLocal

    meta, chunks, ende = _dateien()
    jwt = client.post("/api/auth/register", json={"email": "suunto-e2e@b.de", "password": "supersecret"}).json()["access_token"]
    tok = client.post("/api/devices/mint", params={"label": meta["device_model"][:60]},
                      headers={"Authorization": f"Bearer {jwt}"}).json()["device_token"]
    dev = {"X-Device-Token": tok}
    assert client.get("/api/devices/config", params={"p": "suunto", "v": "100"}, headers=dev).status_code == 200

    m = dict(meta, expected_chunks=len(chunks))
    r = client.post("/api/ingest/session", headers=dev, json=m)
    assert r.status_code == 200, r.text
    offen = sorted(chunks, key=lambda c: 0 if c["kind"] == "gps" else 1)
    for i in range(0, len(offen), 30):
        paket = offen[i:i + 30]
        r = client.post(f"/api/ingest/session/{meta['session_uuid']}/chunks", headers=dev, json={"chunks": paket})
        assert r.status_code == 200, r.text
        assert sorted(r.json()["received"]) == sorted(c["index"] for c in paket)
    r = client.post(f"/api/ingest/session/{meta['session_uuid']}/complete", headers=dev, json=ende)
    assert r.status_code == 200, r.text

    db = SessionLocal()
    try:
        s = db.query(models.Session).filter_by(session_uuid=meta["session_uuid"]).one()
        assert s.total_chunks == len(chunks)
        assert s.accel_hz == 25 and s.accel_scale == 2048
        assert db.query(models.DeviceToken).get(s.device_id).platform == "suunto"
        ein = db.query(models.IngestChunk).filter_by(session_id=s.id).all()
        assert sorted(c.index for c in ein) == list(range(len(chunks)))
        # Cloud-Workout derselben Aufnahme (Suuntos Start ein paar Sekunden spaeter) -> erkannt
        assert bruecken_session(db, s.user_id, s.started_at + timedelta(seconds=7)) is not None
        # FIT liefert naive UTC-Zeiten
        naiv = (s.started_at + timedelta(seconds=7)).astimezone(timezone.utc).replace(tzinfo=None)
        assert bruecken_session(db, s.user_id, naiv) is not None
        # eine andere Aufnahme eine Stunde spaeter -> nicht
        assert bruecken_session(db, s.user_id, s.started_at + timedelta(hours=1)) is None
    finally:
        db.close()


def test_config_sagt_der_suunto_welche_seiten_standard_sind(client):
    from app import standard_layouts as SL
    jwt = client.post("/api/auth/register", json={"email": "suunto-std@b.de", "password": "supersecret"}).json()["access_token"]
    tok = client.post("/api/devices/mint", params={"label": "Suunto Race"},
                      headers={"Authorization": f"Bearer {jwt}"}).json()["device_token"]
    c = client.get("/api/devices/config", params={"p": "suunto"}, headers={"X-Device-Token": tok}).json()
    assert c["standardSeiten"] == ["pages", "offFoilPages", "pausePages"]
    assert c["standardHash"] == SL.pruefsumme()
    # andere Plattformen bekommen die Schluessel nicht
    tok2 = client.post("/api/devices/mint", params={"label": "Garmin"},
                       headers={"Authorization": f"Bearer {jwt}"}).json()["device_token"]
    c2 = client.get("/api/devices/config", params={"p": "garmin"}, headers={"X-Device-Token": tok2}).json()
    assert "standardSeiten" not in c2
