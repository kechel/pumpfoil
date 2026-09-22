"""`placement = "board"` an einer Session setzen — jeder Besitzer, aber nur bei Handy-Aufnahmen.

Anlass (Jan, 20.09.2026): die Lage-Ansicht (Pitch/Roll/Gierrate) ist nur sinnvoll, wenn das Handy
AM BRETT befestigt war; in Tasche, Jacke oder am Arm misst es den Fahrer.

Bis 21.09.2026 war das admin-only, solange die Lage-Rechnung noch wackelte. Dann Jan: „der Stand
ist ok so solange der nur bei Phone-Recordings angeboten wird, dann darf ab jetzt jeder selber
entscheiden ob das am Board war oder nicht, falls nicht wuerden wir das eh merken anhand der
Daten." Geblieben ist damit keine Rechte-, sondern eine SINN-Schranke: an einer Uhren-Session
gibt es keinen Kreisel und damit keine Lage.
"""
import base64
import math

import numpy as np


def _gps(n=60, v=5.0):
    lat, lon = 54.0, 10.0
    out = []
    for i in range(n):
        out.append([i * 1000, lat, lon, v, 130, 5.0])
        lon += v / (111_320.0 * math.cos(math.radians(lat)))
    return out


def _konto(client, mail, admin=False):
    client.post("/api/auth/register", json={"email": mail, "password": "geheim123", "name": "P"})
    tok = client.post("/api/auth/login",
                      json={"email": mail, "password": "geheim123"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {tok}"}
    if admin:
        from app import models
        from app.db import SessionLocal
        db = SessionLocal()
        u = db.query(models.User).filter_by(email=mail).first()
        u.is_admin = True
        db.commit(); db.close()
    return auth


def _session(client, auth, uuid):
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair",
                                         json={"code": code, "label": "Pixel"}).json()["device_token"]}
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-09-20T09:00:00Z",
                      "accel_hz": 50, "placement": "phone"})
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "gps", "encoding": "json", "data": _gps()})
    # Die id kommt aus der Anmeldung, nicht aus /api/sessions: die Liste zeigt frisch
    # hochgeladene Aufnahmen je nach Status nicht zwingend.
    sid = client.post("/api/ingest/session", headers=dev,
                      json={"session_uuid": uuid, "started_at": "2026-09-20T09:00:00Z"}).json()["session_id"]
    return client.get(f"/api/sessions/{sid}", headers=auth).json()


def test_admin_darf_markieren_und_es_kommt_zurueck(client):
    auth = _konto(client, "board-admin@example.com", admin=True)
    s = _session(client, auth, "placement-uuid-1")
    assert s["placement"] == "phone"      # so hat der Recorder es gemeldet

    r = client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["placement"] == "board"
    # und es haelt
    wieder = client.get(f"/api/sessions/{s['id']}", headers=auth).json()
    assert wieder["placement"] == "board"


def test_besitzer_ohne_adminrechte_darf_auch(client):
    """Seit 21.09.2026: kein Admin noetig — es ist die eigene Aufnahme."""
    auth = _konto(client, "board-normal@example.com")
    s = _session(client, auth, "placement-uuid-2")
    r = client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth)
    assert r.status_code == 200, r.text
    assert client.get(f"/api/sessions/{s['id']}", headers=auth).json()["placement"] == "board"


def test_uhren_aufnahme_laesst_sich_nicht_markieren(client):
    """Die verbleibende Schranke: ohne Handy-Recorder gibt es keine Lage, also auch nichts zu
    markieren. Erkennbar daran, dass der Recorder kein `placement` gemeldet hat und kein
    Kreisel-Chunk existiert."""
    auth = _konto(client, "board-uhr@example.com", admin=True)   # selbst als Admin nicht
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair",
                                         json={"code": code, "label": "fenix"}).json()["device_token"]}
    # Uhren-Anmeldung: OHNE `placement`.
    sid = client.post("/api/ingest/session", headers=dev,
                      json={"session_uuid": "placement-uuid-uhr",
                            "started_at": "2026-09-20T09:00:00Z"}).json()["session_id"]
    client.post("/api/ingest/session/placement-uuid-uhr/chunk", headers=dev,
                json={"index": 0, "kind": "gps", "encoding": "json", "data": _gps()})
    r = client.patch(f"/api/sessions/{sid}/meta", json={"placement": "board"}, headers=auth)
    assert r.status_code == 400, r.text
    # Und die Montage-Drehung haengt an derselben Schranke.
    r2 = client.patch(f"/api/sessions/{sid}/meta", json={"attitude_rot_deg": 90}, headers=auth)
    assert r2.status_code == 400, r2.text


