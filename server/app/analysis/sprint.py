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

VERSION = 3   # 3: dazu Lage des besten Fensters je Kennzahl (`fenster`, Session-ms), Werte unveraendert (11.11.2026)
# 2: nur Uhr-Tempo (roh), ohne aus Positionen aufgefuelltes (09.11.2026)
STRECKEN_M = (100, 200, 300)
DAUERN_S = (60,)
LUECKE_S = 3.0
TOLERANZ = 0.10          # relative Abweichung Positions- vs. Doppler-Strecke im Fenster; s. Messung in docs/TODO.md
MIN_TEMPO_ANTEIL = 0.8   # so viel des Laufs muss ein Uhr-Tempo tragen, sonst ist es keine Doppler-Messung
# Regel je FENSTER (Entwurf 16.11.2026, Jan 15.11.: „der ganze lauf interessiert nicht"): statt MIN_TEMPO_ANTEIL je Lauf
# zaehlt nur das Fenster. Fehlendes Uhr-Tempo bis TEMPO_LUECKE_S aus den Tempowerten davor/danach ueberbruecken (nicht aus
# Positionen), laenger -> Fenster ungueltig; im Fenster mind. FENSTER_TEMPO_ANTEIL der Punkte mit echtem Uhr-Tempo.
TEMPO_LUECKE_S = 3.0
FENSTER_TEMPO_ANTEIL = 2 / 3
# Sprung-Regel (16.11.2026, Jans OK): Uhren, die Tempo zwischen ~25 und ~50 km/h hin- und herspringen lassen (#1460),
# bestehen Anteil und Positionsprobe trotzdem. Ein Punkt „springt", wenn sein Uhr-Tempo zum Nachbarpunkt (<= 1,5 s
# daneben, beide echt) um mehr als den Faktor SPRUNG_FAKTOR abweicht — ein Foil aendert sein Tempo nicht in 1 s um 60 %.
# Nicht ±30 % zum Median: das traf das normale Schwanken im Pumptakt (Probe 16.11.: -80 Werte bei 100 m), und bei
# #1460 springt die Haelfte der Punkte, der Median wandert mit. Mehr als SPRUNG_ANTEIL springende Punkte -> ungueltig.
SPRUNG_FAKTOR = 1.6
SPRUNG_ANTEIL = 0.10

KENNZAHLEN = tuple(f"sprint_{m}m" for m in STRECKEN_M) + tuple(f"sprint_{s}s" for s in DAUERN_S)


