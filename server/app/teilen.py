"""Teilen-Links laufen nach GUELTIG ab (Jan, 29.10.2026).

Ein Teilen-Link umgeht die Anmeldung komplett. Geteilt wird meist fuer einen Moment (WhatsApp,
Forum), danach liegt der Link vergessen herum. Nach Ablauf wird er so entfernt, als haette der
Besitzer ihn selbst widerrufen; wer ihn weiter braucht, teilt neu.

Erledigt wird das beim naechsten Zugriff (oeffentlicher Abruf, Detailansicht des Besitzers, Liste
„Geteilte Aufnahmen", erneutes Teilen) — einen eigenen Zeitgeber braucht es dafuer nicht: ein
abgelaufener Link, den niemand mehr aufruft, schadet niemandem, und der erste Aufruf raeumt ihn ab.

Links von vor der Einfuehrung (`share_created_at` leer) zaehlen ab dem Einspielen (db.py setzt
den Zeitpunkt einmalig), damit nicht alle alten Links am ersten Tag auf einmal verschwinden.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session as DbSession

from . import models

GUELTIG = timedelta(days=28)

# Bewusst dauerhafte Links. Session 9535 ist Jans Beispiel auf der Nerd-Analysen-Seite
# (web/src/pages/NerdAnalysen4.tsx, BEISPIEL_TOKEN) — Absicht, darf nie ablaufen (Jan, 29.10.2026).
DAUERHAFT: frozenset[int] = frozenset({9535})


def gueltig_bis(s: models.Session) -> datetime | None:
    """Ablaufzeitpunkt des Links; `None` = kein Link oder dauerhaft."""
    if not s.share_token or s.id in DAUERHAFT:
        return None
    seit = s.share_created_at or datetime.now(timezone.utc)
    if seit.tzinfo is None:
        seit = seit.replace(tzinfo=timezone.utc)
    return seit + GUELTIG


def aufraeumen(db: DbSession, s: models.Session) -> bool:
    """Abgelaufenen Link entfernen wie einen Widerruf. True = war abgelaufen (jetzt weg)."""
    bis = gueltig_bis(s)
    if bis is None or bis > datetime.now(timezone.utc):
        return False
    s.share_token = None
    s.share_created_at = None
    db.commit()
    return True
