"""Hintergrund-Reanalyse der EIGENEN Sessions eines Nutzers (z. B. nach Umstellen der
Erkennungs-Empfindlichkeit). Läuft in einem Daemon-Thread mit eigener DB-Session, damit der
HTTP-Request sofort zurückkommt und der Server nicht blockiert.

Fortschritt in der DB (Tabelle `reanalysis_progress`) → jeder uvicorn-Worker kann ihn lesen/
schreiben (der Job läuft im Prozess, der den PUT bekam; die Fortschritts-GET kann jeder Worker
beantworten). Pro User läuft max. EIN Job. Schwere Rechenarbeit (numpy/FFT) gibt das GIL frei.
"""
from __future__ import annotations

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


def fortsetzen_faellig(row, prozess_start: datetime) -> bool:
    """Hat ein Neustart diesen Lauf abgebrochen? `running`, aber zuletzt VOR dem Start dieses
    Prozesses fortgeschrieben — dann lief er im alten Prozess und ist mit ihm gestorben.

    Anlass (12.10.2026, Jan: „das es abgebrochene automatisch wieder aufnimmt … ist natuerlich ein
    bug, bitte fixen"): Jans Lauf hing seit 10.10. 14:24 bei 906/986, weil ein Server-Neustart den
    Daemon-Thread beendet hatte; `running` blieb fuer immer True, die App zeigte dauerhaft „Re-
    analyzing your sessions", und 80 Sessions waren nie auf das neue Preset gerechnet. Bewusst
    OHNE Zeitfenster (anders als bei den Final-Analysen in nach_neustart.py): der Nutzer hat die
    Rechnung selbst angestossen, sie spaet fertig zu machen ist immer richtig. Reine Entscheidung,
    getestet in tests/test_nach_neustart.py."""
    if row is None or not getattr(row, "running", False):
        return False
    stand = getattr(row, "updated_at", None)
    if stand is None:
        return True
    if stand.tzinfo is None:
        stand = stand.replace(tzinfo=timezone.utc)
    return stand < prozess_start


def start_reanalysis(user_id: int, preset: str, ab: int = 0, fortsetzen: bool = False) -> None:
    """Startet (falls nicht schon laufend) die Reanalyse der Sessions dieses Users für `preset`.
    `ab` = so viele Sessions (nach ID sortiert) gelten schon als erledigt — beim Fortsetzen nach
    einem Neustart der alte Stand von `done`. `fortsetzen` uebergeht die Sperre „laeuft schon":
    der Lauf, der dort steht, ist mit dem alten Prozess gestorben (s. `fortsetzen_faellig`)."""
    db = SessionLocal()
    try:
        row = db.get(models.ReanalysisProgress, user_id)
        if row is not None and row.running and not fortsetzen:
            return  # läuft schon
        if row is None:
            row = models.ReanalysisProgress(user_id=user_id)
            db.add(row)
        row.running = True
        row.done = ab
        if not ab:
            row.total = 0
        row.updated_at = _now()
        db.commit()
    finally:
        db.close()
    threading.Thread(target=_worker, args=(user_id, preset, ab), daemon=True).start()


def _set(db, user_id: int, **fields) -> None:
    fields["updated_at"] = _now()
    db.query(models.ReanalysisProgress).filter_by(user_id=user_id).update(fields)
    db.commit()


def _worker(user_id: int, preset: str, ab: int = 0) -> None:
    db = SessionLocal()
    try:
        ids = [s.id for s in db.query(models.Session)
               .filter(models.Session.user_id == user_id)
               .order_by(models.Session.id).all()]
        _set(db, user_id, total=len(ids))
        done = min(ab, len(ids))
        for sid in ids[done:]:
            s = db.get(models.Session, sid)
            if s is not None:
                # Kanonische Spalten auf das (neue) Preset des Nutzers umschreiben — run_analysis
                # liest die aktuelle foil_sensitivity und persistiert entsprechend. Jede Session
                # neu rechnen (nicht per Cache überspringen), damit auch die Spalten aktuell sind.
                try:
                    run_analysis(db, s)
                    # Spot nachziehen: eine Reanalyse kann aus "keine Laeufe" ein echtes Foilen
                    # machen — dann fehlt der Spot, und die Session erscheint auf der Karte als
                    # zweiter Marker mit demselben Namen. Genau dieser Fehler wurde am 24.08. in
                    # den anderen Analyse-Pfaden behoben, hier aber vergessen (belegt 31.08. an
                    # drei Sessions: Illmensee, zweimal Gošići).
                    from .api.sessions import _spot_nachziehen
                    _spot_nachziehen(db, s)
                    db.commit()
                except Exception:  # noqa: BLE001 — einzelne Session-Fehler nicht den Job kippen
                    db.rollback()
            done += 1
            _set(db, user_id, done=done)   # update-by-query (robust gegen expired ORM-Objekt)
    finally:
        _set(db, user_id, running=False)
        db.close()
