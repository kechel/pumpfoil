"""Suunto-Workout OHNE GPS: FIT-Dauer lesen ja, Session NEIN (21.10. kurz erlaubt, 22.10. wieder zurueck).

Anlass: Aufruf an die Suunto-Fahrer, die SuuntoPlus-App 2-3 min zu Hause zu testen — oft ohne Fix.
Bis dahin fiel so ein Workout im Import still weg, samt FIT-Datei. Jetzt entsteht eine Session mit
Dauer aus den Record-Zeitstempeln, und das Original liegt daneben.
"""
from __future__ import annotations

import struct
from datetime import datetime, timezone

FIT_EPOCH = 631065600  # 1989-12-31 UTC
_CRC = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
        0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400]


def _crc(data: bytes) -> int:
    crc = 0
    for b in data:
        for nib in (b & 0xF, b >> 4):
            tmp = _CRC[crc & 0xF]
            crc = (crc >> 4) & 0x0FFF
            crc = crc ^ tmp ^ _CRC[nib]
    return crc


def _fit_ohne_gps(start: datetime, sekunden: int) -> bytes:
    """Kleinste FIT-Datei: file_id, sport (Kitesurfen), Records nur mit Zeit + Puls."""
    ts0 = int(start.timestamp()) - FIT_EPOCH
    body = b""
    # Definition 0: file_id (global 0) — type(0, enum) + time_created(4, uint32)
    body += struct.pack("<BBBHB", 0x40, 0, 0, 0, 2) + bytes([0, 1, 0x00, 4, 4, 0x86])
    body += struct.pack("<BBI", 0x00, 4, ts0)
    # Definition 1: sport (global 12) — sport(0, enum)
    body += struct.pack("<BBBHB", 0x41, 0, 0, 12, 1) + bytes([0, 1, 0x00])
    body += struct.pack("<BB", 0x01, 44)          # 44 = kitesurfing
    # Definition 2: record (global 20) — timestamp(253, uint32) + heart_rate(3, uint8)
    body += struct.pack("<BBBHB", 0x42, 0, 0, 20, 2) + bytes([253, 4, 0x86, 3, 1, 0x02])
    for i in range(sekunden):
        body += struct.pack("<BIB", 0x02, ts0 + i, 90 + i % 20)
    kopf = struct.pack("<BBHI4s", 14, 0x20, 2132, len(body), b".FIT")
    kopf += struct.pack("<H", _crc(kopf))
    datei = kopf + body
    return datei + struct.pack("<H", _crc(datei))


def test_fit_ohne_gps_liefert_start_und_dauer():
    from app.fitimport import parse_fit_bytes
    start = datetime(2026, 10, 21, 8, 0, 0, tzinfo=timezone.utc)
    p = parse_fit_bytes(_fit_ohne_gps(start, 150))
    assert p["gps_samples"] == []
    assert p["started_at"] == start
    assert p["dauer_ms"] == 149_000


def test_suunto_workout_ohne_gps_wird_keine_session(client, monkeypatch):
    """Seit 22.10.2026 wieder: aus Kontoverknuepfungen keine Session ohne GPS (Jan; d08cf5b2 legte
    am 21.10. einem Nutzer 907 Indoor-Sessions an)."""
    from app import models
    from app.api import suunto
    from app.db import SessionLocal

    jwt = client.post("/api/auth/register", json={"email": "suunto-ohne-gps@b.de", "password": "supersecret"}).json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {jwt}"}).json()
    roh = _fit_ohne_gps(datetime(2026, 10, 21, 8, 0, 0, tzinfo=timezone.utc), 150)

    class _Antwort:
        status_code = 200
        content = roh
        headers: dict = {}
        text = ""

    monkeypatch.setattr(suunto.httpx, "get", lambda *a, **k: _Antwort())
    monkeypatch.setattr(suunto, "_sub_key", lambda: "x")
    db = SessionLocal()
    try:
        user = db.get(models.User, me["id"])
        ok, grund = suunto._hole_workout(db, user, "tok", "wk-ohne-gps-1")
        assert not ok and grund == "kein gps"
        assert db.query(models.Session).filter_by(user_id=user.id).count() == 0
    finally:
        db.close()


