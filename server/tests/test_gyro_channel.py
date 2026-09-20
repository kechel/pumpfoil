"""Gyro-Kanal (kind="gyro") — Ablage, Buchhaltung und Abgrenzung zum Accel.

Der Kanal ist seit 20.09.2026 im Vertrag (docs/data-format.md) und wird bisher nur von den
Handy-Recordern gefuellt. Die ANALYSE liest ihn nicht — getestet wird deshalb, dass er
ankommt, richtig abgelegt wird und nichts Bestehendes verschiebt.
"""
import base64
import math

import numpy as np


def _gps_chunk(n=60, v=5.0):
    lat, lon = 54.0, 10.0
    out = []
    for i in range(n):
        out.append([i * 1000, lat, lon, v, 130, 5.0])
        lon += v / (111_320.0 * math.cos(math.radians(lat)))
    return out


def _dreiachs_b64(n=750, amplitude=1000):
    """int16, drei Achsen interleaved — dieselbe Form fuer Accel und Gyro."""
    t = np.arange(n) / 50.0
    z = (np.sin(2 * math.pi * 1.0 * t) * amplitude).astype("<i2")
    inter = np.empty(n * 3, dtype="<i2")
    inter[0::3] = np.zeros(n, dtype="<i2")
    inter[1::3] = np.zeros(n, dtype="<i2")
    inter[2::3] = z
    return base64.b64encode(inter.tobytes()).decode()


def _geraet(client):
    client.post("/api/auth/register",
                json={"email": "gyro@example.com", "password": "geheim123", "name": "Gyro"})
    tok = client.post("/api/auth/login",
                      json={"email": "gyro@example.com", "password": "geheim123"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {tok}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev_token = client.post("/api/devices/pair", json={"code": code, "label": "Pixel 7"}).json()["device_token"]
    return auth, {"X-Device-Token": dev_token}


def test_gyro_chunk_wird_abgelegt_und_getrennt_gezaehlt(client, tmp_path):
    from app import storage

    auth, dev = _geraet(client)
    uuid = "gyro-uuid-001"
    r = client.post("/api/ingest/session", headers=dev,
                    json={"session_uuid": uuid, "started_at": "2026-09-20T09:00:00Z",
                          "accel_hz": 50, "placement": "phone"})
    assert r.status_code == 200, r.text

    for index, kind, daten in ((0, "gps", _gps_chunk()),
                               (1, "accel", _dreiachs_b64()),
                               (2, "gyro", _dreiachs_b64())):
        enc = "json" if kind == "gps" else "int16-b64"
        r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                        json={"index": index, "kind": kind, "encoding": enc,
                              "t0_ms": index * 1000, "data": daten})
        assert r.status_code == 200, (kind, r.text)

    # 1. Eigenes Verzeichnis, Accel bleibt unberuehrt.
    d = storage.session_dir(uuid)
    assert (d / "gyro" / "2.bin").exists()
    assert (d / "gyro" / "2.t0").read_text() == "2000"
    assert (d / "accel" / "1.bin").exists()
    assert not (d / "accel" / "2.bin").exists()

    # 2. Gleiche Bytes wie ein Accel-Chunk derselben Laenge -> gleiche Sample-Zahl.
    assert (d / "gyro" / "2.bin").stat().st_size == (d / "accel" / "1.bin").stat().st_size

    # 3. Buchhaltung in /sessions/in-progress: der Gyro-Zaehler ueberschreibt NICHT den
    #    Accel-Zaehler (genau das tat `sessions.py` vor dem 20.09.2026, weil dort
    #    „alles ausser gps" als accel verbucht wurde), und er zaehlt beim Fortschritt MIT —
    #    der gemeinsame Chunk-Index des Clients kennt ihn ja auch.
    liste = client.get("/api/sessions/in-progress", headers=auth).json()
    eintrag = next(e for e in liste if e["session_uuid"] == uuid)
    assert eintrag["gps_received"] == 1
    assert eintrag["accel_received"] == 1
    assert eintrag["upload_received"] == 3


def test_unbekannter_kanal_wird_abgelehnt(client):
    _, dev = _geraet(client)
    uuid = "gyro-uuid-002"
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-09-20T09:00:00Z"})
    r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                    json={"index": 0, "kind": "magnet", "encoding": "int16-b64",
                          "data": _dreiachs_b64()})
    assert r.status_code == 400


def test_gyro_verlangt_base64_string(client):
    _, dev = _geraet(client)
    uuid = "gyro-uuid-003"
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-09-20T09:00:00Z"})
    r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                    json={"index": 0, "kind": "gyro", "encoding": "int16-b64",
                          "data": [[1, 2, 3]]})
    assert r.status_code == 400
