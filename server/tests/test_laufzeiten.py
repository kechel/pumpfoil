"""Lauf-Zeitpunkte in analysis_results (app/laufzeiten.py, 03.11.2026) — Early Bird / Nachteule ohne segments_json."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

from app.laufzeiten import zeitpunkte


def test_zeitpunkte_mit_trim():
    t0 = datetime(2026, 10, 1, 5, 0, tzinfo=timezone.utc)
    segs = [{"t_start_ms": 60_000, "t_end_ms": 120_000}, {"t_start_ms": 300_000, "t_end_ms": 360_000}]
    a, e = zeitpunkte(t0, 30_000, segs)
    assert a == t0 + timedelta(seconds=90) and e == t0 + timedelta(seconds=390)
    assert zeitpunkte(t0, None, []) == (None, None)


def test_spalten_und_rueckfall_liefern_dasselbe(client):
    """_time_rows mit gesetzten Spalten = _time_rows aus segments_json (vor dem Nachtragen)."""
    from app import models
    from app.api.community import _time_rows
    from app.db import SessionLocal
    from app.laufzeiten import setzen
    r = client.post("/api/auth/register", json={"email": f"lz-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    uid = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["id"]
    db = SessionLocal()
    try:
        t = datetime(2026, 7, 1, 4, 30, tzinfo=timezone.utc)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(hours=1),
                           sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True, status="analyzed",
                           trim_start_ms=10_000, place_lat=47.7, place_lon=9.2)
        db.add(s); db.commit()
        ar = models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=2,
                                   segments_json=json.dumps([{"t_start_ms": 5_000, "t_end_ms": 65_000},
                                                             {"t_start_ms": 1_200_000, "t_end_ms": 1_500_000}]))
        db.add(ar); db.commit()
        vorher = [x for x in _time_rows(db, None, uid, True, "pumpfoil", None) if x[1] == s.id]
        assert setzen(s, ar) is True
        db.commit()
        nachher = [x for x in _time_rows(db, None, uid, True, "pumpfoil", None) if x[1] == s.id]
        assert vorher and vorher == nachher
        # 04:30 UTC + 10 s Trim + 5 s = 06:30:15 in Mitteleuropa (Sommerzeit)
        assert nachher[0][7] == 6 * 3600 + 30 * 60 + 15
    finally:
        db.close()
