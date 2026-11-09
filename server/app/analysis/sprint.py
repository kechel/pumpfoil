"""Fliegende Sprints je Lauf (09.11.2026, Jans OK am selben Tag): schnellste 100 / 200 / 300 m und schnellste Minute.

Idee aus dem Chat mit einem Team-Kapitaen (Event „schnellste fliegende Minute / 100 m"). „Fliegend" heisst: das
schnellste Fenster IRGENDWO in einem Lauf, nicht ab dem Start — gleitend ueber jeden Startpunkt, das Ende zwischen zwei
1-s-Punkten interpoliert. Gespeichert wird je Kennzahl das Durchschnittstempo (m/s) des besten Fensters; die Anzeige
macht daraus Zeit (Strecken) bzw. km/h (Minute). Hoeher ist besser, wie bei jeder Bestenliste.

MESSGROESSE: das Tempo der Uhr (Doppler vom GPS-Chip, Feld 4 im GPS-Feed), integriert ueber die Zeit — NICHT die
Strecke aus den Positionen. Gemessen am 09.11. an 7026 Laeufen (docs/TODO.md, „Schnellste 100 m …"): Positionen
liegen im Bestfenster systematisch hoeher, weil Rauschen den Weg zickzackig verlaengert und die Suche nach dem
besten Fenster genau das Rauschen findet — und das je Plattform verschieden stark (100 m: Garmin +0,5 km/h,
Apple Watch +1,5 km/h im Median). Mit Positionen waeren die Ranglisten zwischen Uhren unfair.

GEGENPROBE: die Positionen pruefen jedes Fenster. Weichen Doppler- und Positionsstrecke im Fenster um mehr als
`TOLERANZ` voneinander ab, zaehlt das Fenster nicht (GPS-Sprung, Tempo-Ausreisser, eingefrorenes Tempo). Ein Fenster
mit einer Luecke ueber `LUECKE_S` (Uhr unter Wasser) zaehlt ebenfalls nicht. Der Doppler-Wert laeuft vorher durch
dieselbe Burst-Bereinigung wie die Erkennung (`detect_v2._clean_speed`).

Kein Detektor-Parameter, keine bestehende Zahl aendert sich; die Laeufe kommen fertig aus `segments_json`.
Gecacht in `analysis_results.sprint_*` (NULL = noch nicht gerechnet, 0 = kein gueltiges Fenster)."""
from __future__ import annotations

import json
import math

import numpy as np

VERSION = 1
STRECKEN_M = (100, 200, 300)
DAUERN_S = (60,)
LUECKE_S = 3.0
TOLERANZ = 0.10          # relative Abweichung Positions- vs. Doppler-Strecke im Fenster; s. Messung in docs/TODO.md
MIN_TEMPO_ANTEIL = 0.8   # so viel des Laufs muss ein Uhr-Tempo tragen, sonst ist es keine Doppler-Messung

KENNZAHLEN = tuple(f"sprint_{m}m" for m in STRECKEN_M) + tuple(f"sprint_{s}s" for s in DAUERN_S)


