"""Startversuche „Ruhe -> schnell -> Ruhe oder GPS-Abriss" aus GPS und Beschleunigung (startversuche-1, 25.10.2026).

Anlass: u439 (Amazfit Active 2, Front-Start von der Kante: Board anschieben, aufknien, aufstehen), #12734 — ~22
Startversuche, angezeigt 0. Die alte Zaehlung (`attempt_distances`, attempts-Preset: Median ueber 3 Punkte, >= 2 s ueber
8 km/h) sieht von einem Start, der nach 1-3 s im Wasser endet, nichts mehr. Jan: „alle starts sind irgendwie
ruhe-schnell-ruhe oder ruhe-schnell-gps-abriss". Prototyp und Messung: scripts/frontstart/.

GRUNDLAGE BLEIBT DIE ALTE ZAEHLUNG, die neue kommt nur DAZU (`zaehlen`): Laeufe + alte Versuche + neue Versuche, die
nicht schon an einem davon liegen. Neu zaehlt nur, was ein ANLAUF in der Beschleunigung belegt. Erster Entwurf liess
auch „>= 2 GPS-Punkte ueber 8 km/h ohne Anlauf" zu — der Trockenlauf (25.10., 400 Sessions) zeigte, dass das in
verrauschten Spuren Zittern zaehlt (#18822 86 -> 142, #18879 17 -> 51, fast alles ohne Anlauf). Ohne Accel bleibt es
ganz bei der alten Zaehlung (`fuer_session` -> None).

Drei Wege zu einem neuen Versuch, alle mit Anlauf und „aus der Ruhe" (davor RUHE_S lang langsam):
  A  Anlauf + ein GPS-Rohpunkt >= SPRINT_KMH kurz danach.
  C  Anlauf + GPS-Spitze nur ANLAUF_KMH..SPRINT_KMH: der Anlauf ersetzt die km/h, die die 1-Hz-Spur verpasst.
  B  Anlauf, danach >= ABRISS_S kein GPS (Uhr unter Wasser), und zwar am Steg: <= STEG_M vom Median der A/C-Versuche
     dieser Session (braucht mind. STEG_MIN davon).
Anlauf = Ruhe -> 1,2-8 s Bewegung mit >= 3 Stoessen ueber 3 g -> Ruhe; der Betrag wird auf seinen Median normiert,
weil Garmin ~1000 Einheiten je g bei gespeichertem accel_scale 2048 liefert, Zepp ~2048.

Laeufe zaehlen immer als Versuch, damit Versuche >= Laeufe bleibt (die Quote ist Laeufe/Versuche).
"""
from __future__ import annotations

import numpy as np

VERSION = "startversuche-1"

# Anlauf (Beschleunigung)
HUELLE_S = 0.5
AKTIV_G = 0.8
LUECKE_S = 0.8
DAUER_S = (1.2, 8.0)
SPITZE_G = 3.0
MIN_SPITZEN = 3
VORRUHE_S = 3.0
VORRUHE_G = 0.35

# Versuche (GPS)
SPRINT_KMH = 8.0
ANLAUF_KMH = 6.0
MAX_KMH = 40.0
RUHE_KMH = 4.0
RUHE_S = (2.0, 8.0)
MERGE_S = 6.0
ANLAUF_VOR_S = (-8.0, 2.0)
ABRISS_S = 5.0
STEG_M = 15.0
STEG_MIN = 3
DOPPELT_S = 8.0     # so nah an einem Lauf-Start / alten Versuch = derselbe Start


def _streuung(mag: np.ndarray, n: int) -> np.ndarray:
    k = np.ones(n) / n
    m = np.convolve(mag, k, "same")
    m2 = np.convolve(mag * mag, k, "same")
    return np.sqrt(np.maximum(m2 - m * m, 0.0))


def anlaeufe(mag: np.ndarray, hz: float) -> list[tuple[float, float]]:
    """Anlaeufe im Betrag `mag` (gleichmaessiges Raster, `hz`) -> [(start_s, ende_s)] ab Sample 0."""
    if mag is None or hz <= 0 or mag.size < hz * 10:
        return []
    mag = mag / max(float(np.median(mag)), 1e-6)
    s = _streuung(mag, max(int(HUELLE_S * hz), 3))
    d = np.diff(np.r_[0, (s > AKTIV_G).astype(int), 0])
    teile: list[list[int]] = []
    for a, b in zip(np.where(d == 1)[0], np.where(d == -1)[0]):
        if teile and (a - teile[-1][1]) < LUECKE_S * hz:
            teile[-1][1] = b
        else:
            teile.append([a, b])
    out = []
    for a, b in teile:
        if not DAUER_S[0] <= (b - a) / hz <= DAUER_S[1]:
            continue
        seg = mag[a:b]
        sp = np.where((seg[1:-1] > seg[:-2]) & (seg[1:-1] >= seg[2:]) & (seg[1:-1] > SPITZE_G))[0]
        n_sp, letzte = 0, -1e9
        for i in sp:
            if i - letzte >= 0.2 * hz:
                n_sp += 1
                letzte = i
        if n_sp < MIN_SPITZEN:
            continue
        v0 = max(int(a - VORRUHE_S * hz), 0)
        if a - v0 < hz or float(np.median(s[v0:a])) > VORRUHE_G:
            continue
        out.append((a / hz, b / hz))
    return out


