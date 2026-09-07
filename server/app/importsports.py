"""Sportart-Modi verknuepfter Konten: merken, was ein Nutzer uebertraegt — und was er will.

Der Hintergrund steht bei `models.ImportSportPref`. Kurz: eine feste Liste erlaubter Sportarten
wuerde genau die Leute aussieben, die einen ungewoehnlichen Modus benutzen (belegt: 8
Suunto-Sessions kamen als „cycling" und waren echtes Pumpfoilen). Also merken wir uns, was
tatsaechlich ankommt, und lassen den Nutzer abwaehlen. Voreinstellung ist IMMER importieren.

Alle drei Anbieter nutzen dieselbe Tabelle, unterscheiden sich aber darin, wie frueh sie die
Sportart verraten:
  * COROS  — in der Aktivitaetsliste (Code + Name + „Start Coordinates") -> wir wissen es VOR
             dem Download und sparen damit Kontingent (50 Dateien je Konto und Tag).
  * Suunto — `activityId` in der Workout-Liste, aber ohne Namen. Der Name wird aus der Datei
             gelernt, sobald die erste Aktivitaet dieses Typs importiert ist.
  * Polar  — die Transaktion nennt nur URLs; der Name kommt aus der TCX-Datei, also erst nach
             dem Download. Filtern hilft dort nur fuer die naechste Runde.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from . import models

log = logging.getLogger(__name__)


def merken(db: Session, user_id: int, provider: str, sport_key: str,
           label: str | None = None, hat_gps: bool | None = None,
           label_erzwingen: bool = False) -> models.ImportSportPref:
    """Modus festhalten. Neu -> `importieren = True` (Jan: „default aber true, also importieren
    bis der user etwas anderes sagt"). Bestehende Wahl wird NIE ueberschrieben."""
    key = str(sport_key)
    p = (db.query(models.ImportSportPref)
         .filter_by(user_id=user_id, provider=provider, sport_key=key).first())
    if p is None:
        p = models.ImportSportPref(user_id=user_id, provider=provider, sport_key=key,
                                   label=label, importieren=True, hat_gps=hat_gps, gesehen=0)
        db.add(p)
    if label and (label_erzwingen or not p.label):
        # `label_erzwingen` fuer Namen, die AUS DER DATEI kommen: bei Suunto und Polar kennen wir
        # den Modus zuerst nur als Zahl bzw. gar nicht, der lesbare Name faellt erst beim Import
        # ab. Der schlaegt dann den Platzhalter.
        p.label = label
    if hat_gps is not None and (p.hat_gps is None or hat_gps):
        p.hat_gps = hat_gps                 # einmal GPS gesehen bleibt GPS
    p.gesehen = (p.gesehen or 0) + 1
    p.zuletzt_am = datetime.now(timezone.utc)
    db.commit()
    return p


def erlaubt(db: Session, user_id: int, provider: str, sport_key: str | None) -> bool:
    """Darf dieser Modus importiert werden? Unbekannt oder ohne Schluessel -> ja."""
    if sport_key is None:
        return True
    p = (db.query(models.ImportSportPref)
         .filter_by(user_id=user_id, provider=provider, sport_key=str(sport_key)).first())
    return True if p is None else bool(p.importieren)


def liste(db: Session, user_id: int, provider: str) -> list[dict]:
    """Fuer die Oberflaeche: nur Modi, die dieser Nutzer selbst uebertraegt, und nur mit GPS
    (Jan, 07.09.: „nur die an die er auch selber verwendet, nicht 75" · „nur solche mit
    mindestens GPS"). `hat_gps IS NULL` bleibt drin — wir wissen es dann noch nicht und wollen
    die Zeile nicht vorschnell verstecken."""
    q = (db.query(models.ImportSportPref)
         .filter(models.ImportSportPref.user_id == user_id,
                 models.ImportSportPref.provider == provider,
                 models.ImportSportPref.hat_gps.isnot(False))
         .order_by(models.ImportSportPref.gesehen.desc()))
    return [{"sport_key": p.sport_key, "label": p.label or p.sport_key,
             "importieren": bool(p.importieren), "gesehen": p.gesehen or 0}
            for p in q.all()]


def setzen(db: Session, user_id: int, provider: str, wahl: dict[str, bool]) -> int:
    """Auswahl des Nutzers uebernehmen. Nur bekannte Schluessel — es wird nichts angelegt."""
    n = 0
    for key, an in (wahl or {}).items():
        p = (db.query(models.ImportSportPref)
             .filter_by(user_id=user_id, provider=provider, sport_key=str(key)).first())
        if p is None:
            continue
        p.importieren = bool(an)
        n += 1
    if n:
        db.commit()
    return n
