"""Autofahrten in einer Aufnahme finden — rein, ohne DB (Befund 04.10.2026, u758).

Der Auto-Zuschnitt schneidet nur vor dem ersten und nach dem letzten Lauf. Faehrt jemand MITTEN in
der Aufnahme zum naechsten Spot oder wird zum Steg zurueckgeshuttelt, bleibt die Fahrt drin: die
schnellen Stuecke fallen zwar als Lauf weg (Physik-Grenze), aber Anfahren und Ortsverkehr (12-25 km/h)
sehen bei GPS-only aus wie ein Lauf, und Strecke und Karte enthalten die Strasse.

Regel (an vier echten Faellen gegen das Tempoprofil geprueft, dann ueber den ganzen Bestand
gemessen — scripts/autofahrt-regression.py):
  1. Tempo aus den POSITIONEN ueber ein Fenster von ~10 s (nicht das Tempofeld der Uhr: das springt bei
     manchen Uhren kurz auf 60-100 km/h, waehrend die Spur auf 100 m stehen bleibt — gemessen an
     #10934/#3874), danach Median ueber 5 Punkte gegen einzelne Positionsspruenge.
  2. Schnelle Stuecke: Tempo > SCHNELL_KMH. Liegen zwei weniger als LUECKE_S auseinander, gehoeren
     sie zu EINER Fahrt (Ampel, Abbiegen). Zusammen mindestens MIN_SCHNELL_S Sekunden schnell.
  3. Spitze >= `spitze_kmh` — je Sportart verschieden (s. SPITZE_JE_SPORT): Kite-Laeufe erreichen im
     Bestand bis 60 km/h, Wing bis 55, Pumpfoil bleibt darunter.
  4. Nach beiden Seiten erweitert bis zum naechsten Halt: Tempo unter HALT_KMH (Schritttempo
     eingeschlossen) fuer mindestens HALT_S. So geht Anfahren und Einparken mit, ein echter letzter
     Lauf VOR dem Fussweg zum Auto aber nicht (#12886, Minute 82,8).
  5. Eine Fahrt geht irgendwohin: die Spur entfernt sich mindestens MIN_WEG_KM vom Fahrtbeginn.
"""
from __future__ import annotations

import math

import numpy as np

SCHNELL_KMH = 35.0
LUECKE_S = 180.0
HALT_KMH = 7.0
HALT_S = 20.0
MITTEL_N = 5
MIN_SCHNELL_S = 30.0
# Positionssprung: ein Punkt, den man vom letzten guten nur mit mehr als SPRUNG_KMH erreicht, ist
# ein Messfehler und faellt vor allem anderen weg (gemessen: einzelne Ausreisser ergaben „482",
# „1061 km/h" — und haetten bei #9215 elf echte Laeufe mitgenommen).
SPRUNG_KMH = 250.0
MIN_WEG_KM = 1.0
FENSTER_S = 10.0
# Spitze, ab der eine schnelle Strecke als Fahrt gilt, je Sportart. Gemessen 04.10.2026 ueber 9945
# Sessions: echte Kite-Laeufe bis 60 km/h (alle u741), Wing bis 55, Pumpfoil/Wakethief/E-Foil
# deutlich darunter. NICHT fuer „other" (Rad/Laufen): ein Rad bergab ist legitim schnell.
SPITZE_JE_SPORT = {"kitefoil": 65.0, "wingfoil": 62.0}
SPITZE_STANDARD = 55.0
OHNE_FAHRTERKENNUNG = {"other"}


def _abstand_m(la1, lo1, la2, lo2):
    p1, p2 = np.radians(la1), np.radians(la2)
    dl = np.radians(lo2 - lo1)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * 6371000.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def _gueltig(gps: list):
    """Punkte mit Position, ohne Positionsspruenge (s. SPRUNG_KMH)."""
    rows = [r for r in gps if len(r) > 2 and r[1] is not None and r[2] is not None]
    t = np.array([float(r[0]) for r in rows])
    lat = np.array([float(r[1]) for r in rows]); lon = np.array([float(r[2]) for r in rows])
    if len(t) < 2:
        return t, lat, lon
    gut = np.ones(len(t), bool)
    j = 0
    for i in range(1, len(t)):
        dt = (t[i] - t[j]) / 1000.0
        if dt <= 0:
            gut[i] = False
            continue
        if float(_abstand_m(lat[j], lon[j], lat[i], lon[i])) / dt * 3.6 > SPRUNG_KMH and dt < 60:
            gut[i] = False
            continue
        j = i
    return t[gut], lat[gut], lon[gut]