def startversuche(gps: list, anlauf_s: list[tuple[float, float]] | None = None) -> list[dict]:
    """gps: [[t_ms, lat, lon, v_mps, ...], ...]; anlauf_s: Anlaeufe in Sekunden auf DERSELBEN Zeitbasis wie t_ms/1000.
    -> [{"t": s, "weg": "A"|"B"|"C", "strecke_m": m}] zeitlich sortiert."""
    if len(gps) < 3:
        return []
    g = np.array([[p[0], p[1], p[2], p[3] if len(p) > 3 and p[3] is not None else np.nan] for p in gps], float)
    t, v = g[:, 0] / 1000.0, g[:, 3] * 3.6
    ok = ~np.isnan(v)
    lat0, lon0 = float(np.median(g[:, 1])), float(np.median(g[:, 2]))
    x = (g[:, 2] - lon0) * 111320.0 * np.cos(np.radians(lat0))
    y = (g[:, 1] - lat0) * 111320.0
    al = anlauf_s or []
    ab = np.array([b for _, b in al]) if al else np.empty(0)
    roh: list[dict] = []
    for i in np.where(ok & (v >= ANLAUF_KMH) & (v < MAX_KMH))[0]:
        if roh and t[i] - roh[-1]["t_letzt"] <= MERGE_S:
            e = roh[-1]
            e["t_letzt"] = t[i]; e["i_letzt"] = int(i); e["punkte"] += int(v[i] >= SPRINT_KMH)
            continue
        m = ok & (t >= t[i] - RUHE_S[1]) & (t <= t[i] - RUHE_S[0])
        if m.any() and float(np.median(v[m])) >= RUHE_KMH:
            continue
        k0 = max(int(np.searchsorted(t, t[i] - RUHE_S[0])) - 1, 0)
        roh.append({"t": float(t[i]), "t_letzt": float(t[i]), "i0": int(i), "i_letzt": int(i),
                    "punkte": int(v[i] >= SPRINT_KMH), "x": float(x[k0]), "y": float(y[k0]),
                    "anlauf": bool(ab.size and np.any((ab - t[i] > ANLAUF_VOR_S[0]) & (ab - t[i] < ANLAUF_VOR_S[1])))})
    out = []
    for e in roh:
        if not e["anlauf"]:
            continue
        weg = "A" if e["punkte"] >= 1 else "C"
        i0, i1 = max(e["i0"] - 1, 0), e["i_letzt"]
        strecke = float(np.sum(np.hypot(np.diff(x[i0:i1 + 1]), np.diff(y[i0:i1 + 1])))) if i1 > i0 else 0.0
        out.append({"t": e["t"], "weg": weg, "strecke_m": round(strecke, 1), "x": e["x"], "y": e["y"],
                    "i0": i0, "i1": min(i1 + 1, len(t) - 1), "dauer_s": round(float(t[i1] - t[i0]), 1)})
    if len(out) >= STEG_MIN and al:
        cx, cy = float(np.median([e["x"] for e in out])), float(np.median([e["y"] for e in out]))
        for a, b in al:
            if any(abs(e["t"] - b) < 10 for e in roh):
                continue
            nach = t[t > b - 1]
            if nach.size and nach[0] - (b - 1) < ABRISS_S:
                continue
            vor = np.where((t <= a) & (t >= a - 30))[0]
            if vor.size and np.hypot(x[vor[-1]] - cx, y[vor[-1]] - cy) <= STEG_M:
                k = int(vor[-1])
                out.append({"t": float(b), "weg": "B", "strecke_m": 0.0, "x": float(x[k]), "y": float(y[k]),
                            "i0": k, "i1": min(k + 1, len(t) - 1), "dauer_s": 0.0})
    return sorted(out, key=lambda e: e["t"])


