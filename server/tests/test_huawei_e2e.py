"""ENDE-ZU-ENDE, Teil Server (Jan, 08.10.2026: „wir testen vorher was wir koennen").

Die Dateien, die der ECHTE Huawei-Recorder im Node-Test schrieb (watch-huawei/test/e2e-uebertragung.test.mjs:
Fahrt 150 s, 40 s Pause, 120 s), gehen hier so hoch, wie es die Android-Bruecke tut (HuaweiBruecke.session,
im Kotlin-Test HuaweiBrueckeE2ETest gegen dieselben Dateien geprueft): Token per /devices/mint mit dem
Modell als Label, Meta mit expected_chunks, GPS zuerst in Paketen zu 30, dann /complete. Geprueft wird
am Ergebnis in der DB, nicht am Bildschirm: jeder Chunk genau einmal, Mengen, Pause, Endzeit.
"""
from __future__ import annotations

import json
from datetime import timedelta
from pathlib import Path

FIX = Path(__file__).resolve().parents[2] / "watch-huawei" / "test" / "fixtures" / "huawei-e2e-dateien.json"


def _dateien():
    d = json.loads(FIX.read_text())
    meta = json.loads(next(v for k, v in d.items() if k.startswith("m_")))
    ende = json.loads(next(v for k, v in d.items() if k.startswith("e_")))
    chunks = [json.loads(v) for k, v in sorted(d.items()) if k.startswith("c_")]
    return meta, chunks, ende


def _hochladen(client, dev, meta, chunks, ende):
    meta = dict(meta, expected_chunks=len(chunks))
    r = client.post("/api/ingest/session", headers=dev, json=meta)
    assert r.status_code == 200, r.text
    da = set(r.json().get("received_chunks") or [])
    offen = sorted((c for c in chunks if c["index"] not in da), key=lambda c: 0 if c["kind"] == "gps" else 1)
    for i in range(0, len(offen), 30):
        paket = offen[i:i + 30]
        r = client.post(f"/api/ingest/session/{meta['session_uuid']}/chunks", headers=dev, json={"chunks": paket})
        assert r.status_code == 200, r.text
        assert sorted(r.json()["received"]) == sorted(c["index"] for c in paket), r.json()
    r = client.post(f"/api/ingest/session/{meta['session_uuid']}/complete", headers=dev, json=ende)
    assert r.status_code == 200, r.text
    return r.json()


def test_huawei_aufnahme_kommt_vollstaendig_an(client):
    from app import models
    from app.db import SessionLocal

    meta, chunks, ende = _dateien()
    jwt = client.post("/api/auth/register", json={"email": "huawei-e2e@b.de", "password": "supersecret"}).json()["access_token"]
    tok = client.post("/api/devices/mint", params={"label": meta["device_model"][:60]},
                      headers={"Authorization": f"Bearer {jwt}"}).json()["device_token"]
    dev = {"X-Device-Token": tok}
    _hochladen(client, dev, meta, chunks, ende)

    db = SessionLocal()
    try:
        s = db.query(models.Session).filter_by(session_uuid=meta["session_uuid"]).one()
        ein = db.query(models.IngestChunk).filter_by(session_id=s.id).all()
        # jeder Chunk genau einmal, Indizes lueckenlos
        assert sorted(c.index for c in ein) == list(range(len(chunks)))
        assert s.total_chunks == len(chunks)
        # Mengen wie auf der Uhr gesammelt
        for art in ("gps", "accel"):
            soll = sum(c["count"] for c in chunks if c["kind"] == art)
            assert sum(c.sample_count for c in ein if c.kind == art) == soll, art
        # Pause, Endzeit (Wanduhr = aktiv + Pause), Geraet
        pausen = json.loads(s.pause_windows)
        assert len(pausen) == 1 and abs(pausen[0][1] - 40000) <= 1000, pausen
        dauer = (s.ended_at - s.started_at).total_seconds()
        assert abs(dauer - 310) <= 5, dauer
        assert s.device_model == meta["device_model"]
        assert s.accel_hz == 50
        # Die Auswertung kommt mit den Daten klar: Zeitachse aus den Blockzeiten (t0_ms), Rate gemessen ~50 Hz.
        db.refresh(s)
        assert s.result is not None and s.result.metrics_json, "keine Auswertung"
        m = json.loads(s.result.metrics_json)
        print("HUAWEI-E2E metrics:", {k: m.get(k) for k in ("accel_axis", "accel_hz_effective")})
        assert m.get("accel_axis") == "exact_chunks", m.get("accel_axis")
        assert abs((m.get("accel_hz_effective") or 0) - 50) < 2, m.get("accel_hz_effective")
    finally:
        db.close()