def _strecke_pos(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la, lo = np.radians(lat), np.radians(lon)
    h = np.sin(np.diff(la) / 2) ** 2 + np.cos(la[:-1]) * np.cos(la[1:]) * np.sin(np.diff(lo) / 2) ** 2
    d = 2 * 6371000.0 * np.arcsin(np.sqrt(np.clip(h, 0.0, 1.0)))
    return np.concatenate([[0.0], np.cumsum(d)])


def _fenster(t: np.ndarray, cd: np.ndarray, cp: np.ndarray, luecken: np.ndarray, *,
             strecke: float | None = None, dauer: float | None = None) -> float | None:
    """Bestes gueltiges Fenster (m/s) ueber eine Strecke ODER eine Dauer; None, wenn keines passt.

    `cd`/`cp` = kumulierte Doppler- bzw. Positionsstrecke, `luecken[k]` = Anzahl Luecken bis Punkt k."""
    n = t.size
    if n < 3:
        return None
    i = np.arange(n)
    if strecke is not None:
        ziel = cd + strecke
        j = np.searchsorted(cd, ziel, side="left")          # erster Punkt, an dem die Strecke erreicht ist
        ok = j < n
        i, j = i[ok], j[ok]
        if not i.size:
            return None
        f = (ziel[i] - cd[j - 1]) / np.maximum(cd[j] - cd[j - 1], 1e-9)
        te = t[j - 1] + f * (t[j] - t[j - 1])
        dt = te - t[i]
        dd = np.full(i.size, float(strecke))
        dp = cp[j - 1] + f * (cp[j] - cp[j - 1]) - cp[i]
    else:
        ziel = t + dauer
        j = np.searchsorted(t, ziel, side="left")
        ok = (j < n) & (j > i)
        i, j = i[ok], j[ok]
        if not i.size:
            return None
        f = (ziel[i] - t[j - 1]) / np.maximum(t[j] - t[j - 1], 1e-9)
        dt = np.full(i.size, float(dauer))
        dd = cd[j - 1] + f * (cd[j] - cd[j - 1]) - cd[i]
        dp = cp[j - 1] + f * (cp[j] - cp[j - 1]) - cp[i]
    gut = (luecken[j] == luecken[i]) & (dt > 0) & (dd > 0)
    gut &= np.abs(dp - dd) <= TOLERANZ * dd
    if not gut.any():
        return None
    v = dd[gut] / dt[gut]
    return float(v.max())


def lauf_sprints(gps: list, a_ms: float, b_ms: float) -> dict[str, float] | None:
    """Beste Fenster eines Laufs [a_ms, b_ms] (Session-ms) -> {kennzahl: m/s}; None ohne brauchbares Uhr-Tempo."""
    from .detect_v2 import _clean_speed
    pkt = [p for p in gps if a_ms <= float(p[0]) <= b_ms and p[1] is not None and p[2] is not None]
    if len(pkt) < 5:
        return None
    roh = [p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and not isinstance(p[3], bool) else None for p in pkt]
    if sum(1 for v in roh if v is not None and v > 0) < MIN_TEMPO_ANTEIL * len(pkt):
        return None
    t = np.array([float(p[0]) for p in pkt]) / 1000.0
    lat = np.array([float(p[1]) for p in pkt])
    lon = np.array([float(p[2]) for p in pkt])
    v = np.array([float(x) if x is not None else np.nan for x in roh])
    v = np.nan_to_num(_clean_speed(np.where(np.isfinite(v), v, 0.0), 1), nan=0.0)
    dt = np.diff(t)
    if (dt <= 0).any():                                    # doppelte Zeitstempel: nach Zeit eindeutig machen
        _, k = np.unique(t, return_index=True)
        t, lat, lon, v = t[k], lat[k], lon[k], v[k]
        dt = np.diff(t)
    luecke = np.concatenate([[0], np.cumsum(dt > LUECKE_S)])
    # Ueber eine Luecke hinweg integriert der Doppler-Wert nichts Gemessenes — dort 0 Zuwachs, das Fenster
    # ist ohnehin ungueltig (luecken-Zaehler).
    seg = np.where(dt > LUECKE_S, 0.0, (v[1:] + v[:-1]) / 2 * dt)
    cd = np.concatenate([[0.0], np.cumsum(seg)])
    cp = _strecke_pos(lat, lon)
    out: dict[str, float] = {}
    for m in STRECKEN_M:
        w = _fenster(t, cd, cp, luecke, strecke=float(m))
        if w is not None:
            out[f"sprint_{m}m"] = round(w, 3)
    for s in DAUERN_S:
        w = _fenster(t, cd, cp, luecke, dauer=float(s))
        if w is not None:
            out[f"sprint_{s}s"] = round(w, 3)
    return out


def session_sprints(gps: list, segmente: list, trim_start_ms: int = 0) -> dict:
    """Je Kennzahl das beste Fenster der Session und je Lauf alle Werte.

    -> {"v": VERSION, "best": {kennzahl: m/s}, "lauf": {kennzahl: Laufindex}, "laeufe": [{…} | None je Lauf]}"""
    best: dict[str, float] = {}
    lauf: dict[str, int] = {}
    laeufe: list = []
    for k, g in enumerate(segmente or []):
        a = g.get("t_start_session_ms")
        b = g.get("t_end_session_ms")
        if a is None or b is None:
            if g.get("t_start_ms") is None or g.get("t_end_ms") is None:
                laeufe.append(None)
                continue
            a, b = float(g["t_start_ms"]) + trim_start_ms, float(g["t_end_ms"]) + trim_start_ms
        w = lauf_sprints(gps, float(a), float(b))
        laeufe.append(w)
        for kz, x in (w or {}).items():
            if x > best.get(kz, 0.0):
                best[kz], lauf[kz] = x, k
    return {"v": VERSION, "best": best, "lauf": lauf, "laeufe": laeufe}


def setzen(session, result) -> bool:
    """Rechnet die Sprints einer analysierten Session und schreibt die Spalten. True, wenn etwas geschrieben wurde."""
    from .. import storage
    try:
        segmente = json.loads(result.segments_json or "[]")
    except ValueError:
        segmente = []
    if not isinstance(segmente, list):
        segmente = []
    erg = session_sprints(storage.load_gps(session.session_uuid) if segmente else [], segmente,
                          int(session.trim_start_ms or 0))
    for kz in KENNZAHLEN:
        setattr(result, kz + "_mps", erg["best"].get(kz, 0.0))
    result.sprint_json = json.dumps(erg, separators=(",", ":"))
    return True


def kmh(mps: float | None) -> float | None:
    return None if mps is None or not math.isfinite(mps) else round(mps * 3.6, 1)
