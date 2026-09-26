"""Nach einem Server-NEUSTART die Auswertungen nachholen, die der Neustart abgebrochen hat.

WARUM (26.09.2026, #10117, Jan: „10117 ist aber ein genereller fehler der auch echte user betreffen
kann! serverseitig vernuenftig loesen bitte"): die finale Analyse laeuft nach `/complete` im
SERVERPROZESS (`BackgroundTasks`). Ein Neustart bricht sie ab — im Journal steht dann „Cancel 1
running task(s), timeout graceful shutdown exceeded" — und die Session bleibt auf `complete`: in der
Liste „wird verarbeitet", ohne Benachrichtigung, aus der Community ausgeblendet. Die Uhr hat ihre
Kopie da schon geloescht. Bisher holte das nur `foil-haenger.timer` nach, alle drei Stunden.

WAS HIER PASSIERT: kurz nach dem Start sucht EIN Worker (Postgres-Advisory-Sperre; es laufen vier)
nach Sessions auf `complete`, die zuletzt VOR diesem Start angefasst wurden. Deren Auswertung kann
nur mit dem alten Prozess gestorben sein — ein neuer Upload laege nach dem Start. Die werden mit
`_analyze_in_background` nachgeholt, also genau wie nach einem gelungenen `/complete` (finale
Analyse, Auto-Zuschnitt, Ort/Spot, die einmalige Benachrichtigung).

Zeitlich begrenzt auf `FENSTER_H`: was aelter ist, war schon vor dem letzten Neustart haengen, das
ist Sache des Timers (und dort ist die verspaetete Benachrichtigung schon abgewogen). Doppelt
rechnen ist harmlos — `run_analysis` reserviert die Ergebniszeile atomar (seit 15.09.2026).
"""
from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timedelta, timezone

log = logging.getLogger("app.nach_neustart")

# Warten, bis alle Worker oben sind und die Datenbank-Verbindungen stehen.
WARTEN_S = 45
# Nur, was in diesem Fenster vor dem Start zuletzt angefasst wurde.
FENSTER_H = 24
# Feste Kennung der Advisory-Sperre (beliebig, nur eindeutig im Projekt).
SPERRE = 7_302_937_117


def nach_neustart_faellig(s, prozess_start: datetime) -> bool:
    """Ist diese Session eine, deren Auswertung der letzte Neustart abgebrochen hat?

    `complete`, nicht geloescht, zuletzt angefasst VOR dem Start dieses Prozesses und nicht
    aelter als `FENSTER_H`. Reine Entscheidung, pruefbar (tests/test_nach_neustart.py).
    """
    if getattr(s, "deleted", False) or getattr(s, "status", None) != "complete":
        return False
    stand = getattr(s, "updated_at", None) or getattr(s, "created_at", None)
    if stand is None:
        return False
    if stand.tzinfo is None:
        stand = stand.replace(tzinfo=timezone.utc)
    return prozess_start - timedelta(hours=FENSTER_H) <= stand < prozess_start


def _lauf(prozess_start: datetime) -> None:
    time.sleep(WARTEN_S)
    from sqlalchemy import text

    from . import models, storage
    from .api.ingest import _analyze_in_background
    from .db import SessionLocal

    db = SessionLocal()
    try:
        # Genau EIN Worker: die Sperre haelt, solange diese Verbindung lebt.
        if not db.execute(text("select pg_try_advisory_lock(:k)"), {"k": SPERRE}).scalar():
            return
        grenze = prozess_start - timedelta(hours=FENSTER_H)
        offen = (db.query(models.Session)
                 .filter(models.Session.status == "complete",
                         models.Session.deleted.is_(False),
                         models.Session.updated_at >= grenze)
                 .order_by(models.Session.id).all())
        faellig = []
        for s in offen:
            if not nach_neustart_faellig(s, prozess_start):
                continue
            # Ohne GPS-Rohdaten NIE rechnen — dieselbe Sperre wie im Aufraeum-Skript.
            d = storage.session_dir(s.session_uuid) / "gps"
            if d.is_dir() and any(d.iterdir()):
                faellig.append(s.id)
        if faellig:
            log.info("Nach dem Neustart %d abgebrochene Auswertung(en) nachholen: %s",
                     len(faellig), ", ".join(f"#{i}" for i in faellig))
        for sid in faellig:
            try:
                _analyze_in_background(sid, True)
            except Exception:   # eine kaputte Session darf die anderen nicht aufhalten
                log.exception("Nachholen von #%s fehlgeschlagen", sid)
        db.execute(text("select pg_advisory_unlock(:k)"), {"k": SPERRE})
    except Exception:
        log.exception("Nachholen nach dem Neustart fehlgeschlagen")
    finally:
        db.close()


def starten() -> None:
    """Aus dem Start der App aufrufen; laeuft im Hintergrund und blockiert den Start nicht."""
    import os
    if os.environ.get("PYTEST_CURRENT_TEST"):   # nicht in den Tests: dort gibt es keinen Neustart
        return
    prozess_start = datetime.now(timezone.utc)
    threading.Thread(target=_lauf, args=(prozess_start,), daemon=True,
                     name="nach-neustart").start()