def test_abgebrochener_upload_setzt_fort_ohne_doppelte(client):
    """Bricht der Upload mittendrin ab (Handy aus dem Netz), laedt der zweite Versuch nur den Rest."""
    from app import models
    from app.db import SessionLocal

    meta, chunks, ende = _dateien()
    meta = dict(meta, session_uuid=meta["session_uuid"] + "-b")
    jwt = client.post("/api/auth/register", json={"email": "huawei-e2e2@b.de", "password": "supersecret"}).json()["access_token"]
    dev = {"X-Device-Token": client.post("/api/devices/mint", params={"label": "HUAWEI Watch GT 4"},
                                         headers={"Authorization": f"Bearer {jwt}"}).json()["device_token"]}
    # erster Versuch: Meta + nur das erste Paket, dann Abbruch
    client.post("/api/ingest/session", headers=dev, json=dict(meta, expected_chunks=len(chunks)))
    erste = sorted(chunks, key=lambda c: 0 if c["kind"] == "gps" else 1)[:30]
    client.post(f"/api/ingest/session/{meta['session_uuid']}/chunks", headers=dev, json={"chunks": erste})
    # zweiter Versuch wie die Bruecke: fragt, was da ist, schickt den Rest
    _hochladen(client, dev, meta, chunks, ende)
    db = SessionLocal()
    try:
        s = db.query(models.Session).filter_by(session_uuid=meta["session_uuid"]).one()
        idx = [c.index for c in db.query(models.IngestChunk).filter_by(session_id=s.id).all()]
        assert sorted(idx) == list(range(len(chunks)))
    finally:
        db.close()


def test_direkt_gekoppelt_ohne_handy(client):
    """Watch 5 ohne Handy-App (Direkt.ets): Code holen, im Konto einloesen, Token per Poll,
    Konfiguration holen, dann dieselbe Session direkt hochladen wie die Bruecke es taete."""
    from app import models
    from app.db import SessionLocal

    meta, chunks, ende = _dateien()
    meta = dict(meta, session_uuid=meta["session_uuid"] + "-direkt")
    r = client.post("/api/devices/pair-init", json={"label": meta["device_model"], "platform": "huawei"})
    assert r.status_code == 200, r.text
    code, claim = r.json()["code"], r.json()["claim_token"]
    assert client.get("/api/devices/pair-poll", params={"claim_token": claim}).json()["device_token"] is None
    jwt = client.post("/api/auth/register", json={"email": "huawei-direkt@b.de", "password": "supersecret"}).json()["access_token"]
    r = client.post("/api/devices/pair-claim", json={"code": code}, headers={"Authorization": f"Bearer {jwt}"})
    assert r.status_code == 200 and r.json()["platform"] == "huawei", r.text
    tok = client.get("/api/devices/pair-poll", params={"claim_token": claim}).json()["device_token"]
    assert tok
    dev = {"X-Device-Token": tok}
    cfg = client.get("/api/devices/config", params={"p": "huawei", "v": "1.0.2"}, headers=dev)
    assert cfg.status_code == 200 and "views" in cfg.json(), cfg.text
    _hochladen(client, dev, meta, chunks, ende)
    db = SessionLocal()
    try:
        s = db.query(models.Session).filter_by(session_uuid=meta["session_uuid"]).one()
        assert sorted(c.index for c in db.query(models.IngestChunk).filter_by(session_id=s.id)) == list(range(len(chunks)))
        d = db.query(models.DeviceToken).filter_by(token=tok).one()
        assert d.platform == "huawei" and d.label == meta["device_model"]
    finally:
        db.close()