def _strecke_pos(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    la, lo = np.radians(lat), np.radians(lon)
    h = np.sin(np.diff(la) / 2) ** 2 + np.cos(la[:-1]) * np.cos(la[1:]) * np.sin(np.diff(lo) / 2) ** 2
    d = 2 * 6371000.0 * np.arcsin(np.sqrt(np.clip(h, 0.0, 1.0)))
    return np.concatenate([[0.0], np.cumsum(d)])


def _fenster(t: np.ndarray, cd: np.ndarray, cp: np.ndarray, luecken: np.ndarray, *,
             strecke: float | None = None, dauer: float | None = None,
             echt: np.ndarray | None = None, sprung: np.ndarray | None = None) -> tuple[float, float, float] | None:
    """Bestes gueltiges Fenster ueber eine Strecke ODER eine Dauer -> (m/s, Start s, Ende s); None, wenn keines passt.
    Gleichstand: das fruehere Fenster (argmax).

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
    if echt is not None:                                    # Regel je Fenster: Anteil echter Uhr-Tempo-Punkte i..j
        ce = np.concatenate([[0], np.cumsum(echt)])
        anz = (j + 1) - i
        gut &= (ce[j + 1] - ce[i]) >= FENSTER_TEMPO_ANTEIL * anz
    if sprung is not None:
        cs = np.concatenate([[0], np.cumsum(sprung)])
        gut &= (cs[j + 1] - cs[i]) <= SPRUNG_ANTEIL * ((j + 1) - i)
    if not gut.any():
        return None
    v = dd[gut] / dt[gut]
    k = int(np.argmax(v))
    return float(v[k]), float(t[i[gut][k]]), float(t[i[gut][k]] + dt[gut][k])


def _springt(t: np.ndarray, v: np.ndarray, echt: np.ndarray) -> np.ndarray:
    """True je Punkt, dessen Uhr-Tempo zu einem echten Nachbarn (<= 1,5 s) um mehr als SPRUNG_FAKTOR abweicht."""
    out = np.zeros(v.size, dtype=bool)
    if v.size < 2:
        return out
    nah = (np.diff(t) <= 1.5) & echt[1:] & echt[:-1]
    q = np.where(nah, np.maximum(v[1:], 1e-6) / np.maximum(v[:-1], 1e-6), 1.0)
    weit = (q > SPRUNG_FAKTOR) | (q < 1 / SPRUNG_FAKTOR)
    out[1:] |= weit
    out[:-1] |= weit
    return out


def _tempo_luecken_fuellen(t: np.ndarray, v: np.ndarray, echt: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Fehlendes Uhr-Tempo (echt False) linear aus dem Tempo davor/danach fuellen, wenn die Luecke <= TEMPO_LUECKE_S
    dauert. Gibt (v, schlecht) zurueck: schlecht[k] = Punkt liegt in einer laengeren Luecke (oder am Rand ohne Nachbar)."""
    v = v.copy()
    schlecht = np.zeros(v.size, dtype=bool)
    k, n = 0, v.size
    while k < n:
        if echt[k]:
            k += 1
            continue
        a = k
        while k < n and not echt[k]:
            k += 1
        b = k                                               # [a, b) ohne Uhr-Tempo
        if a == 0 or b == n or (t[b] - t[a - 1]) > TEMPO_LUECKE_S + 1e-6:
            schlecht[a:b] = True
        else:
            v[a:b] = np.interp(t[a:b], [t[a - 1], t[b]], [v[a - 1], v[b]])
    return v, schlecht


def lauf_sprints(gps: list, a_ms: float, b_ms: float, fenster: dict | None = None,
                 je_fenster: bool = False) -> dict[str, float] | None:
    """Beste Fenster eines Laufs [a_ms, b_ms] (Session-ms) -> {kennzahl: m/s}; None ohne brauchbares Uhr-Tempo.
    `fenster` (optional): bekommt je Kennzahl [Start-ms, Ende-ms] des besten Fensters (Session-ms, fuer die Anzeige)."""
    from .detect_v2 import _clean_speed
    pkt = [p for p in gps if a_ms <= float(p[0]) <= b_ms and p[1] is not None and p[2] is not None]
    if len(pkt) < 5:
        return None
    roh = [p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and not isinstance(p[3], bool) else None for p in pkt]
    if not je_fenster and sum(1 for v in roh if v is not None and v > 0) < MIN_TEMPO_ANTEIL * len(pkt):
        return None
    t = np.array([float(p[0]) for p in pkt]) / 1000.0
    lat = np.array([float(p[1]) for p in pkt])
    lon = np.array([float(p[2]) for p in pkt])
    v = np.array([float(x) if x is not None else np.nan for x in roh])
    echt = np.isfinite(v) & (v > 0)
    dt = np.diff(t)
    if (dt <= 0).any():                                    # doppelte Zeitstempel: nach Zeit eindeutig machen
        _, k = np.unique(t, return_index=True)
        t, lat, lon, v, echt = t[k], lat[k], lon[k], v[k], echt[k]
        dt = np.diff(t)
    if je_fenster:
        sprung = _springt(t, np.where(echt, v, 0.0), echt)
        v, schlecht = _tempo_luecken_fuellen(t, np.where(echt, v, 0.0), echt)
        v = np.nan_to_num(_clean_speed(v, 1), nan=0.0)
        # Lange Tempo-Luecke wie eine Zeit-Luecke: kein Fenster darf sie enthalten.
        bruch = (dt > LUECKE_S) | schlecht[1:] | schlecht[:-1]
        luecke = np.concatenate([[0], np.cumsum(bruch)])
    else:
        v = np.nan_to_num(_clean_speed(np.where(np.isfinite(v), v, 0.0), 1), nan=0.0)
        bruch = dt > LUECKE_S
        luecke = np.concatenate([[0], np.cumsum(bruch)])
    # Ueber eine Luecke hinweg integriert der Doppler-Wert nichts Gemessenes — dort 0 Zuwachs, das Fenster
    # ist ohnehin ungueltig (luecken-Zaehler).
    seg = np.where(bruch, 0.0, (v[1:] + v[:-1]) / 2 * dt)
    cd = np.concatenate([[0.0], np.cumsum(seg)])
    cp = _strecke_pos(lat, lon)
    out: dict[str, float] = {}
    e, sp = (echt, sprung) if je_fenster else (None, None)
    for kz, w in ([(f"sprint_{m}m", _fenster(t, cd, cp, luecke, strecke=float(m), echt=e, sprung=sp)) for m in STRECKEN_M]
                  + [(f"sprint_{s}s", _fenster(t, cd, cp, luecke, dauer=float(s), echt=e, sprung=sp)) for s in DAUERN_S]):
        if w is not None:
            out[kz] = round(w[0], 3)
            if fenster is not None:
                fenster[kz] = [round(w[1] * 1000), round(w[2] * 1000)]
    return out


def session_sprints(gps: list, segmente: list, trim_start_ms: int = 0, je_fenster: bool = False) -> dict:
    """Je Kennzahl das beste Fenster der Session und je Lauf alle Werte.

    -> {"v": VERSION, "best": {kennzahl: m/s}, "lauf": {kennzahl: Laufindex}, "fenster": {kennzahl: [Start-ms, Ende-ms]},
        "laeufe": [{…} | None je Lauf]}   (Fenster in Session-ms, wie `t_start_session_ms` der Laeufe)"""
    best: dict[str, float] = {}
    lauf: dict[str, int] = {}
    fenster: dict[str, list] = {}
    laeufe: list = []
    for k, g in enumerate(segmente or []):
        a = g.get("t_start_session_ms")
        b = g.get("t_end_session_ms")
        if a is None or b is None:
            if g.get("t_start_ms") is None or g.get("t_end_ms") is None:
                laeufe.append(None)
                continue
            a, b = float(g["t_start_ms"]) + trim_start_ms, float(g["t_end_ms"]) + trim_start_ms
        fl: dict = {}
        w = lauf_sprints(gps, float(a), float(b), fl, je_fenster=je_fenster)
        laeufe.append(w)
        for kz, x in (w or {}).items():
            if x > best.get(kz, 0.0):
                best[kz], lauf[kz], fenster[kz] = x, k, fl[kz]
    return {"v": VERSION, "best": best, "lauf": lauf, "fenster": fenster, "laeufe": laeufe}


def setzen(session, result) -> bool:
    """Rechnet die Sprints einer analysierten Session und schreibt die Spalten. True, wenn etwas geschrieben wurde."""
    from .. import storage
    try:
        segmente = json.loads(result.segments_json or "[]")
    except ValueError:
        segmente = []
    if not isinstance(segmente, list):
        segmente = []
    # roh=True: NUR das Uhr-Tempo. Der Standard-Ladeweg fuellt fehlendes Tempo (0/-1) aus den Positionen auf
    # (storage.tempo_auffuellen) — das waere genau die Positionsstrecke, die hier nicht zaehlen soll, und hebelte
    # MIN_TEMPO_ANTEIL aus (Befund 09.11.2026: 36 von 2949 Sessions betroffen, 11 hatten nur dadurch einen Wert).
    erg = session_sprints(storage.load_gps(session.session_uuid, roh=True) if segmente else [], segmente,
                          int(session.trim_start_ms or 0))
    for kz in KENNZAHLEN:
        setattr(result, kz + "_mps", erg["best"].get(kz, 0.0))
    result.sprint_json = json.dumps(erg, separators=(",", ":"))
    return True


def kmh(mps: float | None) -> float | None:
    return None if mps is None or not math.isfinite(mps) else round(mps * 3.6, 1)
