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
from datetime import datetime, timezone

import numpy as np

VERSION = 7   # 7: Strecke = 1/2 Uhr-Tempo + 1/2 geglaettete Positionen, NUR Sessions ab STICHTAG_V7 (18.11.2026)
# 6: Obergrenze je Sportart — kein Fenster mit Uhr-Tempo ueber der Lauf-Spitze (Motor im Lauf), 17.11.2026
# 5: Fenster je Lauf und Kennzahl (`laeufe_fenster`, Session-ms) fuer die Session-Anzeige, Werte unveraendert (16.11.2026)
# 4: Regel je Fenster statt 80 % Uhr-Tempo je Lauf, Tempo-Luecken <= 3 s gefuellt, Sprung-Regel (16.11.2026)
# 3: dazu Lage des besten Fensters je Kennzahl (`fenster`, Session-ms), Werte unveraendert (11.11.2026)
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
# Sprung-Regel (16.11.2026, Jans OK): Uhren, die Tempo zwischen ~25 und ~50 km/h hin- und herspringen lassen, bestehen
# Anteil und Positionsprobe trotzdem. Ein Punkt „springt", wenn sein Uhr-Tempo ueber SPRUNG_HOCH x oder unter SPRUNG_TIEF x
# dem lokalen Median (SPRUNG_N echte Punkte) liegt. Gemessen am Bestand (16.11., 5036 Sessions): ±30 % zum Median traf das
# normale Schwanken im Pumptakt (-80 Werte bei 100 m), Faktor 1,6 von Punkt zu Punkt ebenso (-103); diese Fassung aendert
# kaum etwas (100 m: +7/-4, im Flying-Sprint-Fenster 2 Werte um <= 0,5 km/h). Faelle, in denen die HAELFTE der Punkte
# springt (Session A, Altbestand), faengt sie nicht — der Median wandert mit; dafuer das Referee Board. (Fall 2026-11-16-g)
SPRUNG_HOCH = 1.5
SPRUNG_TIEF = 0.5
SPRUNG_N = 9
SPRUNG_ANTEIL = 0.10

# --- VERSION 7 (Jans OK 18.11.2026, Messung docs/TODO.md C2, scripts/sprint-genauigkeit/, Nerd-Artikel) ---------------
# Strecke je Schritt = MISCHUNG_W x Uhr-Tempo-Strecke + (1 - MISCHUNG_W) x Strecke der Positionen, jede Position gemittelt
# mit ihren Nachbarn in +-GLATT_HALB_S (nie ueber eine Luecke, am Abschnittsrand symmetrisch verkuerzt). Alle Regeln
# (TOLERANZ gegen die ROHEN Positionen, Luecken, Spruenge, Obergrenze) bleiben wie in VERSION 6.
# NIE RUECKWIRKEND (Jan 18.11.2026): gilt nur fuer Sessions, die ab STICHTAG_V7 (UTC, Session-Start) begonnen haben.
# Aeltere Sessions rechnen IMMER mit VERSION 6 — auch bei Reanalyse, Nachrechnen, Events. Den Stichtag nie verschieben;
# eine neue Fassung bekommt eine eigene VERSION mit eigenem Stichtag. Neue Varianten auf Altdaten nur als Trockenlauf.
STICHTAG_V7 = datetime(2026, 11, 18, 7, 0, tzinfo=timezone.utc)
MISCHUNG_W = 0.5
GLATT_HALB_S = 2.5


def version_fuer(started_at: datetime | None) -> int:
    """Sprint-Fassung einer Session nach ihrem Start (UTC). Ohne Startzeit: die alte Fassung (nie versehentlich neu)."""
    if started_at is None:
        return 6
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=timezone.utc)
    return 7 if started_at >= STICHTAG_V7 else 6


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


def _fenster_misch(t: np.ndarray, cm: np.ndarray, cd: np.ndarray, cp: np.ndarray, luecken: np.ndarray, *,
                   strecke: float | None = None, dauer: float | None = None,
                   echt: np.ndarray | None = None, sprung: np.ndarray | None = None) -> tuple[float, float, float] | None:
    """VERSION 7: wie `_fenster`, aber das Fenster wird auf der Mischstrecke `cm` gemessen (Strecke erreicht bzw. Strecke
    in der Dauer). Die Pruefungen bleiben am selben Fenster: Doppler- (`cd`) gegen ROHE Positionsstrecke (`cp`)."""
    n = t.size
    if n < 3:
        return None
    i = np.arange(n)
    if strecke is not None:
        ziel = cm + strecke
        j = np.searchsorted(cm, ziel, side="left")
        ok = j < n
        i, j = i[ok], j[ok]
        if not i.size:
            return None
        f = (ziel[i] - cm[j - 1]) / np.maximum(cm[j] - cm[j - 1], 1e-9)
        dt = t[j - 1] + f * (t[j] - t[j - 1]) - t[i]
        dm = np.full(i.size, float(strecke))
    else:
        ziel = t + dauer
        j = np.searchsorted(t, ziel, side="left")
        ok = (j < n) & (j > i)
        i, j = i[ok], j[ok]
        if not i.size:
            return None
        f = (ziel[i] - t[j - 1]) / np.maximum(t[j] - t[j - 1], 1e-9)
        dt = np.full(i.size, float(dauer))
        dm = cm[j - 1] + f * (cm[j] - cm[j - 1]) - cm[i]
    dd = cd[j - 1] + f * (cd[j] - cd[j - 1]) - cd[i]
    dp = cp[j - 1] + f * (cp[j] - cp[j - 1]) - cp[i]
    gut = (luecken[j] == luecken[i]) & (dt > 0) & (dd > 0) & (dm > 0)
    gut &= np.abs(dp - dd) <= TOLERANZ * dd
    if echt is not None:
        ce = np.concatenate([[0], np.cumsum(echt)])
        gut &= (ce[j + 1] - ce[i]) >= FENSTER_TEMPO_ANTEIL * ((j + 1) - i)
    if sprung is not None:
        cs = np.concatenate([[0], np.cumsum(sprung)])
        gut &= (cs[j + 1] - cs[i]) <= SPRUNG_ANTEIL * ((j + 1) - i)
    if not gut.any():
        return None
    v = dm[gut] / dt[gut]
    k = int(np.argmax(v))
    return float(v[k]), float(t[i[gut][k]]), float(t[i[gut][k]] + dt[gut][k])


