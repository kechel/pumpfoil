"""Event-Wertung je LAUF statt je Session (Entwurf docs/TEAMS.md „Entwurf: Wertung je Lauf", Jan 16.11.2026).

Welche Laeufe zaehlen fuer ein Event-Fenster [start, ende)?
1. Es zaehlt die STARTZEIT JEDES LAUFS: im Fenster begonnen -> zaehlt vollstaendig, egal wann er endet und wann die Session
   startet/endet. Vor dem Start oder ab dem Schluss begonnen -> zaehlt nicht.
2. Duplikate (derselbe Fahrer, zwei Aufnahmen derselben Fahrt: Start UND Ende je <= DUPLIKAT_S auseinander) zaehlen EINMAL.
   Jan: „das bessere bzw. kombinierte" — bis die Fusion mehrerer Aufnahmen steht, der Lauf aus der Aufnahme mit der
   besseren Datenlage (Accel-Erkennung vor GPS-only, dann hoehere Accel-Rate), nie der bessere Wert (kein Rosinenpicken).
3. (spaeter) nicht vom Referee ausgenommen.

Schalter `EVENT_JE_LAUF` (Env, Standard aus) — bis Jan nach der Gegenprobe freigibt. Eingefrorene Endstaende
(`ergebnis_json`) bleiben in jedem Fall unberuehrt.
"""
from __future__ import annotations

import json
import os
from datetime import datetime

DUPLIKAT_S = 10.0


def aktiv() -> bool:
    return (os.environ.get("EVENT_JE_LAUF") or "").strip().lower() in ("1", "true", "an", "on", "ja", "yes")


def _laeufe(started_at: datetime, segs_json) -> list[tuple[int, float, float, dict]]:
    """(Index, Start-Epoch-s, Ende-Epoch-s, Segment) je Lauf; Laufzeiten aus t_*_session_ms (ab Session-Start)."""
    try:
        segs = json.loads(segs_json or "[]") if isinstance(segs_json, str) else (segs_json or [])
    except ValueError:
        segs = []
    t0 = started_at.timestamp()
    out = []
    for k, g in enumerate(segs if isinstance(segs, list) else []):
        a = g.get("t_start_session_ms")
        b = g.get("t_end_session_ms")
        if a is None:
            a, b = g.get("t_start_ms"), g.get("t_end_ms")
        if a is None or b is None:
            continue
        out.append((k, t0 + float(a) / 1000.0, t0 + float(b) / 1000.0, g))
    return out


def zaehlende(sessions: list[dict], fenster: tuple[datetime, datetime], aus: frozenset | None = None) -> dict[int, list[int]]:
    """sessions: [{id, user_id, started_at, segments_json, detection, accel_hz}] -> {session_id: [zaehlende Laufindizes]}.
    `aus`: vom Referee veroeffentlichte Ausnahmen {(session_id, lauf_start_ms)} (app/referee.py)."""
    from .referee import ist_ausgenommen
    s0, s1 = fenster[0].timestamp(), fenster[1].timestamp()
    je_user: dict[int, list[tuple]] = {}
    for s in sessions:
        guete = (1 if (s.get("detection") or "") not in ("", "none", "gps_only") else 0, float(s.get("accel_hz") or 0),
                 -int(s["id"]))
        t0 = s["started_at"].timestamp()
        for k, a, b, _g in _laeufe(s["started_at"], s.get("segments_json")):
            if s0 <= a < s1 and not ist_ausgenommen(aus, s["id"], (a - t0) * 1000.0):
                je_user.setdefault(s["user_id"], []).append((a, b, s["id"], k, guete))
    out: dict[int, list[int]] = {}
    for laeufe in je_user.values():
        laeufe.sort()
        frei = [True] * len(laeufe)
        for i, (a, b, sid, k, g) in enumerate(laeufe):
            if not frei[i]:
                continue
            gruppe = [i]
            for j in range(i + 1, len(laeufe)):
                a2, b2, sid2, _k2, _g2 = laeufe[j]
                if a2 - a > DUPLIKAT_S:
                    break
                if frei[j] and sid2 != sid and abs(b2 - b) <= DUPLIKAT_S:
                    gruppe.append(j)
            sieger = max(gruppe, key=lambda x: laeufe[x][4])
            for x in gruppe:
                frei[x] = False
            out.setdefault(laeufe[sieger][2], []).append(laeufe[sieger][3])
    return out


