"""Eigene Lauf-Erkennung fuer die Wind-Sportarten (Wing, Kite, Parawing) — 19.10.2026.

Jan, 19.10.2026: „physikalisch wuerde ich wingfoilen so beschreiben, je nach Windstaerke und
Foil-Groesse gibt es unterschiedliche Limits. Aber auch ohne diese zu kennen, sollte eindeutig
zwischen langsam (Brett im Wasser) und on-foil ein klarer Geschwindigkeitsunterschied zu sehen
sein, z. B. bei Leichtwind 4 km/h off-foil und >10 km/h on-foil, bei kleinen Foils und viel Wind
8 km/h off-foil und >15 km/h on-foil … das Pump-Detection-Model hat vermutlich gar nichts zu
suchen bei Nicht-Pump-Sportarten." Und: „bau das Erkennungsmodell fuer die Windsportarten genau so".

Also KEIN Handgelenk-Modell (auf Pumpbewegungen trainiert) und keine v3-Nachbearbeitung, sondern
die GPS-Zustandsmaschine von v2 mit Schwellen JE SESSION aus der Tempoverteilung:
- Tempo = Doppler der Uhr (sonst aus den Positionen), dieselbe Bereinigung wie die Analyse,
  3-s-Median, nur bewegte Punkte (>= MIN_KMH).
- Zwei Haeufungen (Brett im Wasser / on-foil): Schwelle per Otsu auf dem Histogramm (1 km/h).
- Klare Luecke = das Tal um die Schwelle ist niedriger als TAL_MAX x der kleinere Gipfel und beide
  Seiten haben genug Punkte. Gemessen an 284 Wind-Sessions: bei 59 % so; Schwelle Median 15 km/h
  (p10 12, p90 22, Leichtwind bis 7), langsam Median 6,5, schnell 22 km/h.
- Start = Schwelle (begrenzt SCHWELLE_MIN..SCHWELLE_MAX), Ende = naeher an der langsamen Haeufung
  (ENDE_ANTEIL des Abstands), damit eine Halse auf dem Foil (gemessen 10-13 km/h, Feedback #202/
  #203) den Lauf nicht beendet; Ende-Verweildauer ENDE_HALTE_S.
- Ohne klare Luecke feste Werte (FEST_START / FEST_ENDE).
"""
from __future__ import annotations

import numpy as np

MIN_KMH = 2.0
MIN_PUNKTE = 120          # mindestens so viele bewegte Sekunden, sonst feste Werte
MIN_ANTEIL_SEITE = 0.05   # beide Haeufungen brauchen >= 5 % der bewegten Punkte
TAL_MAX = 0.3
SCHWELLE_MIN, SCHWELLE_MAX = 7.0, 25.0
ENDE_ANTEIL = 0.4         # Ende = langsam + 0,4 x (Schwelle - langsam)
ENDE_MIN_KMH = 5.0
ENDE_HALTE_S = 5.0
FEST_START, FEST_ENDE = 12.0, 8.0   # km/h; aus der Auswertung 19.10. (12/8 hielt die Foil-Zeit gleich)
VERSION = "wind-1"


def tempo_kmh(gps_samples) -> np.ndarray:
    """Bereinigtes 3-s-Median-Tempo in km/h (wie die Analyse; Doppler, sonst aus Positionen)."""
    from .gps import clean_speed_series, _running_median
    import math
    n = len(gps_samples)
    v = np.zeros(n)
    for i, s in enumerate(gps_samples):
        sp = s[3] if len(s) > 3 else None
        if sp is None and i:
            a, b = gps_samples[i - 1], s
            dt = max((b[0] - a[0]) / 1000.0, 1e-3)
            x = (b[2] - a[2]) * 111320.0 * math.cos(math.radians(b[1]))
            y = (b[1] - a[1]) * 111320.0
            sp = math.hypot(x, y) / dt
        v[i] = float(sp or 0.0)
    v = clean_speed_series(v, 1)
    return _running_median(v, 3) * 3.6


def schwellen(gps_samples) -> dict:
    """{"start_kmh", "ende_kmh", "ende_halte_s", "quelle": "luecke"|"fest", ...Messwerte} fuer eine Session."""
    fest = {"start_kmh": FEST_START, "ende_kmh": FEST_ENDE, "ende_halte_s": ENDE_HALTE_S,
            "quelle": "fest", "version": VERSION}
    if not gps_samples or len(gps_samples) < MIN_PUNKTE:
        return {**fest, "grund": "zu kurz"}
    v = tempo_kmh(gps_samples)
    m = v[v >= MIN_KMH]
    if m.size < MIN_PUNKTE:
        return {**fest, "grund": "zu wenig Bewegung"}
    kanten = np.arange(MIN_KMH, 61.0, 1.0)
    h, _ = np.histogram(m, bins=kanten)
    mitte = kanten[:-1] + 0.5
    tot = h.sum()
    best, k_best = -1.0, None
    for k in range(1, len(h)):
        w0 = h[:k].sum(); w1 = tot - w0
        if w0 == 0 or w1 == 0:
            continue
        m0 = (h[:k] * mitte[:k]).sum() / w0
        m1 = (h[k:] * mitte[k:]).sum() / w1
        b = w0 * w1 * (m0 - m1) ** 2
        if b > best:
            best, k_best = b, k
    if k_best is None:
        return {**fest, "grund": "keine Trennung"}
    schwelle = float(kanten[k_best])
    langsam, schnell = m[m < schwelle], m[m >= schwelle]
    tal = float(h[max(0, k_best - 2):k_best + 1].min())
    gipfel = float(min(h[:k_best].max(), h[k_best:].max()))
    tal_anteil = tal / max(gipfel, 1.0)
    werte = {"otsu_kmh": schwelle, "tal_anteil": round(tal_anteil, 2),
             "langsam_kmh": round(float(np.median(langsam)), 1) if langsam.size else None,
             "schnell_kmh": round(float(np.median(schnell)), 1) if schnell.size else None,
             "anteil_langsam": round(langsam.size / m.size, 2)}
    if (tal_anteil >= TAL_MAX or langsam.size < MIN_ANTEIL_SEITE * m.size
            or schnell.size < MIN_ANTEIL_SEITE * m.size):
        return {**fest, **werte, "grund": "keine klare Luecke"}
    start = min(max(schwelle, SCHWELLE_MIN), SCHWELLE_MAX)
    lang = werte["langsam_kmh"] or MIN_KMH
    ende = max(ENDE_MIN_KMH, lang + ENDE_ANTEIL * (start - lang))
    return {"start_kmh": round(start, 1), "ende_kmh": round(ende, 1), "ende_halte_s": ENDE_HALTE_S,
            "quelle": "luecke", "version": VERSION, **werte}


def v2_parameter(s: dict) -> dict:
    """Die Schwellen als Parameter fuer analyze_session_v2 / detect_v2 (m/s, ohne Modell)."""
    return {"use_model": False, "enter_speed": s["start_kmh"] / 3.6, "exit_speed": s["ende_kmh"] / 3.6,
            "exit_dwell_s": s["ende_halte_s"]}
