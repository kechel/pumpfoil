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


# Was aus KONTOVERKNUEPFUNGEN (Suunto, Polar, COROS, Strava) ueberhaupt eine Session wird (Jan, 22.10.2026):
# „aus Kontoverknuepfungen sollten wir generell keine Sessions importieren ohne GPS, das brauche ja nur ich fuer
# meine Tanz-Idee, und vielleicht sollten wir auch nichts importieren was aelter als 1.1.2026 ist, einfach generell".
# Anlass: am 21.10. durften Suunto-Workouts ohne GPS kurz Sessions werden (d08cf5b2) — der naechste Abgleich legte
# einem Nutzer 907 Yoga-/Dehn-/Meditations-Sessions bis zurueck 2019 an. Der manuelle FIT-Upload ist NICHT betroffen.
IMPORT_AB = datetime(2026, 1, 1, tzinfo=timezone.utc)


def zu_alt(started_at) -> bool:
    """Liegt der Start vor `IMPORT_AB`? Ohne Zeit -> nein (dann entscheidet der GPS-Test)."""
    if started_at is None:
        return False
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    return started_at < IMPORT_AB


def konto_import_grund(parsed: dict) -> str | None:
    """None = importieren. Sonst „kein gps" bzw. „zu alt" (interne Gruende wie bei Suunto)."""
    if not parsed.get("gps_samples") or parsed.get("started_at") is None:
        return "kein gps"
    if zu_alt(parsed.get("started_at")):
        return "zu alt"
    return None


def merken(db: Session, user_id: int, provider: str, sport_key: str,
           label: str | None = None, hat_gps: bool | None = None,
           label_erzwingen: bool = False, zaehlen: bool = True) -> models.ImportSportPref:
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
    # `zaehlen=False` fuer Nachtraege zum SELBEN Training: Polar und Suunto rufen zweimal auf
    # — einmal vor dem Download (Name, Auswahl pruefen) und einmal danach (jetzt ist bekannt,
    # ob es Ortung gab). Beide Male zu zaehlen hat aus einem Training zwei gemacht.
    if zaehlen:
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


# Modus -> Sportart je Anbieter (Suunto 19.10.2026, Polar + COROS am selben Tag nachgezogen —
# Jan: „bei polar und coros nutzen die ja einfach andere Aktivitaeten, da geht die Vorauswahl
# genauso nicht wie bei suunto"). Pumpfoil gibt es auf keiner Uhr als Modus; wer wingfoilt, nimmt
# irgendeinen. Der Nutzer sagt je Modus, was er dort faehrt. Leer = Standard-Sportart wie bisher.
ZUORDNUNG_ANBIETER = ("suunto", "polar", "coros")


def zuordnung_schluessel(provider: str) -> str:
    return f"{provider}_sport_je_modus"


def sport_fuer_modus(user, provider: str, sport_key) -> str | None:
    """Sportart, die der Nutzer diesem Modus zugeordnet hat (settings.<provider>_sport_je_modus),
    oder None (dann gilt die Standard-Sportart)."""
    import json as _json
    from .api.sessions import SPORTS
    if sport_key is None or provider not in ZUORDNUNG_ANBIETER:
        return None
    try:
        zu = (_json.loads(user.settings_json or "{}") or {}).get(zuordnung_schluessel(provider)) or {}
    except ValueError:
        return None
    sp = zu.get(str(sport_key)) if isinstance(zu, dict) else None
    return sp if sp in SPORTS else None


def zuordnung_bereinigen(roh, sports) -> dict:
    """Eingabe aus den Einstellungen: nur bekannte Sportarten, kurze Schluessel (Suunto/COROS
    sind Nummern, Polar Namen wie „OTHER_OUTDOOR")."""
    if not isinstance(roh, dict):
        return {}
    return {str(k)[:64]: v for k, v in list(roh.items())[:100] if str(k).strip() and v in sports}