def _glatt_strecke(t: np.ndarray, lat: np.ndarray, lon: np.ndarray, luecke: np.ndarray, halb: float) -> np.ndarray:
    """VERSION 7: kumulierte Strecke der geglaetteten Positionen (m). Jede Position = Mittel der Punkte in +-`halb` s
    desselben Abschnitts (Abschnitt = zwischen zwei Bruechen); am Abschnittsrand wird das Fenster auf beiden Seiten
    gleich verkuerzt, sonst rutschen die Randpunkte nach innen und kurze Laeufe verlieren Strecke."""
    la0 = np.radians(lat[0])
    x = np.radians(lon - lon[0]) * 6371000.0 * np.cos(la0)
    y = np.radians(lat - lat[0]) * 6371000.0
    xs, ys = x.copy(), y.copy()
    anf: dict = {}
    end: dict = {}
    for k, g in enumerate(luecke):
        anf.setdefault(int(g), t[k])
        end[int(g)] = t[k]
    for k in range(t.size):
        g = int(luecke[k])
        h = min(halb, t[k] - anf[g], end[g] - t[k])
        a = np.searchsorted(t, t[k] - h - 1e-6, side="left")
        b = np.searchsorted(t, t[k] + h + 1e-6, side="right")
        sel = luecke[a:b] == g
        xs[k], ys[k] = x[a:b][sel].mean(), y[a:b][sel].mean()
    return np.hypot(np.diff(xs), np.diff(ys))


