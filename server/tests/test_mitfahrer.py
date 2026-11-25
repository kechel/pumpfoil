"""Media-Overlay mit mehreren Fahrern: `GET /api/sessions/{id}/mitfahrer` (docs/MEDIA.md Schritt 6, 25.11.2026).

Schwerpunkt Datenschutz: „Uhrzeit verbergen" darf weder ueber `gleichzeitig` noch ueber `ueberlappt` die Uhrzeit
verraten — auch nicht Freunden; „Ort verbergen" faellt aus dem Spot-Filter.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app import models, zeitverbergen
from app.db import SessionLocal

LAT, LON = 47.61, 9.42
_ANGELEGT: list[int] = []


def _konto(client):
    r = client.post("/api/auth/register", json={"email": f"mf-{secrets.token_hex(4)}@example.org", "password": "supersecret"})
    assert r.status_code in (200, 201), r.text
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _spot():
    db = SessionLocal()
    try:
        sp = models.Spot(name="Mitfahrweiher-" + secrets.token_hex(3), lat=LAT, lon=LON)
        db.add(sp); db.commit()
        return sp.id
    finally:
        db.close()


def _session(uid, spot_id, t0, minuten=40, **kw):
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t0,
                           ended_at=t0 + timedelta(minutes=minuten), sport="pumpfoil", is_pumpfoil=True, status="done",
                           place_name="Mitfahrweiher", place_lat=LAT, place_lon=LON, gps_hz=1, spot_id=spot_id, **kw)
        db.add(s); db.flush()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=1,
                                     foiling_distance_m=500.0, foiling_time_s=120.0,
                                     track_geojson=json.dumps({"type": "LineString", "coordinates": [[LON, LAT], [LON + 0.001, LAT]]})))
        db.commit()
        _ANGELEGT.append(s.id)
        return s.id
    finally:
        db.close()


def _freunde(a, b):
    db = SessionLocal()
    try:
        lo, hi = sorted((a, b))
        db.add(models.Friendship(user_lo=lo, user_hi=hi, requester_id=a, status="accepted")); db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _aufraeumen():
    yield
    zeitverbergen.cache_leeren()
    if _ANGELEGT:
        db = SessionLocal()
        try:
            db.query(models.Session).filter(models.Session.id.in_(_ANGELEGT)).update(
                {models.Session.deleted: True}, synchronize_session=False)
            db.commit()
        finally:
            db.close()
        _ANGELEGT.clear()


def _ids(client, kopf, sid, quelle):
    r = client.get(f"/api/sessions/{sid}/mitfahrer?quelle={quelle}", headers=kopf)
    assert r.status_code == 200, r.text
    return {z["session_id"]: z for z in r.json()["zeilen"]}


def test_quellen_und_ueberlappung(client):
    ich_k, ich = _konto(client)
    _, du = _konto(client)
    spot = _spot()
    t0 = (datetime.now(timezone.utc) - timedelta(days=3)).replace(hour=10, minute=0, second=0, microsecond=0)
    meine = _session(ich, spot, t0)
    gleich = _session(du, spot, t0 + timedelta(minutes=20))           # ueberlappt
    spaeter = _session(du, spot, t0 + timedelta(hours=4))             # gleicher Tag, keine Ueberlappung
    anderswo = _session(du, None, t0 + timedelta(minutes=5))          # gleichzeitig, aber kein Spot
    eigene_alt = _session(ich, spot, t0 - timedelta(days=7))

    g = _ids(client, ich_k, meine, "gleichzeitig")
    assert gleich in g and spaeter not in g and anderswo not in g and meine not in g
    assert g[gleich]["ueberlappt"] is True
    tag = _ids(client, ich_k, meine, "tag")
    assert {gleich, spaeter} <= set(tag) and tag[spaeter]["ueberlappt"] is False
    e = _ids(client, ich_k, meine, "eigene")
    assert eigene_alt in e and e[eigene_alt]["gleicher_spot"] is True and gleich not in e
    assert _ids(client, ich_k, meine, "freunde") == {}
    _freunde(ich, du)
    f = _ids(client, ich_k, meine, "freunde")
    assert {gleich, spaeter, anderswo} <= set(f)
    assert f[gleich]["gleicher_spot"] is True and f[anderswo]["gleicher_spot"] is False
    assert client.get(f"/api/sessions/{meine}/mitfahrer?quelle=quatsch", headers=ich_k).status_code == 400


def test_verborgene_uhrzeit_auch_vor_freunden(client):
    ich_k, ich = _konto(client)
    du_k, du = _konto(client)
    client.put("/api/settings", headers=du_k, json={"hide_time": True})
    zeitverbergen.cache_leeren()
    _freunde(ich, du)
    spot = _spot()
    t0 = (datetime.now(timezone.utc) - timedelta(days=3)).replace(hour=7, minute=23, second=41, microsecond=0)
    meine = _session(ich, spot, t0)
    deine = _session(du, spot, t0 + timedelta(minutes=10))

    assert deine not in _ids(client, ich_k, meine, "gleichzeitig")
    for quelle in ("tag", "freunde"):
        z = _ids(client, ich_k, meine, quelle)[deine]
        assert z["zeit_verborgen"] is True and z["ueberlappt"] is None
        assert "07:33:41" not in json.dumps(z)
    # Umgekehrt: von der zeitverborgenen Session aus gibt es fuer andere keine Gleichzeitigkeit.
    r = client.get(f"/api/sessions/{deine}/mitfahrer?quelle=gleichzeitig", headers=ich_k).json()
    assert r["echtzeit"] is False and r["zeilen"] == []
    # Der Besitzer selbst sieht seine echte Zeit und die Ueberlappung.
    z = _ids(client, du_k, deine, "gleichzeitig")[meine]
    assert z["ueberlappt"] is True


def test_verborgener_ort_faellt_aus_dem_spot(client):
    ich_k, ich = _konto(client)
    _, du = _konto(client)
    spot = _spot()
    t0 = (datetime.now(timezone.utc) - timedelta(days=3)).replace(hour=10, minute=0, second=0, microsecond=0)
    meine = _session(ich, spot, t0)
    versteckt = _session(du, spot, t0 + timedelta(minutes=5), ort_sichtbarkeit="hide")
    assert versteckt not in _ids(client, ich_k, meine, "gleichzeitig")
    assert versteckt not in _ids(client, ich_k, meine, "tag")
