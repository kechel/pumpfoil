"""Community-Bestenliste: On-Foil-Strecke und -Zeit (Jan, 01.11.2026).

Anlass: ein Fahrer mit reinen GPS-Aufnahmen (FIT-Upload, keine Pumps) tauchte in keiner Bestenliste auf.
Strecke und Zeit auf dem Foil gibt es auch ohne Bewegungsdaten.
"""
from __future__ import annotations

import secrets
import time
from datetime import datetime, timedelta, timezone

import pytest

from app import models
from app.db import SessionLocal

# Die Test-DB ueberdauert Laeufe, und die absurd hohen Werte hier schlagen sonst die Rekorde, die andere Tests
# erwarten (test_ortverbergen_ausgaenge lief danach rot). Deshalb raeumt jeder Test seine Sessions wieder weg.
_ANGELEGT: list[int] = []


@pytest.fixture(autouse=True)
def _aufraeumen():
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


def _konto(client):
    mail = f"leaders-{secrets.token_hex(4)}@test.de"   # die Test-DB ueberdauert Laeufe
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _gps_session(uid, dist, zeit):
    db = SessionLocal()
    try:
        t0 = datetime.now(timezone.utc) - timedelta(hours=2)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t0,
                           ended_at=t0 + timedelta(minutes=30), sport="pumpfoil", is_pumpfoil=True,
                           status="done", gps_hz=1)
        db.add(s); db.flush()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="gps_only", num_runs=1,
                                     foiling_distance_m=dist, foiling_time_s=zeit))
        db.commit()
        _ANGELEGT.append(s.id)
    finally:
        db.close()


def test_gps_fahrer_steht_bei_strecke_und_zeit(client):
    kopf, uid = _konto(client)
    # Unverwechselbar hohe Werte, je Lauf hoeher: die Test-DB ueberdauert Laeufe, und alte Konten aus frueheren
    # Laeufen duerfen den neuen nicht aus den Top 10 draengen.
    basis = 1.0e13 + time.time() * 1000
    _gps_session(uid, basis - 1.0e12, basis / 100 - 1.0e10)
    _gps_session(uid, 1.0e12, 1.0e10)
    d = client.get("/api/community/leaders?period=all&accel_only=false&sport=pumpfoil", headers=kopf).json()
    strecke = next(x for x in d["distance"] if x["user_id"] == uid)
    zeit = next(x for x in d["time"] if x["user_id"] == uid)
    assert abs(strecke["distance_m"] - basis) < 1 and abs(zeit["time_s"] - basis / 100) < 1
    assert all(x["user_id"] != uid for x in d["pumps"])        # ohne Bewegungsdaten keine Pumps
    assert len(d["distance"]) <= 10 and len(d["time"]) <= 10


def test_nur_bewegungsdaten_blendet_gps_aus(client):
    kopf, uid = _konto(client)
    _gps_session(uid, 8.0e12, 8.0e10)
    d = client.get("/api/community/leaders?period=all&accel_only=true&sport=pumpfoil", headers=kopf).json()
    assert all(x["user_id"] != uid for x in d["distance"])


def test_bester_einzellauf_getrennt_von_summe(client):
    kopf, uid = _konto(client)
    db = SessionLocal()
    try:
        t0 = datetime.now(timezone.utc) - timedelta(hours=1)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t0,
                           ended_at=t0 + timedelta(minutes=30), sport="pumpfoil", is_pumpfoil=True,
                           status="done", gps_hz=1)
        db.add(s); db.flush()
        basis = 2.0e13 + time.time() * 1000
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="gps_only", num_runs=3,
                                     foiling_distance_m=basis * 3, foiling_time_s=basis / 10 * 3,
                                     best_distance_m=basis, best_duration_s=basis / 10))
        db.commit()
        _ANGELEGT.append(s.id)
    finally:
        db.close()
    d = client.get("/api/community/leaders?period=all&accel_only=false&sport=pumpfoil", headers=kopf).json()
    lauf = next(x for x in d["run_distance"] if x["user_id"] == uid)
    assert abs(lauf["run_distance_m"] - basis) < 1 and abs(lauf["distance_m"] - basis * 3) < 3
    assert lauf["session_id"] == _ANGELEGT[-1]                 # Zeile fuehrt zur Session des besten Laufs
    assert "session_id" not in next(x for x in d["distance"] if x["user_id"] == uid)   # Summe: keine einzelne
    assert any(x["user_id"] == uid for x in d["run_time"])
