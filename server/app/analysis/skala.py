"""Beschleunigung fuer die Analyse auf ECHTES g bringen — beim Lesen, im Speicher, nie am Original (13.11.2026).

Befund (docs/TODO.md, Inbox 13.11. „Garmin Connect: Bilanz"; 5000 Sessions geprueft): gleiche Etiketten, verschiedene
Einheiten. Unsere Connect-IQ-App schickt milli-g (1000 je g, alle 62 Uhrenmodelle, 0.1-1.0.103), meldet aber
`accel_scale = 2048`. Apple, Wear OS, Handys, Zepp, FIT/Suunto/Polar/COROS: 2048 je g wie gemeldet. Huawei Ultimate 2
(Pruefkonto): 512. Garmin-Connect-Sessions tragen seit 13.11. 4194 (Zwischenloesung), ihre Daten sind 2048.

Jan: „nie das original aendern … oder das model macht das selber beim input on demand", „alles was neu in das model, auch
das bestehende, reinkommt, [bekommt] die identischen einheiten", „kann die funktion das auch selber erkennen, vielleicht
ist das ja auch innerhalb einer plattform je nach uhrenmodell … anders oder aendert sich mal bei kontoverknuepfungen
oder fit-uploads".

Darum je QUELLE (Weg + Plattform + Uhrenmodell, `quelle()`), nicht je Session: eine einzelne Session schaetzt die
Einheit nicht sicher (kraeftige Fahrer: Median 1,7 g; Sessions mit Werten nahe 0; Versatz in den Daten). Die Tabelle
`app/data/einheiten.json` (im Repo, keine Nutzerdaten) bestimmt `scripts/einheiten-bestimmen.py` aus ALLEN Sessions einer Quelle per Mehrheit.
Neue Quelle (neues Modell, neue Verknuepfung, anderer Knoten) ohne Tabelleneintrag: Schaetzung der Session, aber nur,
wenn zwei unabhaengige Schaetzer (Median des Betrags, Schwerkraft-Vektor aus 2-s-Fenstern) dieselbe Einheit sagen —
sonst bleibt die gemeldete. Weicht eine Session klar von ihrer Quelle ab, steht es im Log (Firmware/Plattform geaendert?).

SCHALTER `ACCEL_NORM` (Umgebung): leer/0 = aus (gemeldete Skala, Stand bis heute). 1 = an. Live erst mit Jans OK und
nur zusammen mit Modellen, die auf denselben Einheiten gelernt haben.
"""
from __future__ import annotations

import functools
import json
import logging
import math
import os
import pathlib

import numpy as np

VERSION = "skala-2"
log = logging.getLogger(__name__)

EINHEITEN = (2048.0, 1000.0, 512.0)     # bekannte Einheiten je g (int16-2048, milli-g, Huawei)
TOLERANZ = 0.25                          # |log(Schaetzung/Einheit)| darunter gilt als „passt" (~ ±28 %)
MIN_WERTE = 500
SICHER_WERTE = 3000      # ab so vielen Werten sticht eine einige Schaetzung die Quelle (kurze wilde Sessions irren)
TABELLE = pathlib.Path(__file__).resolve().parents[1] / "data" / "einheiten.json"   # im Repo: gleich auf allen Knoten
IMPORT_WEGE = ("garmin", "fit", "suunto", "polar", "coros", "imp", "strava", "merge", "split", "zepp", "hw")


def an() -> bool:
    return os.environ.get("ACCEL_NORM", "").strip() in ("1", "an", "true")