def test_kontoimport_nichts_vor_2026_und_nichts_ohne_gps():
    from app import importsports
    from app.api import suunto
    gps = [[0, 47.0, 9.0, 1.0, None, 5.0]]
    alt = datetime(2025, 12, 31, 23, 59, tzinfo=timezone.utc)
    neu = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    assert importsports.konto_import_grund({"gps_samples": gps, "started_at": alt}) == "zu alt"
    assert importsports.konto_import_grund({"gps_samples": gps, "started_at": neu}) is None
    assert importsports.konto_import_grund({"gps_samples": [], "started_at": neu}) == "kein gps"
    # Suunto holt alte Workouts gar nicht erst (Kontingent)
    assert suunto._vorfilter({"startTime": int(alt.timestamp() * 1000), "totalTime": 3600}) == "zu alt"
    assert suunto._vorfilter({"startTime": int(neu.timestamp() * 1000), "totalTime": 3600}) is None
    assert suunto._grund_code("zu alt") == "gefiltert"


def test_fit_geraetename_aus_file_id():
    """Uhrname aus file_id.product_name (16.11.2026: Suunto-Importe zeigten keinen Geraetenamen)."""
    from app.fitimport import parse_fit_bytes
    start = datetime(2026, 11, 7, 9, 0, 0, tzinfo=timezone.utc)
    ts0 = int(start.timestamp()) - FIT_EPOCH
    name = b"Suunto Race 2".ljust(16, b"\0")
    body = struct.pack("<BBBHB", 0x40, 0, 0, 0, 3) + bytes([0, 1, 0x00, 4, 4, 0x86, 8, 16, 0x07])
    body += struct.pack("<BBI", 0x00, 4, ts0) + name
    body += struct.pack("<BBBHB", 0x42, 0, 0, 20, 2) + bytes([253, 4, 0x86, 3, 1, 0x02])
    for i in range(30):
        body += struct.pack("<BIB", 0x02, ts0 + i, 90)
    kopf = struct.pack("<BBHI4s", 14, 0x20, 2132, len(body), b".FIT")
    kopf += struct.pack("<H", _crc(kopf))
    datei = kopf + body
    assert parse_fit_bytes(datei + struct.pack("<H", _crc(datei)))["geraet_name"] == "Suunto Race 2"


def test_suunto_takt_aus_cadence_und_mittel_je_lauf(tmp_path, monkeypatch):
    """Takt laut Uhr (16.11.2026): Suunto-Datei mit `cadence` je Record -> uhr_takt; Anzeige mittelt je Lauf."""
    from types import SimpleNamespace
    from app.fitimport import parse_fit_bytes
    from app.api import sessions as SA
    start = datetime(2026, 11, 7, 9, 0, 0, tzinfo=timezone.utc)
    ts0 = int(start.timestamp()) - FIT_EPOCH
    # file_id: type, time_created, manufacturer=23 (suunto)
    body = struct.pack("<BBBHB", 0x40, 0, 0, 0, 3) + bytes([0, 1, 0x00, 4, 4, 0x86, 1, 2, 0x84])
    body += struct.pack("<BBIH", 0x00, 4, ts0, 23)
    # record: timestamp, cadence(4, uint8)
    body += struct.pack("<BBBHB", 0x42, 0, 0, 20, 2) + bytes([253, 4, 0x86, 4, 1, 0x02])
    for i in range(60):
        body += struct.pack("<BIB", 0x02, ts0 + i, 70 if 10 <= i < 20 else (50 if 30 <= i < 40 else 0))
    kopf = struct.pack("<BBHI4s", 14, 0x20, 2132, len(body), b".FIT")
    kopf += struct.pack("<H", _crc(kopf))
    datei = kopf + body
    takt = parse_fit_bytes(datei + struct.pack("<H", _crc(datei)))["uhr_takt"]
    assert len(takt) == 20 and takt[0] == [10_000, 70]
    monkeypatch.setattr(SA.storage, "load_uhr_takt", lambda uuid: takt)
    s = SimpleNamespace(session_uuid="suunto-x", trim_start_ms=0, sport_class="pumpfoil")
    segs, met = SA.uhr_takt_anhaengen(s, [{"t_start_session_ms": 9_000, "t_end_session_ms": 21_000},
                                          {"t_start_session_ms": 29_000, "t_end_session_ms": 41_000},
                                          {"t_start_session_ms": 50_000, "t_end_session_ms": 55_000}], {})
    assert [g.get("uhr_takt_min") for g in segs] == [70.0, 50.0, None] and met["uhr_takt_min"] == 60.0
