"""Ein AUTOMATISCHER Zuschnitt wird bei jeder abschliessenden Auswertung neu bestimmt.

Anlass #10158 (27.09.2026): Zuschnitt aus einem Teil-Upload (22 von 182 min), der Rest kam spaeter,
und der alte Zuschnitt blieb stehen — zwei Stunden Fahrt lagen ausserhalb.
"""
import math
import secrets
from datetime import datetime, timedelta, timezone


def _spur(minuten=60, laeufe_bei=(5, 50), lauf_s=45):
    """1-Hz-GPS: stehen/paddeln, dazu Laeufe mit ~16 km/h an den angegebenen Minuten."""
    lat, lon, out = 47.6, 11.18, []
    for k in range(minuten * 60):
        v = 0.6
        for m in laeufe_bei:
            if m * 60 <= k < m * 60 + lauf_s:
                v = 4.5
        lon += v / (111_320.0 * math.cos(math.radians(lat)))
        out.append([k * 1000, lat, lon, v, 0, 4.0])
    return out


def _session(user_id, trim=None, auto=False):
    from app import models, storage
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=user_id,
                           started_at=datetime.now(timezone.utc) - timedelta(hours=3),
                           ended_at=datetime.now(timezone.utc) - timedelta(hours=2),
                           sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True,
                           status="complete", accel_hz=25)
        if trim:
            s.trim_start_ms, s.trim_end_ms, s.trim_auto = trim[0], trim[1], auto
        db.add(s)
        db.commit()
        storage.save_gps_chunk(s.session_uuid, 0, _spur())
        return s.id
    finally:
        db.close()


def _uid(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["id"]


def test_automatischer_zuschnitt_wird_neu_bestimmt(client):
    from app import models
    from app.analysis import abschliessend_auswerten
    from app.db import SessionLocal
    # Alter AUTOMATISCHER Zuschnitt, wie aus einem Teil-Upload: nur um den ersten Lauf.
    sid = _session(_uid(client, "zuschnitt-auto@t.de"), trim=(4 * 60_000, 7 * 60_000), auto=True)
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        abschliessend_auswerten(db, s)
        db.refresh(s)
        assert s.trim_auto is True
        assert s.trim_end_ms > 50 * 60_000, s.trim_end_ms       # der zweite Lauf ist wieder drin
        assert (s.result.num_runs or 0) >= 2, s.result.num_runs
    finally:
        db.close()


def test_zuschnitt_vom_nutzer_bleibt(client):
    from app import models
    from app.analysis import abschliessend_auswerten
    from app.db import SessionLocal
    sid = _session(_uid(client, "zuschnitt-hand@t.de"), trim=(4 * 60_000, 7 * 60_000), auto=False)
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        abschliessend_auswerten(db, s)
        db.refresh(s)
        assert (s.trim_start_ms, s.trim_end_ms, s.trim_auto) == (4 * 60_000, 7 * 60_000, False)
    finally:
        db.close()
