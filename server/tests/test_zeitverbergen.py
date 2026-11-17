"""„Uhrzeit verbergen" (17.11.2026, Wunsch u146): andere sehen nur den Tag, der Besitzer seine echte Zeit.

Wie beim Ort: EINE Session mit unverwechselbarer Startzeit (07:23:41 UTC), dann jeden Endpunkt abfragen, der fremde
Sessions zeigt, und im rohen Antworttext nach der echten Uhrzeit suchen.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

import pytest

from app import models, zeitverbergen
from app.db import SessionLocal

LAT, LON = 47.5321, 9.6812          # Europe/Berlin bzw. Zurich: 07:23:41 UTC = 08:23:41 Ortszeit
ECHT = ("07:23:41", "08:23:41", "07:23", "08:23")
ORT = "Zeitweiher-" + secrets.token_hex(3)   # eindeutig: die Feeds werden darauf gefiltert (volle Suite = viele Sessions)
_ANGELEGT: list[int] = []


def _konto(client, mail):
    mail = mail.replace("@", f"-{secrets.token_hex(3)}@")
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code in (200, 201), r.text
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _session(uid):
    db = SessionLocal()
    try:
        tag = (datetime.now(timezone.utc) - timedelta(days=2)).date()
        t0 = datetime(tag.year, tag.month, tag.day, 7, 23, 41, tzinfo=timezone.utc)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t0,
                           ended_at=t0 + timedelta(minutes=47), sport="pumpfoil", is_pumpfoil=True, status="done",
                           place_name=ORT, place_lat=LAT, place_lon=LON, gps_hz=1)
        db.add(s); db.flush()
        db.add(models.AnalysisResult(
            session_id=s.id, algo_version="test", detection="model", num_runs=1,
            foiling_distance_m=8_888_000.0, foiling_time_s=88_888.0, pump_count=888_888,
            best_distance_m=8_888_000.0, best_distance_idx=0, best_duration_s=88_888.0, best_duration_idx=0,
            best_speed_mps=88.0, best_speed_idx=0, best_glide_s=888.0, best_glide_idx=0,
            track_geojson=json.dumps({"type": "LineString", "coordinates": [[LON, LAT], [LON + 0.002, LAT + 0.001]]})))
        db.commit()
        _ANGELEGT.append(s.id)
        return s.id
    finally:
        db.close()


@pytest.fixture(autouse=True)
def _aufraeumen():
    yield
    zeitverbergen.cache_leeren()
    from app.api import community
    community._rec_cache.clear()   # die Testsession haelt mit absurden Werten Rekorde — nicht im Cache stehen lassen
    if _ANGELEGT:
        db = SessionLocal()
        try:
            db.query(models.Session).filter(models.Session.id.in_(_ANGELEGT)).update(
                {models.Session.deleted: True}, synchronize_session=False)
            db.commit()
        finally:
            db.close()
        _ANGELEGT.clear()


def _utc(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(timezone.utc).strftime("%H:%M:%S")


def _eintraege(knoten, sid):
    if isinstance(knoten, dict):
        if knoten.get("session_id") == sid or knoten.get("id") == sid:
            yield knoten
        for w in knoten.values():
            yield from _eintraege(w, sid)
    elif isinstance(knoten, list):
        for w in knoten:
            yield from _eintraege(w, sid)


def test_andere_sehen_nur_den_tag(client):
    kopf, uid = _konto(client, "zeit-besitzer@b.de")
    fremd, _ = _konto(client, "zeit-leser@b.de")
    client.put("/api/settings", headers=kopf, json={"hide_time": True,
                                                     "public_profile": {"enabled": True, "titles": True, "records": True,
                                                                        "sessions": True}})
    assert client.get("/api/settings", headers=kopf).json()["hide_time"] is True
    sid = _session(uid)
    zeitverbergen.cache_leeren()

    endpunkte = [
        f"/api/sessions/{sid}",
        f"/api/community/sessions?period=all&accel_only=false&spot={ORT}",
        f"/api/community/sessions-grouped?accel_only=false&spot={ORT}",
        "/api/community/records?accel_only=false&sport=pumpfoil",
        f"/api/community/foiler/{uid}",
    ]
    for url in endpunkte:
        r = client.get(url, headers=fremd)
        assert r.status_code == 200, (url, r.status_code, r.text[:300])
        gefunden = list(_eintraege(r.json(), sid))
        assert gefunden or url.startswith("/api/community/foiler"), f"{url}: Session fehlt — der Test prueft nichts"
        for e in gefunden:
            st = str(e.get("started_at") or "")
            assert not any(z in st for z in ECHT), (url, st)
            if "started_at" in e:
                assert e.get("zeit_verborgen") is True, (url, e)
        for z in ECHT[:2]:
            assert z not in r.text, f"{url} verraet {z}"

    d = client.get(f"/api/sessions/{sid}", headers=fremd).json()
    # 12:00 Ortszeit des Tages, Dauer unveraendert
    st, en = datetime.fromisoformat(d["started_at"]), datetime.fromisoformat(d["ended_at"])
    assert (en - st) == timedelta(minutes=47)
    assert st.astimezone(timezone.utc).hour in (10, 11), st      # 12:00 in Europa (MEZ/MESZ)
    # Wind je Stunde verraet die Uhrzeit -> fuer andere nichts
    assert client.get(f"/api/sessions/{sid}/wind", headers=fremd).json()["wind"] is None

    # Der Besitzer sieht seine echte Zeit.
    eigen = client.get(f"/api/sessions/{sid}", headers=kopf).json()
    assert _utc(eigen["started_at"]) == "07:23:41" and eigen["zeit_verborgen"] is False


def test_standard_ist_sichtbar(client):
    kopf, uid = _konto(client, "zeit-standard@b.de")
    fremd, _ = _konto(client, "zeit-standard-leser@b.de")
    assert client.get("/api/settings", headers=kopf).json()["hide_time"] is False
    sid = _session(uid)
    zeitverbergen.cache_leeren()
    d = client.get(f"/api/sessions/{sid}", headers=fremd).json()
    assert _utc(d["started_at"]) == "07:23:41" and d["zeit_verborgen"] is False


def test_verschiebung_auf_mittag_ortszeit():
    t = datetime(2026, 11, 15, 23, 30, tzinfo=timezone.utc)          # in Berlin schon der 16.
    neu = t + zeitverbergen.verschiebung(t, "Europe/Berlin")
    lokal = neu.astimezone(__import__("zoneinfo").ZoneInfo("Europe/Berlin"))
    assert (lokal.day, lokal.hour, lokal.minute) == (16, 12, 0)


def test_sprint_rekorde_nur_pumpfoil(client):
    """Fliegende Sprints als Rekord-Kacheln (17.11.2026) — nur bei Pumpfoil und Foil Scoot."""
    kopf, uid = _konto(client, "sprint-rekord@b.de")
    sid = _session(uid)
    db = SessionLocal()
    try:
        ar = db.query(models.AnalysisResult).filter_by(session_id=sid).one()
        ar.sprint_json = json.dumps({"best": {"sprint_100m": 77.7, "sprint_60s": 66.6},
                                     "lauf": {"sprint_100m": 0, "sprint_60s": 0}, "fenster": {"sprint_100m": [0, 1000]}})
        db.commit()
    finally:
        db.close()
    from app.api import community
    community._rec_cache.clear()
    rec = client.get("/api/community/records?accel_only=false&sport=pumpfoil&period=all", headers=kopf).json()["all"]
    assert rec["sprint_100m"]["session_id"] == sid and rec["sprint_100m"]["value"] == 77.7, rec["sprint_100m"]
    assert rec["sprint_60s"]["value"] == 66.6
    wing = client.get("/api/community/records?accel_only=false&sport=wingfoil&period=all", headers=kopf).json()["all"]
    assert "sprint_100m" not in wing and "sprint_60s" not in wing
