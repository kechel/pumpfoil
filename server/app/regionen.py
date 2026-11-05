"""Regions-Filter der Bestenlisten (Jan, 05.11.2026): nach der NATIONALITAET der Fahrer, nicht nach dem Spot — „im
wettkampfgeschehen zaehlt eher die nationalitaet, insbesondere weil die ja auch zu wettkampfspots fahren". Gezaehlt
werden also alle Sessions eines Fahrers, auch die im Ausland; wer keine Nationalitaet angegeben hat, steht nur in
„Global".

Werte: "all" (Global), ein Kontinent wie bei der Team-Herkunft ("k:eu" …) oder ein Laendercode ("PL"). Land ->
Kontinent kommt aus data/land_kontinent.json (scripts/land-kontinent-erzeugen.py, Natural Earth).

Wie die Ansicht „Freunde" haengt der Filter an der Anfrage (`?region=` an /api/community, gesetzt von der Middleware
in app/freunde.py) und greift in `community._community` — damit gilt er ohne weiteres Durchreichen fuer Rekorde,
Bestenlisten und alle Rekord-Arten.
"""
import contextvars
import json
import pathlib
import threading
import time

from sqlalchemy.orm import Session

from . import models

KONTINENT: dict[str, str] = json.loads(
    (pathlib.Path(__file__).parent / "data" / "land_kontinent.json").read_text(encoding="utf-8"))
KONTINENTE = ("k:eu", "k:af", "k:as", "k:na", "k:sa", "k:oc")

_REGION: contextvars.ContextVar[str] = contextvars.ContextVar("region", default="all")


def pruefen(r: str | None) -> str:
    """Unbekanntes wird zu "all" — eine falsche Angabe soll nie eine leere Liste liefern."""
    r = (r or "all").strip()
    if r in KONTINENTE:
        return r
    r = r.upper()
    return r if r in KONTINENT else "all"


def aktuell() -> str:
    return _REGION.get()


def setzen(r: str | None):
    return _REGION.set(pruefen(r))


def zuruecksetzen(token) -> None:
    _REGION.reset(token)


def passt(land: str | None, region: str) -> bool:
    """Liegt ein Land (Fahrer-Nationalitaet oder Team-Herkunft, auch "k:…") in der Region?"""
    if region == "all":
        return True
    if not land:
        return False
    if region.startswith("k:"):
        return land == region or KONTINENT.get(land) == region
    return land == region


# Nationalitaet steht im JSON der Einstellungen. Bei unter tausend Konten ist ein Durchgang billig (wenige ms);
# eine Minute Merker reicht, damit eine Seite mit vier Abfragen nur einmal liest.
_lock = threading.Lock()
_stand: tuple[float, dict[int, str]] | None = None
_TTL = 60.0


def laender(db: Session) -> dict[int, str]:
    """user_id -> Laendercode, nur gesetzte."""
    global _stand
    jetzt = time.monotonic()
    with _lock:
        if _stand and jetzt - _stand[0] < _TTL:
            return _stand[1]
    aus: dict[int, str] = {}
    for uid, sj in db.query(models.User.id, models.User.settings_json).all():
        try:
            land = (json.loads(sj) if sj else {}).get("land") or ""
        except (ValueError, TypeError):
            land = ""
        if land:
            aus[uid] = land.upper()
    with _lock:
        _stand = (jetzt, aus)
    return aus


def fahrer_ids(db: Session, region: str) -> set[int]:
    return {uid for uid, land in laender(db).items() if passt(land, region)}