def _springt(v: np.ndarray, echt: np.ndarray) -> np.ndarray:
    """True je Punkt mit echtem Uhr-Tempo ausserhalb [SPRUNG_TIEF, SPRUNG_HOCH] x Median seiner SPRUNG_N Nachbarn (nur echte)."""
    out = np.zeros(v.size, dtype=bool)
    h = SPRUNG_N // 2
    for k in np.flatnonzero(echt):
        nb = v[max(0, k - h):k + h + 1][echt[max(0, k - h):k + h + 1]]
        if nb.size >= 3:
            med = float(np.median(nb))
            out[k] = med > 0 and (v[k] > SPRUNG_HOCH * med or v[k] < SPRUNG_TIEF * med)
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
                 je_fenster: bool = True, max_mps: float | None = None, version: int = 6) -> dict[str, float] | None:
    """Beste Fenster eines Laufs [a_ms, b_ms] (Session-ms) -> {kennzahl: m/s}; None ohne brauchbares Uhr-Tempo.
    `fenster` (optional): bekommt je Kennzahl [Start-ms, Ende-ms] des besten Fensters (Session-ms, fuer die Anzeige).
    `max_mps` (VERSION 6, 17.11.2026): Lauf-Spitze der Sportart (gps.grenzen_fuer). Kein Fenster darf einen Punkt mit
    Uhr-Tempo darueber enthalten. Befund: 18 Sessions mit Sprint ueber Vmax, z. B. ein GPS-only-Import, dessen Lauf am Ende
    30 s Motorfahrt mit 16 m/s mitnahm (Doppler UND Positionen einig, die Positionsprobe griff also nicht). Die Lauf-
    Grenze prueft das bereinigte Tempo, in dem solche Passagen schon geglaettet sind — hier zaehlt das Uhr-Tempo.
    `version` 7 = Mischstrecke (nur mit je_fenster; Aufrufer waehlt per `version_fuer(session.started_at)`), sonst 6."""
    from .detect_v2 import _clean_speed
    pkt = [p for p in gps if a_ms <= float(p[0]) <= b_ms and p[1] is not None and p[2] is not None]
    if len(pkt) < 5:
        return None
    roh = [p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and not isinstance(p[3], bool) else None for p in pkt]
    n_echt = sum(1 for v in roh if v is not None and v > 0)
    if n_echt == 0 or (not je_fenster and n_echt < MIN_TEMPO_ANTEIL * len(pkt)):
        return None                                         # gar kein Uhr-Tempo: keine Doppler-Messung
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
        sprung = _springt(np.where(echt, v, 0.0), echt)
        v, schlecht = _tempo_luecken_fuellen(t, np.where(echt, v, 0.0), echt)
        v = np.nan_to_num(_clean_speed(v, 1), nan=0.0)
        # Lange Tempo-Luecke wie eine Zeit-Luecke: kein Fenster darf sie enthalten.
        bruch = (dt > LUECKE_S) | schlecht[1:] | schlecht[:-1]
        if max_mps is not None:
            # Am BEREINIGTEN Tempo (nach _clean_speed), anhaltende Motorfahrt bleibt drin, Einzelwerte nicht.
            # Wie die Lauf-Grenze (_gate_implausible_runs: max_speed_mps aus dem 3-s-Median) — ein einzelner Punkt kippt
            # nichts (zweite Messung: ein 34,9-km/h-Punkt nahm einem 25-km/h-Lauf alle Fenster).
            from .gps import _running_median
            zu_schnell = _running_median(v, 3) > max_mps
            bruch = bruch | zu_schnell[1:] | zu_schnell[:-1]
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
    if version >= 7 and je_fenster:
        sg = np.where(bruch, 0.0, _glatt_strecke(t, lat, lon, luecke, GLATT_HALB_S))
        cm = MISCHUNG_W * cd + (1 - MISCHUNG_W) * np.concatenate([[0.0], np.cumsum(sg)])
        for kz, w in ([(f"sprint_{m}m", _fenster_misch(t, cm, cd, cp, luecke, strecke=float(m), echt=e, sprung=sp))
                       for m in STRECKEN_M]
                      + [(f"sprint_{s}s", _fenster_misch(t, cm, cd, cp, luecke, dauer=float(s), echt=e, sprung=sp))
                         for s in DAUERN_S]):
            if w is not None:
                out[kz] = round(w[0], 3)
                if fenster is not None:
                    fenster[kz] = [round(w[1] * 1000), round(w[2] * 1000)]
        return out
    for kz, w in ([(f"sprint_{m}m", _fenster(t, cd, cp, luecke, strecke=float(m), echt=e, sprung=sp)) for m in STRECKEN_M]
                  + [(f"sprint_{s}s", _fenster(t, cd, cp, luecke, dauer=float(s), echt=e, sprung=sp)) for s in DAUERN_S]):
        if w is not None:
            out[kz] = round(w[0], 3)
            if fenster is not None:
                fenster[kz] = [round(w[1] * 1000), round(w[2] * 1000)]
    return out


def session_sprints(gps: list, segmente: list, trim_start_ms: int = 0, je_fenster: bool = True,
                    max_mps: float | None = None, version: int = 6) -> dict:
    """Je Kennzahl das beste Fenster der Session und je Lauf alle Werte.

    -> {"v": 6 oder 7 (version), "best": {kennzahl: m/s}, "lauf": {kennzahl: Laufindex}, "fenster": {kennzahl: [Start-ms, Ende-ms]},
        "laeufe": [{…} | None je Lauf]}   (Fenster in Session-ms, wie `t_start_session_ms` der Laeufe)"""
    best: dict[str, float] = {}
    lauf: dict[str, int] = {}
    fenster: dict[str, list] = {}
    laeufe: list = []
    laeufe_fenster: list = []
    for k, g in enumerate(segmente or []):
        a = g.get("t_start_session_ms")
        b = g.get("t_end_session_ms")
        if a is None or b is None:
            if g.get("t_start_ms") is None or g.get("t_end_ms") is None:
                laeufe.append(None)
                laeufe_fenster.append(None)
                continue
            a, b = float(g["t_start_ms"]) + trim_start_ms, float(g["t_end_ms"]) + trim_start_ms
        fl: dict = {}
        w = lauf_sprints(gps, float(a), float(b), fl, je_fenster=je_fenster, max_mps=max_mps, version=version)
        laeufe.append(w)
        laeufe_fenster.append(fl or None)
        for kz, x in (w or {}).items():
            if x > best.get(kz, 0.0):
                best[kz], lauf[kz], fenster[kz] = x, k, fl[kz]
    return {"v": 7 if version >= 7 else 6, "best": best, "lauf": lauf, "fenster": fenster, "laeufe": laeufe,
            "laeufe_fenster": laeufe_fenster}


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
    from .gps import grenzen_fuer
    erg = session_sprints(storage.load_gps(session.session_uuid, roh=True) if segmente else [], segmente,
                          int(session.trim_start_ms or 0),
                          max_mps=grenzen_fuer(getattr(session, "sport_class", None))[1] / 3.6,
                          version=version_fuer(getattr(session, "started_at", None)))
    for kz in KENNZAHLEN:
        setattr(result, kz + "_mps", erg["best"].get(kz, 0.0))
    result.sprint_json = json.dumps(erg, separators=(",", ":"))
    return True


def kmh(mps: float | None) -> float | None:
    return None if mps is None or not math.isfinite(mps) else round(mps * 3.6, 1)
