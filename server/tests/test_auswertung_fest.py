"""Festgehaltene Auswertung (Jan, 11.11.2026): run_analysis rechnet nicht neu, ausser erzwingen."""
from datetime import datetime, timezone

from app import models
from app.analysis import run_analysis
from app.db import SessionLocal


def test_festgehaltene_auswertung_bleibt(client):   # client: App-Start legt die Spalten an
    db = SessionLocal()
    u = models.User(email=f"fest-{datetime.now().timestamp()}@example.org", password_hash="x")
    db.add(u); db.flush()
    s = models.Session(user_id=u.id, session_uuid=f"fest-{u.id}", started_at=datetime.now(timezone.utc),
                       auswertung_fest=True, auswertung_fest_notiz="Test")
    db.add(s); db.flush()
    ar = models.AnalysisResult(session_id=s.id, algo_version="gps-mvp-3", num_runs=5)
    db.add(ar); db.commit()
    r = run_analysis(db, s)
    assert r.id == ar.id and r.num_runs == 5 and r.algo_version == "gps-mvp-3"     # nichts neu gerechnet
    db.close()
