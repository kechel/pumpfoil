"""`placement = "board"` an einer Session setzen — nur Admins.

Anlass (Jan, 20.09.2026): die Lage-Ansicht (Pitch/Roll/Gierrate) ist nur sinnvoll, wenn das Handy
AM BRETT befestigt war; in Tasche, Jacke oder am Arm misst es den Fahrer. Die Markierung ist
admin-only — damit braucht die Ansicht selbst kein zweites Gate: sie erscheint, wenn die
Markierung steht, und stehen kann sie nur, wenn ein Admin sie gesetzt hat.
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


def test_normaler_nutzer_darf_nicht(client):
    auth = _konto(client, "board-normal@example.com")
    s = _session(client, auth, "placement-uuid-2")
    r = client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth)
    assert r.status_code == 403, r.text
    assert client.get(f"/api/sessions/{s['id']}", headers=auth).json()["placement"] == "phone"


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
    auth = _konto(client, "board-rest@example.com", admin=True)
    s = _session(client, auth, "placement-uuid-5")
    client.patch(f"/api/sessions/{s['id']}/meta", json={"caption": "Testlauf"}, headers=auth)
    client.patch(f"/api/sessions/{s['id']}/meta", json={"placement": "board"}, headers=auth)
    d = client.get(f"/api/sessions/{s['id']}", headers=auth).json()
    assert d["caption"] == "Testlauf"
    assert d["placement"] == "board"
