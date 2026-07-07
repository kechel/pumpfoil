"""Hintergrund-Reanalyse der EIGENEN Sessions eines Nutzers (z. B. nach Umstellen der
Erkennungs-Empfindlichkeit). Läuft in einem Daemon-Thread mit eigener DB-Session, damit der
HTTP-Request sofort zurückkommt und der Server nicht blockiert. Fortschritt in-memory je User
(1 uvicorn-Worker -> reicht); ein GET-Endpoint gibt ihn für die Fortschrittsanzeige zurück.

Mehrere Nutzer gleichzeitig: je ein eigener Thread. Die schwere Rechenarbeit (numpy/FFT) gibt
das GIL frei, der Event-Loop bleibt für andere Requests reaktiv. Pro User läuft max. EIN Job.
"""
from __future__ import annotations

import threading

from .db import SessionLocal
from . import models
from .analysis import run_analysis

_progress: dict[int, dict] = {}
_lock = threading.Lock()


def progress_for(user_id: int) -> dict:
    with _lock:
        return dict(_progress.get(user_id, {"running": False, "done": 0, "total": 0}))


def start_reanalysis(user_id: int, preset: str) -> None:
    """Startet (falls nicht schon laufend) die Reanalyse der Sessions dieses Users für `preset`.
    Sessions, die dieses Preset schon im Cache haben, werden übersprungen (Umschalten ohne
    Neurechnung). `preset` == das gerade gesetzte User-Preset (run_analysis füllt genau dieses)."""
    with _lock:
        if _progress.get(user_id, {}).get("running"):
            return
        _progress[user_id] = {"running": True, "done": 0, "total": 0}
    threading.Thread(target=_worker, args=(user_id, preset), daemon=True).start()


def _worker(user_id: int, preset: str) -> None:
    import json
    db = SessionLocal()
    try:
        ids = [s.id for s in db.query(models.Session)
               .filter(models.Session.user_id == user_id)
               .order_by(models.Session.id).all()]
        with _lock:
            _progress[user_id]["total"] = len(ids)
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
                if not cached:   # nur rechnen, wenn dieses Preset noch nicht vorliegt
                    try:
                        run_analysis(db, s)
                        db.commit()
                    except Exception:  # noqa: BLE001 — einzelne Session-Fehler nicht den Job kippen
                        db.rollback()
            done += 1
            with _lock:
                _progress[user_id]["done"] = done
    finally:
        with _lock:
            if user_id in _progress:
                _progress[user_id]["running"] = False
        db.close()