def zaehlen(versuche: list[dict], alte: list[tuple[float, float]], laeufe: list[tuple[float, float]]) -> list[float]:
    """Laeufe + alte Versuche + neue Versuche -> Liste von Distanzen (Format von `start_attempts_json`, gezaehlt wird die
    Laenge). `alte` und `laeufe` = [(start_s, distanz_m)], alles auf derselben Zeitbasis. Was innerhalb DOPPELT_S an
    einem schon gezaehlten Ereignis liegt, ist dasselbe (ein alter Versuch am Lauf-Start ist der Lauf)."""
    ereignisse: list[tuple[float, float]] = [(float(t), float(d or 0.0)) for t, d in laeufe]
    for t, d in list(alte) + [(e["t"], e["strecke_m"]) for e in versuche]:
        if not any(abs(t - u) < DOPPELT_S for u, _ in ereignisse):
            ereignisse.append((float(t), float(d or 0.0)))
    return [round(d, 1) for _, d in sorted(ereignisse)]


def anlaeufe_session(session, gps_roh: list, accel_roh: np.ndarray) -> list[tuple[float, float]] | None:
    """Anlaeufe der ganzen Aufnahme in SESSION-Sekunden, aus der ungeschnittenen Accel-Spur (eigene Achse aus
    timebase.py, auf ein gleichmaessiges Raster gelegt). None ohne brauchbare Beschleunigung."""
    from .. import storage
    from .timebase import _accel_chunk_counts, build_timebase
    if accel_roh is None or accel_roh.shape[0] == 0 or not gps_roh:
        return None
    tb = build_timebase(gps_roh, accel_roh, session.accel_scale, session.accel_hz,
                        chunk_counts=_accel_chunk_counts(session.session_uuid),
                        t0_by_index=storage.load_accel_t0(session.session_uuid),
                        accel_luecken=storage.accel_luecken(session.session_uuid),
                        t1_by_index=storage.load_accel_t1(session.session_uuid))
    if not (tb.has_accel and tb.accel_hz and tb.accel_hz > 0 and tb.t_accel_ms.size):
        return None
    hz = float(tb.accel_hz)
    grid_ms = np.arange(int(tb.t_accel_ms[-1] / 1000.0 * hz) + 1) / hz * 1000.0
    pick = np.clip(np.searchsorted(tb.t_accel_ms, grid_ms), 0, tb.t_accel_ms.size - 1)
    a = tb.accel[pick].astype(np.float64)
    mag = np.sqrt((a * a).sum(axis=1))
    # Raster ohne echte Messwerte (Luecken) nicht als Ruhe/Anlauf lesen: dort den Median einsetzen
    fern = np.abs(tb.t_accel_ms[pick] - grid_ms) > max(2000.0 / hz, 250.0)
    if fern.any():
        mag[fern] = float(np.median(mag[~fern])) if (~fern).any() else 1.0
    return anlaeufe(mag, hz)


def alte_versuche(gps: list, gps_hz) -> list[dict]:
    """Die alte Zaehlung (attempts-Preset) mit Zeiten: [{"t": s, "strecke_m", "i0", "i1", "dauer_s"}]."""
    from .gps import SENSITIVITY_PRESETS, analyze_gps
    res = analyze_gps(gps, gps_hz=gps_hz or 1, **SENSITIVITY_PRESETS["attempts"])
    return [{"t": g["t_start_ms"] / 1000.0, "strecke_m": float(g.get("distance_m") or 0.0), "i0": int(g["i_start"]),
             "i1": int(g["i_end"]), "dauer_s": float(g.get("duration_s") or 0.0)} for g in (res.get("segments") or [])]


def fuer_session(session, gps_roh: list, accel_roh: np.ndarray, gps_versuche: list, versatz_ms: float,
                 laeufe: list[tuple[float, float]]) -> list[float] | None:
    """Fuer run_analysis: Versuche auf `gps_versuche` (Zeitbasis: Session-ms minus `versatz_ms`), dazu die Laeufe
    [(start_s, distanz_m)] auf derselben Basis. -> Liste fuer `start_attempts_json`, oder None ohne brauchbare
    Beschleunigung: dann bleibt es bei der alten Zaehlung. Ohne Anlauf als Bestaetigung zaehlt Weg A in verrauschten
    Spuren Spruenge mit (Trockenlauf 25.10.: #17538, Import ohne Accel, 14 -> 51 Versuche aus GPS-Zittern bis 20 km/h)."""
    anl = anlaeufe_session(session, gps_roh, accel_roh)
    if anl is None:
        return None
    anl = [(s0 - versatz_ms / 1000.0, s1 - versatz_ms / 1000.0) for s0, s1 in anl]
    alte = [(e["t"], e["strecke_m"]) for e in alte_versuche(gps_versuche, session.gps_hz)]
    return zaehlen(startversuche(gps_versuche, anl), alte, laeufe)