def _pumps(g: dict, pg: bool) -> float:
    v = g.get("pg_pumps") if pg and g.get("pg_pumps") is not None else g.get("pumps")
    return float(v or 0)


def _glide(g: dict, pg: bool) -> float:
    v = g.get("pg_longest_glide_s") if pg and g.get("pg_longest_glide_s") is not None else g.get("longest_glide_s")
    return float(v or 0)


LAUF_WERT = {   # Bestwert je LAUF
    "distance": lambda g, pg: float(g.get("distance_m") or 0),
    "duration": lambda g, pg: float(g.get("duration_s") or 0),
    "speed": lambda g, pg: float(g.get("max_speed_mps") or 0),
    "glide": _glide,
}
SESSION_SUMME = {   # beste Session, Summe ihrer zaehlenden Laeufe
    "runs": lambda g, pg: 1.0,
    "session_distance": lambda g, pg: float(g.get("distance_m") or 0),
    "session_time": lambda g, pg: float(g.get("duration_s") or 0),
    "session_pumps": _pumps,
}
SUMME = {   # Summe ueber alle zaehlenden Laeufe aller Sessions
    "sum_runs": lambda g, pg: 1.0,
    "sum_pumps": _pumps,
    "sum_distance": lambda g, pg: float(g.get("distance_m") or 0),
    "sum_time": lambda g, pg: float(g.get("duration_s") or 0),
}


def werte(kennzahl: str, sessions: list[dict], zaehl: dict[int, list[int]], pg: bool) -> dict[int, dict]:
    """Je Fahrer der Wert der Kennzahl aus den zaehlenden Laeufen -> {user_id: {value, session_id?, run_idx?, started_at?}}."""
    out: dict[int, dict] = {}

    def besser(uid, v, s, k=None):
        alt = out.get(uid)
        neu = (v, -(s["started_at"].timestamp()), -int(s["id"]))
        if v > 0 and (alt is None or neu > alt["_key"]):
            out[uid] = {"value": v, "session_id": s["id"], "started_at": s["started_at"], "_key": neu,
                        **({"run_idx": k} if k is not None else {})}

    for s in sessions:
        idx = set(zaehl.get(s["id"]) or [])
        if not idx:
            continue
        laeufe = [(k, g) for k, _a, _b, g in _laeufe(s["started_at"], s.get("segments_json")) if k in idx]
        uid = s["user_id"]
        if kennzahl.startswith("sprint_"):
            try:
                je_lauf = (json.loads(s.get("sprint_json") or "{}").get("laeufe") or [])
            except ValueError:
                je_lauf = []
            for k, _g in laeufe:
                w = je_lauf[k] if k < len(je_lauf) and isinstance(je_lauf[k], dict) else {}
                besser(uid, float(w.get(kennzahl) or 0), s, k)
        elif kennzahl in LAUF_WERT:
            for k, g in laeufe:
                besser(uid, LAUF_WERT[kennzahl](g, pg), s, k)
        elif kennzahl in SESSION_SUMME:
            besser(uid, sum(SESSION_SUMME[kennzahl](g, pg) for _k, g in laeufe), s)
        elif kennzahl in SUMME or kennzahl in ("sum_sessions", "sum_spots"):
            e = out.setdefault(uid, {"value": 0.0, "_spots": set()})
            if kennzahl == "sum_sessions":
                e["value"] += 1
            elif kennzahl == "sum_spots":
                if s.get("spot_id") is not None:
                    e["_spots"].add(s["spot_id"])
                e["value"] = float(len(e["_spots"]))
            else:
                e["value"] += sum(SUMME[kennzahl](g, pg) for _k, g in laeufe)
    for e in out.values():
        e.pop("_key", None)
        e.pop("_spots", None)
    return {u: e for u, e in out.items() if e["value"] > 0}
