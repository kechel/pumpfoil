"""Session-ms → Uhrzeit. Eine Quelle für alle Clients.

**Das Problem.** Die Sample-Zeitachse einer Aufnahme laeuft in AKTIVER Zeit: der Garmin-Recorder
zieht die Pausendauer ab (`SessionRecorder._elapsedMs`), damit GPS und Accel lueckenlos bleiben
und `index = t·hz` wirklich gilt (s. `docs/DATA-PIPELINE.md`). Wer daraus eine Uhrzeit macht,
darf die Pausen also nicht ignorieren — genau das taten alle drei Clients. Gemeldet am
10.09.2026: eine Session von 08:20 bis 10:00 mit 44 min Pause zeigte ihren letzten Lauf um
09:08. Dazu kam ein zweiter Fehler in derselben Zeile: `segments_json.t_start_ms` ist auf den
TRIM re-based, `started_at + t_start_ms` liess den Zuschnitt also unter den Tisch fallen (bei der
gemeldeten Session 4:23).

**Die Lösung.** Drei Begriffe, sauber getrennt:

- `t_start_ms` je Segment — auf den Trim re-based, taugt NUR fuer Diagramme innerhalb des
  Zuschnitts.
- Session-ms — Sample-Achse ab `started_at`, aktive Zeit. `t_start_session_ms` (v2) oder
  `t_start_ms + trim_start_ms`.
- Wanduhr-ms — Session-ms plus die Pausen, die davor lagen. Das und nur das ergibt mit
  `started_at` eine Uhrzeit. Steht je Segment als `t_start_clock_ms` in der API.

Sessions ohne bekannte Pausen (alle vor der Uhr-Version, die sie mitschickt, und alle anderen
Plattformen — nur Garmin kann pausieren) verhalten sich wie vorher, nur eben mit korrektem Trim.
"""
from __future__ import annotations

import json


def pausen(session) -> list[tuple[int, int]]:
    """Pausenfenster einer Session als [(t_session_ms, dauer_ms), …], nach Startzeit sortiert.
    Defensiv: kaputtes JSON darf keine Anzeige kosten -> dann eben keine Pausen."""
    roh = getattr(session, "pause_windows", None)
    if not roh:
        return []
    try:
        daten = json.loads(roh) or []
    except (ValueError, TypeError):
        return []
    out: list[tuple[int, int]] = []
    for item in daten:
        try:
            t, d = int(item[0]), int(item[1])
        except (ValueError, TypeError, IndexError, KeyError):
            continue
        if d > 0 and t >= 0:
            out.append((t, d))
    out.sort()
    return out


def versatz_ms(pausenliste: list[tuple[int, int]], t_session_ms: int) -> int:
    """Summe der Pausen, die VOR `t_session_ms` begonnen haben — der Versatz zur Wanduhr.
    Eine Pause genau bei `t` zaehlt mit: die Achse steht dort, die Uhr laeuft weiter."""
    return sum(d for t, d in pausenliste if t <= t_session_ms)


def wanduhr_ms(pausenliste: list[tuple[int, int]], t_session_ms: int) -> int:
    """Session-ms → ms ab `started_at` in Wanduhr-Zeit."""
    return int(t_session_ms) + versatz_ms(pausenliste, int(t_session_ms))


def gesamt_pause_ms(session) -> int:
    """Gesamte Pausendauer — fuer `ended_at` (Wanduhr-Ende einer pausierten Aufnahme)."""
    return sum(d for _, d in pausen(session))


def session_ms(segment: dict, trim_start_ms: int | None) -> int | None:
    """Session-ms eines Segments. `t_start_session_ms` ist die Wahrheit (Erkennung v2 legt es ab);
    fehlt es (v1/alte Ergebnisse), wird der Trim-Rebase zurueckgerechnet."""
    v = segment.get("t_start_session_ms")
    if isinstance(v, (int, float)):
        return int(v)
    v = segment.get("t_start_ms")
    if isinstance(v, (int, float)):
        return int(v) + int(trim_start_ms or 0)
    return None


def _ende_session_ms(segment: dict, trim_start_ms: int | None) -> int | None:
    v = segment.get("t_end_session_ms")
    if isinstance(v, (int, float)):
        return int(v)
    v = segment.get("t_end_ms")
    if isinstance(v, (int, float)):
        return int(v) + int(trim_start_ms or 0)
    return None


def segmente_mit_uhrzeit(session, segmente: list[dict] | None) -> list[dict] | None:
    """Jedem Lauf `t_start_clock_ms`/`t_end_clock_ms` mitgeben (ms ab `started_at`, Wanduhr).
    Damit braucht kein Client die Rechnung selbst — er formatiert nur noch. Kopiert die Dicts,
    damit nichts in den gecachten Analyse-Objekten landet."""
    if not segmente:
        return segmente
    pl = pausen(session)
    trim = getattr(session, "trim_start_ms", None)
    out = []
    for seg in segmente:
        if not isinstance(seg, dict):
            out.append(seg)
            continue
        neu = dict(seg)
        a = session_ms(seg, trim)
        b = _ende_session_ms(seg, trim)
        if a is not None:
            neu["t_start_clock_ms"] = wanduhr_ms(pl, a)
        if b is not None:
            neu["t_end_clock_ms"] = wanduhr_ms(pl, b)
        out.append(neu)
    return out
