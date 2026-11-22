"""R2-G5/R2-G4 (Security-Review 22.11.2026).

G5: die Namenssuche zeigt je fremdem Fahrer hoechstens 5 Sessions und blaettert nicht (S-043) — ueber
`sessions-grouped?name=&offset=` und die Nachbarn (`neighbors?name=`) kam man trotzdem an alle.
G4: die Nachbarn sortierten nach der echten Startzeit und verrieten so die Reihenfolge bei „Uhrzeit verbergen"."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

from app import models, zeitverbergen
from app.db import SessionLocal


def _konto(client, tag, name=None):
    r = client.post("/api/auth/register", json={"email": f"g5-{tag}-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if name:
        client.put("/api/auth/me", headers=kopf, json={"display_name": name})
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _sessions(uid, n, t0, abstand=timedelta(hours=-5)):
    db = SessionLocal()
    ids = []
    try:
        for i in range(n):
            t = t0 + i * abstand
            s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(minutes=30),
                               sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True, status="analyzed",
                               data_quality="ok")
            db.add(s); db.flush()
            db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=1,
                                         foiling_distance_m=100.0, best_distance_m=100.0, pump_count=10))
            ids.append(s.id)
        db.commit()
        return ids
    finally:
        db.close()


def test_namenssuche_nachbarn_und_gruppen_gekappt(client):
    name = "Gfuenf" + secrets.token_hex(3)
    fremd, _kf = _konto(client, "f", name)
    _ich, ki = _konto(client, "i")
    ids = _sessions(fremd, 8, datetime.now(timezone.utc) - timedelta(hours=1))
    # Gruppen: nur 5 Sessions des fremden Fahrers, kein Weiterblaettern
    g = client.get("/api/community/sessions-grouped", params={"name": name, "accel_only": False, "sport": "all"},
                   headers=ki).json()
    assert sum(x["count"] for x in g) == 5, g
    assert client.get("/api/community/sessions-grouped", params={"name": name, "offset": 1, "accel_only": False,
                                                                  "sport": "all"}, headers=ki).json() == []
    # Nachbarn: ab der neuesten nach „aelter" laufen -> hoechstens 5 erreichbar
    gesehen, cur = [ids[0]], ids[0]
    while True:
        r = client.get(f"/api/sessions/{cur}/neighbors", params={"scope": "all", "name": name, "sport": "all"},
                       headers=ki).json()
        if not r["older"]:
            break
        cur = r["older"]
        gesehen.append(cur)
        assert len(gesehen) <= 8
    assert len(gesehen) == 5, gesehen


def test_nachbarn_verraten_keine_reihenfolge_bei_verborgener_uhrzeit(client):
    """Spot mit drei Sessions am selben Tag: A (sichtbar, 08:00), V (verbirgt, 10:00), B (sichtbar, 14:00).
    Ohne Fix lag V zwischen A und B. Mit Fix zaehlt V als 12:00 -> Reihenfolge A, V, B wie im Feed, also ebenfalls
    zwischen — deshalb V um 15:00: echte Reihenfolge waere A, B, V, der Feed zeigt A, V(12:00), B."""
    spot = "Gvier-" + secrets.token_hex(3)
    (a, _ka), (v, kv), (_i, ki) = _konto(client, "a"), _konto(client, "v"), _konto(client, "i2")
    client.put("/api/settings", headers=kv, json={"hide_time": True})
    zeitverbergen.cache_leeren()
    tag = (datetime.now(timezone.utc) - timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0)
    db = SessionLocal()
    try:
        out = {}
        for uid, h, k in ((a, 8, "A"), (a, 14, "B"), (v, 15, "V")):
            t = tag + timedelta(hours=h)
            s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(minutes=30),
                               sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True, status="analyzed",
                               data_quality="ok", place_name=spot)
            db.add(s); db.flush()
            db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=1,
                                         foiling_distance_m=100.0, best_distance_m=100.0, pump_count=10))
            out[k] = s.id
        db.commit()
    finally:
        db.close()
    r = client.get(f"/api/sessions/{out['V']}/neighbors", params={"spot": spot, "sport": "all"}, headers=ki).json()
    assert (r["older"], r["newer"]) == (out["A"], out["B"]), (r, out)
