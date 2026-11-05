"""Regions-Filter der Bestenlisten nach Nationalitaet (Jan, 05.11.2026, app/regionen.py)."""
from __future__ import annotations

import secrets
import time
from datetime import datetime, timedelta, timezone

import pytest

from app import models, regionen
from app.db import SessionLocal

_ANGELEGT: list[int] = []


@pytest.fixture(autouse=True)
def _aufraeumen():
    regionen._stand = None          # der Minuten-Merker darf nicht zwischen den Tests haengen bleiben
    yield
    db = SessionLocal()
    try:
        for sid in _ANGELEGT:
            db.query(models.AnalysisResult).filter_by(session_id=sid).delete()
            db.query(models.Session).filter_by(id=sid).delete()
        db.commit()
    finally:
        db.close()
        _ANGELEGT.clear()
        regionen._stand = None


def _konto(client, land: str = ""):
    r = client.post("/api/auth/register", json={"email": f"region-{secrets.token_hex(4)}@test.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if land:
        assert client.put("/api/settings", headers=kopf, json={"land": land}).status_code == 200
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _session(uid, dist):
    db = SessionLocal()
    try:
        t0 = datetime.now(timezone.utc) - timedelta(hours=2)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t0,
                           ended_at=t0 + timedelta(minutes=30), sport="pumpfoil", is_pumpfoil=True, status="done", gps_hz=1)
        db.add(s); db.flush()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="gps_only", num_runs=1,
                                     foiling_distance_m=dist, foiling_time_s=dist / 100, best_distance_m=dist))
        db.commit()
        _ANGELEGT.append(s.id)
    finally:
        db.close()


def test_pruefen_und_passt():
    assert regionen.pruefen("pl") == "PL" and regionen.pruefen("k:eu") == "k:eu"
    assert regionen.pruefen("quatsch") == "all" and regionen.pruefen(None) == "all" and regionen.pruefen("k:mars") == "all"
    assert regionen.passt("PL", "k:eu") and regionen.passt("PL", "PL") and not regionen.passt("PL", "DE")
    assert regionen.passt("k:eu", "k:eu") and not regionen.passt("k:eu", "PL")      # Team-Herkunft Kontinent
    assert not regionen.passt("k:earth", "k:eu") and regionen.passt("k:earth", "all")
    assert not regionen.passt(None, "k:eu") and regionen.passt(None, "all")
    assert regionen.KONTINENT["FR"] == "k:eu" and regionen.KONTINENT["CY"] == "k:eu" and regionen.KONTINENT["BR"] == "k:sa"


def test_bestenliste_nach_nationalitaet(client):
    basis = 1.0e13 + time.time() * 1000      # die Test-DB ueberdauert Laeufe: unverwechselbar hohe Werte
    kpl, pl = _konto(client, "PL")
    _, br = _konto(client, "BR")
    _, ohne = _konto(client)
    _session(pl, basis + 3)
    _session(br, basis + 2)
    _session(ohne, basis + 1)

    def ids(region):
        d = client.get(f"/api/community/leaders?period=all&accel_only=false&region={region}", headers=kpl).json()
        return {x["user_id"] for x in d["distance"]}

    assert {pl, br, ohne} <= ids("all")
    assert pl in ids("PL") and br not in ids("PL") and ohne not in ids("PL")
    assert pl in ids("k%3Aeu") and br not in ids("k%3Aeu")
    assert br in ids("k%3Asa") and pl not in ids("k%3Asa")
    # Rekorde: derselbe Filter, eigener Cache-Schluessel je Region.
    r_all = client.get("/api/community/records?accel_only=false&period=all", headers=kpl).json()["all"]["distance"]
    r_sa = client.get("/api/community/records?accel_only=false&period=all&region=BR", headers=kpl).json()["all"]["distance"]
    assert r_all["value"] > basis + 2.5 and abs(r_sa["value"] - (basis + 2)) < 0.5


def test_regionen_auswahl(client):
    kopf, _ = _konto(client, "PT")
    leute = [_konto(client, "PT")[1] for _ in range(3)]
    for i, uid in enumerate(leute):
        _session(uid, 1000 + i)
    d = client.get("/api/community/regionen?period=10d", headers=kopf).json()
    keys = {x["key"]: x for x in d["regionen"]}
    assert d["ich"] == "PT"
    assert "PT" in keys and keys["PT"]["fahrer"] >= 3 and "k:eu" in keys