def test_fremder_darf_nicht(client):
    """Gelockert wurde nur die Admin-Schranke, nicht der Besitz."""
    auth_a = _konto(client, "board-eigner@example.com")
    s = _session(client, auth_a, "placement-uuid-fremd")
    auth_b = _konto(client, "board-fremder@example.com")
    r = client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth_b)
    assert r.status_code in (403, 404), r.text


def test_unsinniger_wert_wird_abgelehnt(client):
    auth = _konto(client, "board-unsinn@example.com", admin=True)
    s = _session(client, auth, "placement-uuid-3")
    r = client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "mast"}, headers=auth)
    assert r.status_code == 400, r.text


def test_leerer_wert_setzt_zurueck(client):
    auth = _konto(client, "board-leer@example.com", admin=True)
    s = _session(client, auth, "placement-uuid-4")
    client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth)
    r = client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": ""}, headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["placement"] is None


def test_andere_meta_felder_bleiben_unberuehrt(client):
    """Die Markierung darf nichts anderes anfassen — `set_meta` aendert nur gesendete Felder."""
    auth = _konto(client, "board-rest@example.com")
    s = _session(client, auth, "placement-uuid-5")
    client.patch(f"/api/sessions/{s['id']}/meta", json={"caption": "Testlauf"}, headers=auth)
    client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth)
    d = client.get(f"/api/sessions/{s['id']}", headers=auth).json()
    assert d["caption"] == "Testlauf"
    assert d["placement"] == "board"


def _gezaehlte_session(uid: int, foil_id: int, placement: str | None):
    """Eine community-sichtbare Pumpfoil-Session mit Accel-Erkennung, direkt in der DB."""
    import uuid as _uuid
    from datetime import datetime, timezone

    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    s = models.Session(session_uuid=str(_uuid.uuid4()),
                       started_at=datetime(2026, 9, 20, 9, 0, tzinfo=timezone.utc),
                       user_id=uid, foil_id=foil_id, placement=placement,
                       is_pumpfoil=True, sport_class="pumpfoil", status="analyzed")
    db.add(s)
    db.flush()
    db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model",
                                 num_runs=1, foiling_distance_m=1000.0, foiling_time_s=250.0,
                                 pump_count=400))
    db.commit()
    db.close()


def test_foil_stats_nur_brett_zaehlt_nur_brett_aufnahmen(client):
    """`only_board=1` zaehlt NUR Aufnahmen mit dem Handy am Brett.

    Sinn des Schalters (Jan, 22.09.2026): ein Handy am Brett misst genauer als eine Uhr am
    Handgelenk. Der Filter muss deshalb wirklich trennen — nicht nur die Spalte mitschleppen.
    """
    auth = _konto(client, "foilstats-brett@example.com")
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    uid = db.query(models.User).filter_by(email="foilstats-brett@example.com").first().id
    zwei_foils = db.query(models.Foil).limit(2).all()
    assert len(zwei_foils) == 2, "Der Foil-Katalog ist leer — Seed fehlt."
    brett_foil, uhr_foil = zwei_foils[0].id, zwei_foils[1].id
    db.close()

    _gezaehlte_session(uid, brett_foil, "board")
    _gezaehlte_session(uid, uhr_foil, None)      # Uhr am Handgelenk

    alle = client.get("/api/community/foil-stats", headers=auth).json()
    nur_brett = client.get("/api/community/foil-stats?only_board=1", headers=auth).json()

    assert {r["foil_id"] for r in alle} >= {brett_foil, uhr_foil}
    assert [r["foil_id"] for r in nur_brett] == [brett_foil]
    assert next(r for r in nur_brett if r["foil_id"] == brett_foil)["sessions"] == 1
