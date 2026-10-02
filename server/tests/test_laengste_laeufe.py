"""GET /api/sessions/longest-runs: die laengsten EIGENEN Laeufe ueber alle Sessions (Jan, 02.10.2026)."""
import json
import uuid
from datetime import datetime, timezone

from app import models
from app.db import SessionLocal


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return auth, client.get("/api/auth/me", headers=auth).json()["id"]


def _session(uid, dauern, pumpfoil=True, sport="pumpfoil", placement=None):
    db = SessionLocal()
    s = models.Session(session_uuid=str(uuid.uuid4()), started_at=datetime(2026, 9, 1, tzinfo=timezone.utc),
                       user_id=uid, is_pumpfoil=pumpfoil, sport_class=sport, status="analyzed",
                       placement=placement)
    db.add(s); db.flush()
    segs = [{"duration_s": d, "distance_m": d * 4, "i_start": 0, "i_end": 1} for d in dauern]
    db.add(models.AnalysisResult(session_id=s.id, algo_version="t", detection="model", num_runs=len(segs),
                                 segments_json=json.dumps(segs),
                                 metrics_json=json.dumps({"is_pumpfoil": pumpfoil, "detection": "model"})))
    db.commit(); sid = s.id; db.close()
    return sid


def test_laengste_eigene_laeufe_sortiert_und_gefiltert(client):
    ich, uid = _konto(client, "laeufe@lang.example.com")
    _, fremd = _konto(client, "fremd@lang.example.com")
    a = _session(uid, [30, 300, 45])
    b = _session(uid, [120, 600])
    _session(uid, [9999], pumpfoil=False)            # kein Pumpfoil -> zaehlt nicht
    _session(uid, [8888], sport="wingfoil")           # andere Sportart -> zaehlt nicht
    _session(fremd, [7777])                           # fremde Session -> nie
    r = client.get("/api/sessions/longest-runs?n=3", headers=ich)
    assert r.status_code == 200, r.text
    got = [(x["session_id"], x["run_idx"], x["duration_s"]) for x in r.json()]
    assert got == [(b, 1, 600), (a, 1, 300), (b, 0, 120)]


def test_nur_brett(client):
    ich, uid = _konto(client, "brett@lang.example.com")
    _session(uid, [900])                              # Uhr, laenger -> faellt raus
    c = _session(uid, [50, 70], placement="board")
    r = client.get("/api/sessions/longest-runs?n=5&nur_brett=true", headers=ich)
    assert [(x["session_id"], x["run_idx"]) for x in r.json()] == [(c, 1), (c, 0)]
