"""Fortschritt eines Konto-Imports mitschreiben — damit die Oberflaeche „x von y" zeigen kann.

Hintergrund bei `models.SyncProgress`. Kurz: der Sync laeuft synchron und kann bei einem langsamen
Anbieter Minuten dauern; bisher blieb dem Nutzer nur ein deaktivierter Knopf. Der Uhr-Upload zeigt
seit immer „x von y" — das Gleiche gehoert hierher.

Bewusst grobkoernig: `start(gesamt)`, `schritt()` je erledigtem Training, `ende()`. Jeder Aufruf
committet fuer sich, damit ein anderer Arbeitsprozess den Stand sofort lesen kann. Das ist ein
paar Schreibvorgaenge mehr, aber ein Sync verarbeitet hoechstens einige Dutzend Trainings.

Fehler hier duerfen einen Import NIE scheitern lassen — deshalb schluckt jede Funktion alles.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models

log = logging.getLogger(__name__)

# Nach dieser Zeit gilt ein Fortschritt als verwaist (Prozess gestorben, Server neu gestartet).
# Sonst zeigte die Oberflaeche fuer immer „laeuft…".
VERFALL_S = 900


def _zeile(db: Session, user_id: int, provider: str) -> models.SyncProgress:
    p = (db.query(models.SyncProgress)
         .filter_by(user_id=user_id, provider=provider).first())
    if p is None:
        p = models.SyncProgress(user_id=user_id, provider=provider)
        db.add(p)
    return p


def start(db: Session, user_id: int, provider: str, gesamt: int, schritt: str = "") -> None:
    try:
        p = _zeile(db, user_id, provider)
        p.laeuft, p.gesamt, p.fertig, p.schritt = True, int(gesamt or 0), 0, (schritt or None)
        p.gestartet_am, p.beendet_am = datetime.now(timezone.utc), None
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def schritt(db: Session, user_id: int, provider: str, dazu: int = 1,
            text: str | None = None) -> None:
    try:
        p = _zeile(db, user_id, provider)
        p.fertig = (p.fertig or 0) + dazu
        if text is not None:
            p.schritt = text
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def gesamt_setzen(db: Session, user_id: int, provider: str, gesamt: int) -> None:
    """Nachtragen, wenn die Gesamtzahl erst nach dem Start bekannt ist (Polar: die Transaktion
    verraet die Zahl der Trainings erst im zweiten Aufruf)."""
    try:
        p = _zeile(db, user_id, provider)
        p.gesamt = int(gesamt or 0)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def ende(db: Session, user_id: int, provider: str) -> None:
    try:
        p = _zeile(db, user_id, provider)
        p.laeuft = False
        p.beendet_am = datetime.now(timezone.utc)
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def ergebnis_setzen(db: Session, user_id: int, provider: str, text: str,
                    daten: dict | None = None) -> None:
    import json as _json
    try:
        p = _zeile(db, user_id, provider)
        p.ergebnis = (text or "")[:300]
        p.ergebnis_json = _json.dumps(daten) if daten is not None else None
        db.commit()
    except Exception:  # noqa: BLE001
        db.rollback()


def im_hintergrund(provider: str, user_id: int, arbeit) -> None:
    """`arbeit(db, user)` ausfuehren, Fortschritt und Ergebnis mitschreiben.

    Warum ueberhaupt im Hintergrund (07.09.2026): der Sync lief synchron im Aufruf. Bei Polar
    hat das den Apache-Proxy in den Timeout laufen lassen — der Nutzer bekam nach Minuten einen
    „502 Proxy Error" ins Gesicht, obwohl der Import serverseitig weiterlief und sogar erfolgreich
    war. Der Aufruf antwortet jetzt sofort, die Oberflaeche fragt den Stand ab.
    """
    from .db import SessionLocal

    db = SessionLocal()
    try:
        nutzer = db.get(models.User, user_id)
        if nutzer is None:
            return
        try:
            erg = arbeit(db, nutzer) or {}
            teile = [f"{k}: {v}" for k, v in erg.items()
                     if isinstance(v, (int, str)) and v not in (0, "", None)]
            ergebnis_setzen(db, user_id, provider, ", ".join(teile) or "nichts Neues", erg)
        except Exception as exc:  # noqa: BLE001
            log.warning("sync %s fuer user %s gescheitert: %s", provider, user_id, exc)
            ergebnis_setzen(db, user_id, provider, f"{type(exc).__name__}: {exc}")
    finally:
        ende(db, user_id, provider)
        db.close()


def stand(db: Session, user_id: int, provider: str) -> dict:
    """Fuer die Oberflaeche. Ein zu alter Eintrag gilt als beendet — sonst haengt die Anzeige
    nach einem Serverneustart fuer immer auf „laeuft…"."""
    p = (db.query(models.SyncProgress)
         .filter_by(user_id=user_id, provider=provider).first())
    if p is None:
        return {"laeuft": False, "gesamt": 0, "fertig": 0, "schritt": None,
                "ergebnis": None, "daten": None}
    laeuft = bool(p.laeuft)
    if laeuft and p.gestartet_am is not None:
        seit = p.gestartet_am
        if seit.tzinfo is None:
            seit = seit.replace(tzinfo=timezone.utc)
        if (datetime.now(timezone.utc) - seit).total_seconds() > VERFALL_S:
            laeuft = False
    import json as _json
    daten = None
    if p.ergebnis_json:
        try:
            daten = _json.loads(p.ergebnis_json)
        except ValueError:
            daten = None
    return {"laeuft": laeuft, "gesamt": p.gesamt or 0, "fertig": p.fertig or 0,
            "schritt": p.schritt, "ergebnis": p.ergebnis, "daten": daten}