def _tempo_kmh(gps: list) -> tuple[np.ndarray, np.ndarray]:
    """Tempo je Punkt aus den Positionen: Abstand der Punkte ~FENSTER_S/2 davor und danach durch die
    Zeit dazwischen, dann Median ueber MITTEL_N Punkte."""
    t, lat, lon = _gueltig(gps)
    n = len(t)
    if n < 3:
        return t, np.zeros(n)
    links = np.searchsorted(t, t - FENSTER_S * 500, side="left")
    rechts = np.clip(np.searchsorted(t, t + FENSTER_S * 500, side="right") - 1, 0, n - 1)
    dt = (t[rechts] - t[links]) / 1000.0
    d = _abstand_m(lat[links], lon[links], lat[rechts], lon[rechts])
    v = np.where(dt > 0, d / np.where(dt > 0, dt, 1), 0.0) * 3.6
    h = MITTEL_N // 2
    pad = np.pad(v, h, mode="edge")
    med = np.median(np.lib.stride_tricks.sliding_window_view(pad, MITTEL_N), axis=1)
    return t, med


def spitze_fuer(sport_class: str | None) -> float | None:
    """Schwelle der Sportart, None = keine Fahrterkennung (Rad, Laufen …)."""
    sc = sport_class or "pumpfoil"
    if sc in OHNE_FAHRTERKENNUNG:
        return None
    return SPITZE_JE_SPORT.get(sc, SPITZE_STANDARD)


def fahrten(gps: list, spitze_kmh: float = SPITZE_STANDARD) -> list[tuple[int, int, float]]:
    """GPS-Rohzeilen [t_ms, lat, lon, v_mps, …] -> [(start_ms, end_ms, spitze_kmh), …] in Session-ms."""
    if not gps or len(gps) < MITTEL_N * 2:
        return []
    t, v5 = _tempo_kmh(gps)
    _, lat, lon = _gueltig(gps)
    if len(t) < MITTEL_N * 2:
        return []
    schnell = v5 > SCHNELL_KMH
    idx = np.flatnonzero(schnell)
    if idx.size == 0:
        return []
    gruppen = [[int(idx[0]), int(idx[0])]]
    for i in idx[1:]:
        if t[i] - t[gruppen[-1][1]] < LUECKE_S * 1000:
            gruppen[-1][1] = int(i)
        else:
            gruppen.append([int(i), int(i)])
    halt = v5 < HALT_KMH
    n = len(t)

    def halt_davor(i: int) -> int:
        j = i
        while j > 0:
            if halt[j]:
                k = j
                while k > 0 and halt[k - 1]:
                    k -= 1
                if t[j] - t[k] >= HALT_S * 1000:
                    return j
                j = k - 1
            else:
                j -= 1
        return 0

    def halt_danach(i: int) -> int:
        j = i
        while j < n - 1:
            if halt[j]:
                k = j
                while k < n - 1 and halt[k + 1]:
                    k += 1
                if t[k] - t[j] >= HALT_S * 1000:
                    return j
                j = k + 1
            else:
                j += 1
        return n - 1

    # Je Punkt hoechstens 5 s: nach einer GPS-Luecke zaehlt sonst die ganze Luecke als „schnell"
    # (SUP auf der Tarn, #9215: ein Punkt nach 199 s Pause).
    dt_pkt = np.minimum(np.diff(t, append=t[-1]) / 1000.0, 5.0)
    out: list[tuple[int, int, float]] = []
    for a, b in gruppen:
        spitze = float(v5[a:b + 1].max())
        if spitze < spitze_kmh or not math.isfinite(spitze):
            continue
        if float(dt_pkt[a:b + 1][schnell[a:b + 1]].sum()) < MIN_SCHNELL_S:
            continue
        i0, i1 = halt_davor(a), halt_danach(b)
        # 80. Perzentil statt Maximum: ein einzelner Ausreisser macht noch keine Fahrt.
        weg = float(np.percentile(_abstand_m(lat[i0], lon[i0], lat[i0:i1 + 1], lon[i0:i1 + 1]), 80)) / 1000.0
        if weg < MIN_WEG_KM:
            continue
        s, e = int(t[i0]), int(t[i1])
        if out and s <= out[-1][1]:
            out[-1] = (out[-1][0], max(out[-1][1], e), max(out[-1][2], spitze))
        else:
            out.append((s, e, round(spitze, 1)))
    return out