# --- Schaetzer je Session -----------------------------------------------------------------------------------------
def median_betrag(accel: np.ndarray) -> float | None:
    if accel is None or len(accel) < MIN_WERTE:
        return None
    a = np.asarray(accel[:: max(1, len(accel) // 20000)], dtype=np.float64)
    m = float(np.median(np.sqrt((a * a).sum(axis=1))))
    return m if m > 0 else None


def schwere(accel: np.ndarray, hz: float | None) -> float | None:
    """Betrag des mittleren Vektors in 2-s-Fenstern (Bewegung mittelt sich heraus, Schwerkraft bleibt), Median."""
    if accel is None or len(accel) < MIN_WERTE:
        return None
    w = max(5, int(round(2 * (hz or 25))))
    n = len(accel) // w
    if n < 10:
        return None
    b = np.asarray(accel[: n * w], dtype=np.float64).reshape(n, w, 3).mean(axis=1)
    return float(np.median(np.linalg.norm(b, axis=1)))


def naechste(v: float | None) -> float | None:
    if not v:
        return None
    e = min(EINHEITEN, key=lambda x: abs(math.log(v / x)))
    return e if abs(math.log(v / e)) <= TOLERANZ else None


def schaetzen(accel: np.ndarray, hz: float | None) -> float | None:
    """Einheit dieser Session, nur wenn beide Schaetzer uebereinstimmen; sonst None."""
    a, b = naechste(median_betrag(accel)), naechste(schwere(accel, hz))
    return a if a is not None and a == b else None


# --- Quelle + Tabelle ---------------------------------------------------------------------------------------------
def quelle_aus(uuid: str, plattform: str | None, modell: str | None) -> str:
    kopf = uuid.split("-", 1)[0] if uuid else ""
    weg = kopf if kopf in IMPORT_WEGE else "app"
    return f"{weg}|{plattform or '-'}|{(modell or '-').split(' · ')[0][:40]}"


@functools.lru_cache(maxsize=20000)
def quelle(uuid: str) -> str:
    """Quelle einer Session aus der DB (Weg, Plattform, Uhrenmodell). Ohne DB: nur der Weg."""
    try:
        from sqlalchemy import text
        from ..db import SessionLocal
        db = SessionLocal()
        try:
            r = db.execute(text(
                "select d.platform, coalesce(d.part_number, s.device_model), s.id, s.split_from from sessions s "
                "left join device_tokens d on d.id = s.device_id where s.session_uuid = :u"), {"u": uuid}).first()
            herkunft = []
            if r and uuid.startswith("merge-"):
                herkunft = [x[0] for x in db.execute(text(
                    "select session_uuid from sessions where merged_into = :i"), {"i": r[2]}).all()]
            elif r and uuid.startswith("split-") and r[3]:
                herkunft = [x[0] for x in db.execute(text(
                    "select session_uuid from sessions where id = :i"), {"i": r[3]}).all()]
        finally:
            db.close()
        q = quelle_aus(uuid, r[0] if r else None, r[1] if r else None)
        # Zusammengefuehrt/geteilt: die Einheit haengt an den TEILEN (unsere App oder Garmin-Connect-/FIT-Datei).
        # Alle Teile aus demselben Weg -> dieser Weg; gemischt -> bleibt merge/split (dann schaetzt die Session).
        wege = {quelle(h).split("|", 1)[0] for h in herkunft}
        if len(wege) == 1:
            q = f"{wege.pop()}|{q.split('|', 1)[1]}"
        return q
    except Exception:  # noqa: BLE001 — ohne DB (Tests, Offline) zaehlt nur der Weg
        return quelle_aus(uuid, None, None)


@functools.lru_cache(maxsize=1)
def tabelle() -> dict:
    try:
        return json.loads(TABELLE.read_text()).get("quellen", {})
    except (OSError, ValueError):
        return {}


def eintrag(q: str) -> dict | None:
    """Tabelleneintrag der Quelle, sonst Weg+Plattform, sonst Weg allein (wenn dort einig)."""
    weg, plattform, _ = q.split("|", 2)
    t = tabelle()
    return t.get(q) or t.get(f"{weg}|{plattform}|*") or t.get(f"{weg}|*|*")


def echte_skala(accel: np.ndarray, gemeldet, hz=None, uuid: str | None = None) -> float:
    gemeldet = float(gemeldet or 2048)
    geschaetzt = schaetzen(accel, hz)
    eintrag_ = eintrag(quelle(uuid)) if uuid else None
    sicher = geschaetzt is not None and accel is not None and len(accel) >= SICHER_WERTE
    if eintrag_:
        e = float(eintrag_["einheit"])
        if geschaetzt is not None and geschaetzt != e:
            # Eine SICHERE Schaetzung sticht die Quelle: so fielen Jans fruehe Sessions vom 08./09.07.2026 auf (Garmin-App
            # vor 1.0.51 ohne Versionsangabe: 2048 statt milli-g, #516/#518). Unsichere/kurze Sessions folgen der Quelle.
            log.warning("skala: %s schaetzt %.0f je g, Quelle %s sagt %.0f — %s", uuid, geschaetzt, quelle(uuid), e,
                        "Session gilt" if sicher else "Quelle gilt")
            return geschaetzt if sicher else e
        return e
    return geschaetzt if geschaetzt is not None else gemeldet


def fuer_analyse(accel: np.ndarray, gemeldet, hz=None, uuid: str | None = None):
    """Skala, mit der die Analyse rechnet: mit Schalter die echte, sonst die gemeldete (unveraendert wie bisher)."""
    if not an():
        return gemeldet
    return echte_skala(accel, gemeldet, hz, uuid)


def fuer_session(session, accel: np.ndarray):
    return fuer_analyse(accel, getattr(session, "accel_scale", None), getattr(session, "accel_hz", None),
                        getattr(session, "session_uuid", None))
