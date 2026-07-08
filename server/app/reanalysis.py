"""Hintergrund-Reanalyse der EIGENEN Sessions eines Nutzers (z. B. nach Umstellen der
Erkennungs-Empfindlichkeit). Läuft in einem Daemon-Thread mit eigener DB-Session, damit der
HTTP-Request sofort zurückkommt und der Server nicht blockiert.

Fortschritt in der DB (Tabelle `reanalysis_progress`) → jeder uvicorn-Worker kann ihn lesen/
schreiben (der Job läuft im Prozess, der den PUT bekam; die Fortschritts-GET kann jeder Worker
beantworten). Pro User läuft max. EIN Job. Schwere Rechenarbeit (numpy/FFT) gibt das GIL frei.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from .db import SessionLocal
from . import models
from .analysis import run_analysis


def _now() -> datetime:
    return datetime.now(timezone.utc)


def progress_for(db, user_id: int) -> dict:
    row = db.get(models.ReanalysisProgress, user_id)
    if row is None:
        return {"running": False, "done": 0, "total": 0}
    return {"running": bool(row.running), "done": int(row.done or 0), "total": int(row.total or 0)}


def start_reanalysis(user_id: int, preset: str) -> None:
    """Startet (falls nicht schon laufend) die Reanalyse der Sessions dieses Users für `preset`.
    Bereits für dieses Preset gecachte Sessions werden übersprungen (Umschalten ohne Neurechnung)."""
    db = SessionLocal()
    try:
        row = db.get(models.ReanalysisProgress, user_id)
        if row is not None and row.running:
            return  # läuft schon
        if row is None:
            row = models.ReanalysisProgress(user_id=user_id)
            db.add(row)
        row.running = True
        row.done = 0
        row.total = 0
        row.updated_at = _now()
        db.commit()
    finally:
        db.close()
    threading.Thread(target=_worker, args=(user_id, preset), daemon=True).start()


def _set(db, user_id: int, **fields) -> None:
    fields["updated_at"] = _now()
    db.query(models.ReanalysisProgress).filter_by(user_id=user_id).update(fields)
    db.commit()


def _worker(user_id: int, preset: str) -> None:
    db = SessionLocal()
    try:
        ids = [s.id for s in db.query(models.Session)
               .filter(models.Session.user_id == user_id)
               .order_by(models.Session.id).all()]
        _set(db, user_id, total=len(ids))
        done = 0
        for sid in ids:
            s = db.get(models.Session, sid)
            if s is not None:
                r = db.query(models.AnalysisResult).filter_by(session_id=sid).first()
                cached = False
                if r is not None and r.sensitivity_json:
                    try:
                        cached = preset in (json.loads(r.sensitivity_json) or {})
                    except ValueError:
                        cached = False
                if not cached:
                    try:
                        run_analysis(db, s)
                        db.commit()
                    except Exception:  # noqa: BLE001 — einzelne Session-Fehler nicht den Job kippen
                        db.rollback()
            done += 1
            _set(db, user_id, done=done)   # update-by-query (robust gegen expired ORM-Objekt)
    finally:
        _set(db, user_id, running=False)
        db.close()
