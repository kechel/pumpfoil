"""„Uhrzeit verbergen": andere sehen von einer Session nur den TAG, nicht die Uhrzeit.

Wunsch eines Nutzers (u146, 11.11.2026), Konzept vom Assistentenkonto, Jan 16./17.11.2026: „beides bauen", Standard =
Uhrzeit sichtbar (in der Oberflaeche als Einwilligung „Uhrzeit anzeigen", gespeichert als Opt-out `hide_time`).

Das Risiko sind Gewohnheiten („immer dienstags um 18 Uhr dort"); die verschwinden schon mit dem Tag. Woche oder Monat
wuerden Bestenlisten und Events zerstoeren, die nach Datum werten.

WIE: Wie „Ort verbergen" nur am AUSGANG, gespeichert bleibt die echte Zeit (Erkennung, Spot-Zuordnung, Statistik, Events
rechnen weiter mit ihr). Anders als beim Ort sieht der BESITZER seine echte Zeit — eine verborgene eigene Uhrzeit waere
fuer ihn wertlos, und der Schutz richtet sich nur gegen andere. Admins sehen in der Oberflaeche dasselbe wie alle anderen
(einfach und ohne Sonderweg; die echte Zeit steht fuer den Support in der Datenbank).

NICHT abgedeckt (bewusst, Jan 17.11.: nur die Uhrzeit): Freunde mit „Live" sehen weiter, dass man gerade faehrt; ein
Event mit kurzem Zeitfenster verraet grob die Zeit; Wetter/Wind je Lauf faellt fuer andere weg.

ALTE APPS: ein fehlendes `started_at` wuerden sie nicht verkraften. Deshalb wird die Session auf 12:00 Ortszeit ihres
Tages GESCHOBEN (Ende mit, die Dauer bleibt) und `zeit_verborgen=True` mitgeschickt; neue Oberflaechen zeigen dann nur
das Datum, alte zeigen „12:00" — der Tag stimmt in jeder Zeitzone bis ±11 h. Mittag statt Mitternacht, weil eine
Mitternacht in einer anderen Zeitzone auf den Vortag kippen wuerde.
"""
from __future__ import annotations

import json
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo


def profil_verbirgt(user) -> bool:
    """`hide_time` aus den Einstellungen des Besitzers (fehlt = nein, wie `settings.DEFAULTS`)."""
    if user is None:
        return False
    try:
        return bool((json.loads(user.settings_json) if user.settings_json else {}).get("hide_time", False))
    except (ValueError, TypeError):
        return False


def gilt(besitzer, betrachter_id) -> bool:
    """Ist die Uhrzeit fuer DIESEN Betrachter zu verbergen? Nie fuer den Besitzer selbst."""
    if besitzer is None or not profil_verbirgt(besitzer):
        return False
    return betrachter_id is None or betrachter_id != getattr(besitzer, "id", None)


def verschiebung(start: datetime | None, tz: str | None) -> timedelta:
    """Wie weit eine Session zu verschieben ist, damit sie um 12:00 Ortszeit ihres Tages beginnt (0 ohne Start)."""
    if start is None:
        return timedelta(0)
    try:
        zone = ZoneInfo(tz or "UTC")
    except Exception:  # noqa: BLE001 — unbekannte Zone: UTC reicht fuer den Tag
        zone = ZoneInfo("UTC")
    lokal = start.astimezone(zone) if start.tzinfo else start.replace(tzinfo=ZoneInfo("UTC")).astimezone(zone)
    mittag = datetime.combine(lokal.date(), time(12, 0), tzinfo=zone)
    return mittag - lokal


def schieben(wert: datetime | None, delta: timedelta) -> datetime | None:
    return None if wert is None else wert + delta


# --- Ergebniszeilen (Feed, Rekorde, Bestenlisten) -----------------------------------------------------------------------

_CACHE: dict[str, object] = {"zeit": 0.0, "ids": frozenset()}


def nutzer_ids(db) -> frozenset:
    """Alle Nutzer mit `hide_time` (60 s gecacht, wie `community._verbergende_nutzer`)."""
    import time as _t
    from . import models
    jetzt = _t.time()
    if jetzt - float(_CACHE["zeit"]) < 60:
        return _CACHE["ids"]
    ids = set()
    for uid, roh in db.query(models.User.id, models.User.settings_json).filter(
            models.User.settings_json.ilike("%hide_time%")).all():
        try:
            if json.loads(roh or "{}").get("hide_time"):
                ids.add(uid)
        except ValueError:
            continue
    _CACHE.update({"zeit": jetzt, "ids": frozenset(ids)})
    return _CACHE["ids"]


