"""Spaete Chunks an einer schon abgeschlossenen Session loesen eine neue (finale) Analyse aus.

Anlass 29.09.2026, #10266 (Apple Watch, 2 h 48 min): der Haenger-Lauf schloss die Aufnahme mit den
ersten Chunks ab, Stunden spaeter kamen 1009 weitere (fast die ganze Beschleunigung) — gespeichert,
aber nie ausgewertet, weil `_nachrechnen_faellig` nur `recording`/`live` kannte und die Uhr die
letzten 74 Chunks nie schickte (also kein `/complete`)."""
import uuid
from datetime import datetime, timedelta, timezone

from app import models
from app.api.ingest import RUHE_S, _nachrechnen_faellig
from app.db import SessionLocal


def _anlegen(db, status, analyse_vor_s, chunk_vor_s, erwartet=10, anzahl=3):
    jetzt = datetime.now(timezone.utc)
    u = models.User(email=f"spaet-{uuid.uuid4().hex[:10]}@test.de", password_hash="x")
    db.add(u); db.flush()
    s = models.Session(session_uuid=f"spaet-{u.id}", user_id=u.id, status=status,
                       expected_chunks=erwartet, started_at=jetzt - timedelta(hours=3),
                       updated_at=jetzt - timedelta(seconds=analyse_vor_s))
    db.add(s); db.flush()
    for i in range(anzahl):
        db.add(models.IngestChunk(session_id=s.id, kind="gps", index=i, sample_count=10,
                                  received_at=jetzt - timedelta(seconds=chunk_vor_s)))
    db.flush()
    return s


def test_analysierte_session_mit_spaeten_chunks_ist_faellig(client):
    db = SessionLocal()
    try:
        s = _anlegen(db, "analyzed", analyse_vor_s=3600, chunk_vor_s=RUHE_S + 60)
        assert _nachrechnen_faellig(db, s)
    finally:
        db.rollback(); db.close()


def test_analysierte_session_ohne_neue_chunks_bleibt(client):
    db = SessionLocal()
    try:
        s = _anlegen(db, "analyzed", analyse_vor_s=60, chunk_vor_s=3600)
        assert not _nachrechnen_faellig(db, s)
    finally:
        db.rollback(); db.close()


def test_spaete_chunks_warten_die_ruhezeit_ab(client):
    db = SessionLocal()
    try:
        s = _anlegen(db, "analyzed", analyse_vor_s=3600, chunk_vor_s=10)
        assert not _nachrechnen_faellig(db, s)            # Upload laeuft noch
        v = _anlegen(db, "analyzed", analyse_vor_s=3600, chunk_vor_s=10, erwartet=3, anzahl=3)
        assert _nachrechnen_faellig(db, v)                # vollstaendig -> nicht warten
    finally:
        db.rollback(); db.close()


def test_complete_bleibt_beim_haenger_lauf(client):
    db = SessionLocal()
    try:
        s = _anlegen(db, "complete", analyse_vor_s=3600, chunk_vor_s=RUHE_S + 60)
        assert not _nachrechnen_faellig(db, s)
    finally:
        db.rollback(); db.close()
