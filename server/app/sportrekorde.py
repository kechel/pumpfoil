"""Rekorde je Sportart (Jan, 20.10.2026: „die rekorde gerne alle einbauen, auch deine vorgeschlagenen … wie immer
community und per spot und je zeitfenster … und auch fuer einen selber im eigenen home und auf der eigenen
Profilseite, je sportart in einer eigenen zeile").

Die Werte stehen NICHT in der Datenbank, sondern in den Anzeige-Caches je Session, die heute entstanden sind:
  data/manoever/<id>.json      Wind: Wenden/Halsen, Hoehe/VMG, Fahrten   (sessions.manoever_gecacht)
  data/paddel/<id>.json        SUP: Paddle-up-Versuche                     (sessions.paddel_gecacht)
  data/welle_pumpen/<id>.json  Wake thief: Welle gegen gepumpt             (sessions.welle_pumpen_gecacht)
Downwind rechnet aus sport_zahlen (wenige Sessions). Gelesen wird die Datei ohne Schluesselpruefung: ein
veralteter Eintrag (nach Trim/Reanalyse) wird beim naechsten Ansehen der Session neu geschrieben.

Quoten zaehlen erst ab einer Mindestzahl, sonst gewinnt 1/1 = 100 %. Bei Gleichstand gewinnt die groessere
Anzahl (MEHR Halsen bei gleicher Quote), dann die fruehere Session.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Callable

from .config import get_settings

MIN_HALSEN = 20
MIN_WENDEN = 10
MIN_PADDLE_UP = 5
MIN_DOWNWIND_M = 2000.0


@dataclass(frozen=True)
class Metrik:
    key: str
    cache: str                                            # manoever | paddel | welle_pumpen | downwind
    wert: Callable[[dict], tuple[float, float] | None]    # (Wert, Gleichstand-Kriterium) oder None


def _quote(durch: int, n: int, minimum: int):
    return (durch / n, n) if n >= minimum else None


def _max(liste, feld):
    v = [x.get(feld) for x in liste or [] if x.get(feld) is not None]
    return (float(max(v)), 0.0) if v else None


def _z(e, typ):
    z = (e.get("zahlen") or {}).get(typ) or {}
    return int(z.get("durch") or 0), int(z.get("durch") or 0) + int(z.get("ab") or 0)


WIND = (
    Metrik("jibe_quote", "manoever", lambda e: _quote(*_z(e, "halse"), MIN_HALSEN)),
    Metrik("tack_quote", "manoever", lambda e: _quote(*_z(e, "wende"), MIN_WENDEN)),
    Metrik("vmg_best", "manoever", lambda e: ((e.get("hoehe") or {}).get("vmg_max_kmh") or None) and
           (float(e["hoehe"]["vmg_max_kmh"]), 0.0)),
    Metrik("upwind_m", "manoever", lambda e: ((e.get("hoehe") or {}).get("hoehe_m") or None) and
           (float(e["hoehe"]["hoehe_m"]), 0.0)),
    Metrik("jibes_foil", "manoever", lambda e: (_z(e, "halse")[0] or None) and (float(_z(e, "halse")[0]), 0.0)),
    Metrik("ride_longest", "manoever", lambda e: _max(e.get("fahrten"), "dauer_s")),
    Metrik("ride_farthest", "manoever", lambda e: _max(e.get("fahrten"), "strecke_m")),
)
SUP = (
    Metrik("paddle_success", "paddel", lambda e: (e.get("auf_foil") or None) and (float(e["auf_foil"]), 0.0)),
    Metrik("paddle_quote", "paddel", lambda e: _quote(int(e.get("auf_foil") or 0), len(e.get("versuche") or []),
                                                     MIN_PADDLE_UP)),
    Metrik("paddle_foil_longest", "paddel", lambda e: _max([v for v in e.get("versuche") or []
                                                            if v.get("ergebnis") == "foil"], "foil_s")),
)
WAKE = (
    Metrik("wake_longest", "welle_pumpen", lambda e: (e.get("laengste_welle_s") or None) and
           (float(e["laengste_welle_s"]), 0.0)),
    Metrik("wake_time", "welle_pumpen", lambda e: (e.get("welle_s") or None) and (float(e["welle_s"]), 0.0)),
)
DOWNWIND = (
    Metrik("dw_ab", "downwind", lambda e: _max(e.get("fahrten"), "ab_m")),
    Metrik("dw_ab_speed", "downwind", lambda e: _max([f for f in e.get("fahrten") or []
                                                      if (f.get("ab_m") or 0) >= MIN_DOWNWIND_M], "ab_kmh")),
)
JE_SPORT: dict[str, tuple[Metrik, ...]] = {
    "wingfoil": WIND, "kitefoil": WIND, "parawing": WIND,
    "sup_paddle": SUP, "wakethief": WAKE, "surf_downwind": DOWNWIND,
}

_cache: dict[str, tuple[float, dict | None]] = {}


def _lies(art: str, sid: int) -> dict | None:
    """Ergebnis aus data/<art>/<id>.json, im Prozess nach Datei-Zeitstempel gemerkt."""
    pfad = get_settings().data_dir / art / f"{sid}.json"
    try:
        mt = os.path.getmtime(pfad)
    except OSError:
        return None
    k = str(pfad)
    t = _cache.get(k)
    if t and t[0] == mt:
        return t[1]
    try:
        erg = (json.loads(pfad.read_text()) or {}).get("ergebnis")
    except (OSError, ValueError):
        erg = None
    _cache[k] = (mt, erg)
    return erg


def _downwind(db, sid: int) -> dict | None:
    from . import models
    from .api.sessions import _sport_zahlen
    s = db.get(models.Session, sid)
    res = s.result if s else None
    if res is None:
        return None
    try:
        return _sport_zahlen(s, res, json.loads(res.segments_json or "[]"), None)
    except (ValueError, TypeError):
        return None


def ergebnis(db, metrik: Metrik, sid: int, merk: dict) -> dict | None:
    k = (metrik.cache, sid)
    if k not in merk:
        merk[k] = _downwind(db, sid) if metrik.cache == "downwind" else _lies(metrik.cache, sid)
    return merk[k]


def bestes(db, metrik: Metrik, zeilen: list[tuple], merk: dict) -> tuple | None:
    """`zeilen`: (session_id, …) — liefert (Wert, Zeile) des besten Eintrags oder None."""
    best = None
    for z in zeilen:
        e = ergebnis(db, metrik, z[0], merk)
        if not e:
            continue
        try:
            w = metrik.wert(e)
        except (KeyError, TypeError, ValueError, ZeroDivisionError):
            w = None
        if not w or w[0] is None or w[0] <= 0:
            continue
        if best is None or (w[0], w[1]) > (best[0][0], best[0][1]):
            best = (w, z)
    return best


def persoenlich(db, user_id: int, cut=None) -> list[dict]:
    """Eigene Bestwerte je Sportart (eine Zeile je Sportart mit Daten): [{sport, rekorde: {key: {...}}}].
    Nur eigene, nicht geloeschte, nicht gemeldete, fertige Sessions mit Datenqualitaet ok."""
    from sqlalchemy import or_

    from . import models
    from .tzlookup import tz_name
    S = models.Session
    q = (db.query(S.id, S.started_at, S.place_name, S.place_lat, S.place_lon, S.sport_class)
         .filter(S.user_id == user_id, S.deleted.isnot(True), S.flagged.isnot(True),
                 S.status.notin_(("recording", "live")), S.sport_class.in_(list(JE_SPORT)),
                 or_(S.data_quality.is_(None), S.data_quality == "ok")))
    if cut is not None:
        q = q.filter(S.started_at >= cut)
    je: dict[str, list] = {}
    for z in q.all():
        je.setdefault(z[5], []).append(z)
    merk: dict = {}
    out = []
    for sport in JE_SPORT:
        zeilen = je.get(sport)
        if not zeilen:
            continue
        rek = {}
        for m in JE_SPORT[sport]:
            b = bestes(db, m, zeilen, merk)
            if b is None:
                continue
            (wert, _n), (sid, ts, place, lat, lon, _sp) = b
            rek[m.key] = {"session_id": sid, "value": round(float(wert), 3),
                          "started_at": ts.isoformat() if ts else None, "spot": place or None,
                          "tz": tz_name(lat, lon)}
        if rek:
            out.append({"sport": sport, "rekorde": rek})
    return out
