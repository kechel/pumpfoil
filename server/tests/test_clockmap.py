"""Session-ms -> Uhrzeit: die Pausen-Umrechnung und der Weg durch die API.

Hintergrund (Nutzermeldung 10.09.2026): die Sample-Zeitachse laeuft in AKTIVER Zeit, die Uhr
zieht Pausen ab. Jede Uhrzeit-Anzeige rechnete `started_at + t` und lag damit nach der ersten
Pause um die gesamte Pausendauer zu frueh; dazu liess sie den Trim-Rebase unter den Tisch fallen.
"""
from __future__ import annotations

import base64
import math

import numpy as np

from app.clockmap import segmente_mit_uhrzeit, versatz_ms, wanduhr_ms


class _FakeSession:
    """Nur die zwei Felder, die clockmap liest."""

    def __init__(self, pause_windows=None, trim_start_ms=None):
        self.pause_windows = pause_windows
        self.trim_start_ms = trim_start_ms


def test_versatz_zaehlt_nur_pausen_davor():
    pl = [(30_000, 600_000), (900_000, 300_000)]
    assert versatz_ms(pl, 0) == 0                  # vor der ersten Pause: nichts
    assert versatz_ms(pl, 30_000) == 600_000       # genau auf der Pause: sie zaehlt mit
    assert versatz_ms(pl, 100_000) == 600_000
    assert versatz_ms(pl, 1_000_000) == 900_000    # beide
    assert wanduhr_ms(pl, 100_000) == 700_000


def test_ohne_pausen_bleibt_alles_wie_es_war():
    assert versatz_ms([], 123_456) == 0
    assert wanduhr_ms([], 123_456) == 123_456


def test_segmente_bekommen_trim_und_pausen():
    s = _FakeSession(pause_windows="[[30000, 600000]]", trim_start_ms=20_000)
    # Ein v2-Segment (kennt seine Session-Zeit) und ein altes v1-Segment (nur t_start_ms).
    segs = [
        {"t_start_ms": 10_000, "t_end_ms": 40_000,
         "t_start_session_ms": 30_000, "t_end_session_ms": 60_000},
        {"t_start_ms": 100_000, "t_end_ms": 130_000},
    ]
    out = segmente_mit_uhrzeit(s, segs)
    # v2: 30 s Session-Zeit, die Pause bei 30 s zaehlt mit -> 630 s
    assert out[0]["t_start_clock_ms"] == 630_000
    assert out[0]["t_end_clock_ms"] == 660_000
    # v1: 100 s + 20 s Trim = 120 s Session-Zeit, plus 600 s Pause
    assert out[1]["t_start_clock_ms"] == 720_000
    # Das Original bleibt unberuehrt (sonst landet das im gecachten Analyse-Objekt).
    assert "t_start_clock_ms" not in segs[0]


def test_kaputte_pausen_kosten_keine_anzeige():
    for roh in ("kein json", "[[1]]", "[]", None, '[["a","b"]]'):
        out = segmente_mit_uhrzeit(_FakeSession(roh), [{"t_start_ms": 5_000}])
        assert out[0]["t_start_clock_ms"] == 5_000


def _gps(n=60, v=5.0):
    lat, lon = 54.0, 10.0
    out = []
    for i in range(n):
        out.append([i * 1000, lat, lon, v, 130, 5.0])
        lon += v / (111_320.0 * math.cos(math.radians(lat)))
    return out


def _accel(n=1500, scale=2048):
    t = np.arange(n) / 25.0
    z = (np.sin(2 * math.pi * 1.0 * t) * 0.5 * scale).astype("<i2")
    inter = np.zeros(n * 3, dtype="<i2")
    inter[2::3] = z
    return base64.b64encode(inter.tobytes()).decode()


def test_pausen_gehen_durch_ingest_in_die_anzeige(client):
    """Die Uhr meldet ihre Pausen im /complete — danach muss die Endzeit WANDUHR sein und die
    Achsenlaenge weiter die aktive Zeit."""
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "pausen@b.de", "password": "supersecret"}
    ).json()["access_token"]}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post(
        "/api/devices/pair", json={"code": code}).json()["device_token"]}

    uuid = "pausen-uuid-1"
    r = client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": uuid, "started_at": "2026-09-10T09:00:00Z"})
    assert r.status_code == 200, r.text
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev, json={
        "index": 0, "kind": "gps", "encoding": "json", "data": _gps()})
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev, json={
        "index": 0, "kind": "accel", "encoding": "int16-b64", "data": _accel()})
    # 10 min Pause ab Sekunde 30. Endzeit schickt die Uhr NICHT -> der Server leitet sie ab.
    r = client.post(f"/api/ingest/session/{uuid}/complete", headers=dev, json={
        "total_chunks": 1, "pauses": [[30_000, 600_000]]})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]

    body = client.get(f"/api/sessions/{sid}", headers=auth).json()
    assert body["pause_windows"] == [[30_000, 600_000]]
    # Achse: 59 s (letzter GPS-Zeitstempel) — NICHT die Wanduhr-Spanne.
    assert body["duration_ms"] == 59_000
    # Endzeit = Start + 59 s Achse + 600 s Pause. Auf die DIFFERENZ pruefen, nicht auf einen
    # Uhrzeit-String: die DB liefert den Zeitstempel in ihrer eigenen Zone zurueck.
    from datetime import datetime
    a_ts = datetime.fromisoformat(body["started_at"])
    b_ts = datetime.fromisoformat(body["ended_at"])
    assert (b_ts - a_ts).total_seconds() == 59 + 600

    # Und die Laeufe tragen ihre Uhrzeit fertig mit — nach der Pause also mindestens 600 s
    # weiter als ihre Session-Zeit.
    for seg in (body.get("analysis") or {}).get("segments") or []:
        sess = seg.get("t_start_session_ms")
        if sess is None:
            continue
        assert seg["t_start_clock_ms"] == sess + (600_000 if sess >= 30_000 else 0)
