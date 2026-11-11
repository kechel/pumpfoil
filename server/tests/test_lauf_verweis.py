"""Bestenlisten-Zeilen verweisen auf den Lauf (11.11.2026): Einzel-Lauf-Kennzahlen und Sprints bekommen `run_idx`,
Session-Kennzahlen nur `session_id`, Summen keins (-> Profil)."""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone


def _ar(sid_idx: dict, **spalten):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        u = models.User(email=f"lauf-{secrets.token_hex(4)}@example.org", password_hash="x")
        db.add(u); db.flush()
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=u.id, started_at=datetime.now(timezone.utc))
        db.add(s); db.flush()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", **spalten)); db.commit()
        return s.id
    finally:
        db.close()


def test_lauf_dazu(client):
    from app.db import SessionLocal
    from app.teams import lauf_dazu
    sid = _ar({}, best_distance_idx=2, sprint_json=json.dumps({"lauf": {"sprint_100m": 4}}))
    db = SessionLocal()
    try:
        z = [{"session_id": sid}]; lauf_dazu(db, "distance", z); assert z[0]["run_idx"] == 2
        z = [{"session_id": sid}]; lauf_dazu(db, "sprint_100m", z); assert z[0]["run_idx"] == 4
        z = [{"session_id": sid}]; lauf_dazu(db, "sprint_200m", z); assert "run_idx" not in z[0]   # kein Fenster
        z = [{"session_id": sid}]; lauf_dazu(db, "session_distance", z); assert "run_idx" not in z[0]
        z = [{"user_id": 1}]; lauf_dazu(db, "sum_distance", z); assert "run_idx" not in z[0]
        z = [{"session_id": sid, "run_idx": 7}]; lauf_dazu(db, "distance", z); assert z[0]["run_idx"] == 7  # bleibt
    finally:
        db.close()
