"""Session teilen (app/split.py, Nutzerwunsch 25.10.2026: Wingfoilen + Pumpfoilen in einer Aufnahme)."""
from __future__ import annotations

import base64
import json
import uuid as _uuid
from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from app import split


def _nutzer(client, kennung):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    assert r.status_code in (200, 201), r.text
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        return db.query(models.User).filter_by(email=f"{kennung}@test.de").one().id, r.json()
    finally:
        db.close()


START = datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc)


def _aufnahme(db, uid, minuten=20, pause=None):
    """GPS 1 Hz, Accel 25 Hz in 10-s-Chunks mit t0, Kreisel 50 Hz mit t0, Puls-Kanal; optional eine Pause
    [t_session_ms, dauer_ms]."""
    from app import models, storage
    u = f"test-{_uuid.uuid4().hex}"
    storage.ensure_session_dir(u)
    n = minuten * 60
    storage.save_gps_chunk(u, 0, [[i * 1000, 46.9661 + i * 1e-5, 7.385, 4.0] for i in range(n)])
    for k in range(n // 10):
        a = np.full((250, 3), k, dtype="<i2")             # Wert = Chunk-Nummer -> Herkunft pruefbar
        storage.save_accel_chunk(u, k, base64.b64encode(a.tobytes()).decode(), t0_ms=k * 10_000)
        g = np.full((500, 3), k, dtype="<i2")
        storage.save_gyro_chunk(u, k, base64.b64encode(g.tobytes()).decode(), t0_ms=k * 10_000)
    storage.save_hr_chunk(u, 0, [[i * 1000, 100] for i in range(n)])
    s = models.Session(session_uuid=u, user_id=uid, sport="wingfoil", started_at=START,
                       ended_at=START + timedelta(minutes=minuten) + timedelta(milliseconds=pause[1] if pause else 0),
                       gps_hz=1, accel_hz=25, accel_scale=2048, status="analyzed", is_pumpfoil=True,
                       sport_class="wingfoil", sport_source="owner", foil_id=None,
                       place_lat=46.9661, place_lon=7.385,
                       pause_windows=json.dumps([pause]) if pause else None,
                       excluded_ranges=json.dumps([[100_000, 200_000], [400_000, 600_000]]))
    db.add(s); db.commit()
    return s


@pytest.fixture
def ohne_analyse(monkeypatch):
    """Die Auswertung selbst ist hier nicht Gegenstand — sie haette fuer die Testdaten nichts zu finden."""
    monkeypatch.setattr(split, "run_analysis", lambda db, s: None)
    import app.api.sessions as api_sessions
    monkeypatch.setattr(api_sessions, "_spot_nachziehen", lambda db, s: None)


def test_teilen_schneidet_alle_spuren_und_rechnet_die_zeit(client, ohne_analyse):
    from app.db import SessionLocal
    from app import models, storage
    uid, _ = _nutzer(client, "split-1")
    db = SessionLocal()
    try:
        # 2 min Pause bei Minute 5 -> der zweite Teil (ab Minute 8) beginnt um 12:10 Wanduhr
        s = _aufnahme(db, uid, pause=[300_000, 120_000])
        a, b = split.split_session(db, s, 480_000, [None, "pumpfoil"])
        db.refresh(s)
        assert s.deleted and a.split_from == s.id and b.split_from == s.id
        assert a.started_at == START and b.started_at == START + timedelta(minutes=10)
        assert a.ended_at == START + timedelta(minutes=10) and b.ended_at == s.ended_at
        assert json.loads(a.pause_windows) == [[300_000, 120_000]] and b.pause_windows is None
        # Zeitfenster beschnitten und verschoben
        assert json.loads(a.excluded_ranges) == [[100_000, 200_000], [400_000, 480_000]]
        assert json.loads(b.excluded_ranges) == [[0, 120_000]]
        assert (a.sport_class, a.sport_source) == ("wingfoil", "owner")
        assert (b.sport_class, b.sport_source) == ("pumpfoil", "owner")

        ga, gb = storage.load_gps(a.session_uuid, roh=True), storage.load_gps(b.session_uuid, roh=True)
        assert len(ga) == 480 and len(gb) == 720 and gb[0][0] == 0 and ga[-1][0] == 479_000
        aa, ab = storage.load_accel(a.session_uuid), storage.load_accel(b.session_uuid)
        assert aa.shape[0] + ab.shape[0] == 120 * 250
        assert ab[0, 0] == 48 and aa[-1, 0] == 47          # Chunk 48 beginnt genau bei 480 s
        assert storage.load_accel_t0(b.session_uuid)[0] == 0
        ya, yb = storage.load_gyro(a.session_uuid), storage.load_gyro(b.session_uuid)
        assert ya.shape[0] == 48 * 500 and yb.shape[0] == 72 * 500 and yb[0, 0] == 48
        hb = json.loads((storage.session_dir(b.session_uuid) / "hr" / "0.json").read_text())
        assert len(hb) == 720 and hb[0][0] == 0
    finally:
        db.close()


def test_aufheben_holt_das_original_zurueck(client, ohne_analyse):
    from app.db import SessionLocal
    from app import models, storage
    uid, _ = _nutzer(client, "split-2")
    db = SessionLocal()
    try:
        s = _aufnahme(db, uid)
        foto = models.SessionPhoto(session_id=s.id, user_id=uid, url="/media/x.webp")
        db.add(foto); db.commit()
        a, b = split.split_session(db, s, 300_000)
        db.refresh(foto)
        assert foto.session_id == a.id
        dirs = [storage.session_dir(x.session_uuid) for x in (a, b)]
        orig = split.unsplit_session(db, b)
        db.refresh(foto)
        assert orig.id == s.id and not orig.deleted and foto.session_id == s.id
        assert db.query(models.Session).filter(models.Session.split_from == s.id).count() == 0
        assert not any(d.exists() for d in dirs)
    finally:
        db.close()


def test_grenzen(client, ohne_analyse):
    from app.db import SessionLocal
    uid, _ = _nutzer(client, "split-3")
    db = SessionLocal()
    try:
        s = _aufnahme(db, uid, minuten=5)
        for t in (30_000, 270_000):                         # ein Teil unter einer Minute
            with pytest.raises(ValueError):
                split.split_session(db, s, t)
        s.status = "recording"; db.commit()
        with pytest.raises(ValueError):
            split.split_session(db, s, 150_000)
    finally:
        db.close()


def test_api_nur_eigene(client, ohne_analyse):
    from app.db import SessionLocal
    uid, auth = _nutzer(client, "split-4")
    _, fremd = _nutzer(client, "split-5")
    db = SessionLocal()
    try:
        s = _aufnahme(db, uid)
        sid = s.id
    finally:
        db.close()
    hdr = lambda a: {"Authorization": f"Bearer {a.get('access_token') or a.get('token')}"}
    assert client.post(f"/api/sessions/{sid}/split", json={"t_ms": 300_000}, headers=hdr(fremd)).status_code == 404
    r = client.post(f"/api/sessions/{sid}/split", json={"t_ms": 300_000}, headers=hdr(auth))
    assert r.status_code == 200, r.text
    ids = r.json()["ids"]
    d = client.get(f"/api/sessions/{ids[1]}", headers=hdr(auth)).json()
    assert d["split_from"] == sid and d["split_teile"] == ids and d["status"] == "complete"
    assert client.post(f"/api/sessions/{ids[1]}/unsplit", headers=hdr(auth)).json() == {"id": sid}