def cache_leeren() -> None:
    _CACHE.update({"zeit": 0.0, "ids": frozenset()})


def _iso(x) -> datetime | None:
    if x is None:
        return None
    if isinstance(x, datetime):
        return x
    try:
        return datetime.fromisoformat(str(x))
    except ValueError:
        return None


def eintrag_anwenden(e: dict, tz: str | None = None, start_key: str = "started_at", ende_key: str = "ended_at") -> dict:
    """Eine Ausgabezeile auf 12:00 Ortszeit ihres Tages schieben (Ende mit) und `zeit_verborgen` setzen."""
    st = _iso(e.get(start_key))
    if st is None:
        return e
    d = verschiebung(st, tz or e.get("tz"))
    e[start_key] = (st + d).isoformat() if not isinstance(e.get(start_key), datetime) else st + d
    en = _iso(e.get(ende_key))
    if en is not None:
        e[ende_key] = (en + d).isoformat() if not isinstance(e.get(ende_key), datetime) else en + d
    e["zeit_verborgen"] = True
    return e


def liste_anwenden(db, eintraege, betrachter_id, uid_key: str = "user_id", **kw):
    """Fuer jede Zeile eines fremden Besitzers mit `hide_time` die Uhrzeit verbergen (rekursiv nicht — flache Liste)."""
    ids = nutzer_ids(db)
    if not ids:
        return eintraege
    for e in eintraege or []:
        if isinstance(e, dict) and e.get(uid_key) in ids and e.get(uid_key) != betrachter_id:
            eintrag_anwenden(e, **kw)
    return eintraege


def sortier_start(spalte_start, spalte_user, ids):
    """SQL-Ausdruck fuer die Reihenfolge: bei verbergenden Nutzern der Tag (Mittag), sonst die echte Startzeit — sonst
    verraete die Reihenfolge innerhalb eines Tages die Uhrzeit (Zusage im Konzept an u146)."""
    from sqlalchemy import case, func, literal_column
    if not ids:
        return spalte_start
    return case((spalte_user.in_(list(ids)),
                 func.date_trunc("day", spalte_start) + literal_column("interval '12 hours'")),
                else_=spalte_start)


def baum_anwenden(db, obj, betrachter_id, _ids=None, alle: bool = False):
    """Rekursiv durch eine Antwort (dict/list): jede Zeile mit `started_at` und einem fremden `user_id` mit `hide_time`
    wird verschoben. Fuer verschachtelte Antworten (Rekorde je Zeitraum, Foiler-Seite, Bestenlisten)."""
    ids = nutzer_ids(db) if _ids is None else _ids
    if not ids:
        return obj
    if isinstance(obj, dict):
        uid = obj.get("user_id")
        # `alle`: Antworten ueber EINEN fremden Nutzer (Foiler-Seite), deren Zeilen keine user_id tragen.
        if "started_at" in obj and not obj.get("zeit_verborgen") and (alle or (uid in ids and uid != betrachter_id)):
            eintrag_anwenden(obj)
        for v in obj.values():
            if isinstance(v, (dict, list)):
                baum_anwenden(db, v, betrachter_id, ids, alle)
    elif isinstance(obj, list):
        for v in obj:
            if isinstance(v, (dict, list)):
                baum_anwenden(db, v, betrachter_id, ids, alle)
    return obj


def antwort(fn):
    """Decorator fuer Endpunkte mit verschachtelten Zeilen (Rekorde, Fotos, Bestenlisten): wendet `baum_anwenden` auf eine
    KOPIE der Antwort an (Rekorde kommen teils aus Caches, die auch der Besitzer liest). Betrachter aus `user`/`_user`."""
    import copy
    import functools

    @functools.wraps(fn)
    def w(*a, **kw):
        out = fn(*a, **kw)
        db = kw.get("db")
        u = kw.get("user") if kw.get("user") is not None else kw.get("_user")
        if db is None or not nutzer_ids(db):
            return out
        return baum_anwenden(db, copy.deepcopy(out), getattr(u, "id", None))
    return w
