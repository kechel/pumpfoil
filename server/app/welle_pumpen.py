"""Wake thief: Welle reiten gegen Pumpen trennen (NUR ANZEIGE wie manoever.py / paddel.py).

Jan, 20.10.2026: „erkennen wann man eine welle nutzt und wann man pumpt … getrennt strecke/zeit auf welle
und getrennt strecke/zeit gepumpt, mit einem eigenen pump-zaehler dann nur in der pump-zeit" und „so gut wie
moeglich umsetzen, wir koennen dann ja wieder feedback einholen aus der community".

Befund (Stand-Buch wakethief, Plots unter server/data/analyse-notizen/2026-10-20-sup-wake/):

* Pumpen ist im Accel (Betrag, Band 0,3–3 Hz) ein kraeftiger Rhythmus. Auf der Welle wird es fast flach,
  bei gehaltenem Tempo (#12741: ~410 s bei 20–22 km/h, nur vereinzelte Pumpstoesse).
* Ein Stueck ohne Pumpen, das LAENGER als ein Gleiten auf flachem Wasser dauert und trotzdem im Lauf
  bleibt, braucht einen Antrieb von aussen — die Welle. Deshalb: ruhig = Huellkurve < 0,35 x des
  kraeftigen Pumpens desselben Laufs (p90), und das mindestens 5 s am Stueck.
* w2 (Jan, 20.10.: „auch auf der welle pumpt man ein kleines bisschen, Gleichgewicht halten, etc., aber die
  'leistung' ist erheblich niedriger … so ganz kurze abschnitte wenn man z.b. die welle wechselt muessen wir
  auch nicht als 'off wave' kennzeichnen"): Schwelle 0,5 statt 0,35 (halber Ausschlag ~ ein Viertel der
  Leistung, Annahme: Leistung ~ Ausschlag²), und Pumpstuecke bis 8 s zwischen zwei Wellenstuecken
  werden ueberbrueckt. Ueberbrueckt werden nur Stuecke, die selbst >= 5 s ruhig sind — echtes Pumpen
  mit 1–2 s Gleiten dazwischen wird so nicht zur Welle.
* Die v3-Pump-Zaehlung meldet auch in ruhigen Wellenstuecken ~85 Pumps/min. Gezaehlt werden hier nur
  Pumps ausserhalb der Wellenstuecke.

Zahlen an 3 Fahrern (36 Sessions) — duenn; Community-Feedback ist eingeplant.
"""
from __future__ import annotations

import math

import numpy as np

# Hochzaehlen, wenn sich hier etwas aendert -> alle Cache-Eintraege (data/welle_pumpen/) ungueltig.
VERSION = "w5"

BAND_HZ = (0.3, 3.0)
RUHIG_FAKTOR = 0.5      # mittlere Leistung (6 s) unter diesem Anteil des Pump-Niveaus (p90 im Lauf) = Welle
LEISTUNG_S = 6.0        # w4: Mittel von f² statt Spitzen-Huellkurve (s. Kopf)
BRUECKE_S = 10.0        # kuerzere Pumpstuecke ZWISCHEN zwei Wellenstuecken zaehlen zur Welle (w2: 8, w5: 10 nach #12816)
TEMPO_GEHALTEN = 0.9    # w5: Wellenstueck nur, wenn das Tempo darin >= 90 % des Lauf-Medians bleibt — sonst ist es
                        # das Ausrollen am Laufende (Pumpen hoert auf, Tempo faellt), keine Welle
PUMP_PERZENTIL = 90
MIN_WELLE_S = 5.0       # kuerzer ist ein normales Gleiten zwischen zwei Pumps
MIN_LAUF_S = 5.0


def _meter(a, b) -> float:
    r = 6371000.0
    la1, la2 = math.radians(a[1]), math.radians(b[1])
    dla, dlo = la2 - la1, math.radians(b[2] - a[2])
    h = math.sin(dla / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin(dlo / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(h)))


def _tempo(gps: list, lo_s: float, hi_s: float) -> float:
    """Median-Tempo (m/s) der GPS-Punkte im Zeitraum; 0 ohne Punkte."""
    v = [g[3] for g in gps if lo_s * 1000 <= g[0] <= hi_s * 1000 and len(g) > 3 and g[3] is not None]
    return float(np.median(v)) if v else 0.0


def _strecke(gps: list, lo_s: float, hi_s: float) -> float:
    pkt = [g for g in gps if lo_s * 1000 <= g[0] <= hi_s * 1000]
    return sum(_meter(p, q) for p, q in zip(pkt, pkt[1:]))


def auswerten(t_s: np.ndarray, accel: np.ndarray, hz: float, gps: list, laeufe: list[dict]) -> dict | None:
    """`t_s`: Session-Sekunden je Accel-Sample; `laeufe`: [{"lo": s, "hi": s, "pumps_t": [s, …]}] in
    Session-Sekunden (Pump-Zeitpunkte aus der Analyse). None ohne auswertbaren Lauf."""
    from scipy.ndimage import uniform_filter1d
    from scipy.signal import butter, filtfilt

    if hz is None or hz < 8 or len(t_s) < hz * 10:
        return None
    mag = np.linalg.norm(accel.astype(float), axis=1)
    b, a = butter(2, [BAND_HZ[0] / (hz / 2), BAND_HZ[1] / (hz / 2)], "band")
    f = filtfilt(b, a, mag - np.median(mag))
    # w4 (20.10.2026, Jan zu #12816: „war wirklich nur da auf welle oder vielleicht etwas mehr von diesem
    # stueck?"): Die Spitzen-Huellkurve blieb hoch, sobald zwischendurch einzelne kraeftige Ausgleichs-Pumps
    # kamen — #12816 zeigte nur 8 s Welle, obwohl 2160-2218 s der Rhythmus unregelmaessig wird, die
    # Ausschlaege/min auf 50-80 fallen und das Tempo am hoechsten ist. Die MITTLERE Leistung (f² ueber 6 s)
    # faellt dort auf 0,3-0,65 und erfasst das; bei durchgehendem Pumpen (#13843) bleibt sie >= 0,45 und nie
    # 5 s darunter.
    env = uniform_filter1d(f ** 2, max(int(hz * LEISTUNG_S), 1))

    welle_s = gepumpt_s = welle_m = gepumpt_m = 0.0
    pumps = 0
    laengste = 0.0
    abschnitte: list[list[int]] = []
    linien: list[list[list[float]]] = []
    ausgewertet = False
    for lauf in laeufe:
        lo, hi = lauf["lo"], lauf["hi"]
        m = np.flatnonzero((t_s >= lo) & (t_s <= hi))
        if len(m) < hz * MIN_LAUF_S:
            continue
        ausgewertet = True
        e = env[m]
        lauf_tempo = _tempo(gps, lo, hi)
        ruhig = e < RUHIG_FAKTOR * float(np.percentile(e, PUMP_PERZENTIL))
        kanten = np.flatnonzero(np.diff(np.r_[0, ruhig.astype(np.int8), 0]))
        stuecke = []
        for x, y in zip(kanten[::2], kanten[1::2]):
            a_s, b_s = float(t_s[m[x]]), float(t_s[m[y - 1]])
            if b_s - a_s >= MIN_WELLE_S and _tempo(gps, a_s, b_s) >= TEMPO_GEHALTEN * lauf_tempo:
                if stuecke and a_s - stuecke[-1][1] <= BRUECKE_S:
                    stuecke[-1] = (stuecke[-1][0], b_s)      # kurzer Wellenwechsel -> bleibt Welle
                else:
                    stuecke.append((a_s, b_s))
        lauf_m = _strecke(gps, lo, hi)
        w_s = sum(b_ - a_ for a_, b_ in stuecke)
        w_m = sum(_strecke(gps, a_, b_) for a_, b_ in stuecke)
        welle_s += w_s
        welle_m += w_m
        gepumpt_s += max(hi - lo - w_s, 0.0)
        gepumpt_m += max(lauf_m - w_m, 0.0)
        laengste = max([laengste] + [b_ - a_ for a_, b_ in stuecke])
        abschnitte += [[int(round(a_ * 1000)), int(round(b_ * 1000))] for a_, b_ in stuecke]
        # Fertige Punkte fuer die Karte (wie die Startversuche: keine Indizes, die verschiebt der Trim).
        linien += [[[g[1], g[2]] for g in gps if a_ * 1000 <= g[0] <= b_ * 1000] for a_, b_ in stuecke]
        pumps += sum(1 for p in lauf.get("pumps_t") or [] if not any(a_ <= p <= b_ for a_, b_ in stuecke))
    if not ausgewertet:
        return None
    return {
        "welle_s": round(welle_s), "welle_m": round(welle_m),
        "gepumpt_s": round(gepumpt_s), "gepumpt_m": round(gepumpt_m),
        "pumps": pumps,
        "pumps_pro_min": round(pumps / (gepumpt_s / 60.0)) if gepumpt_s >= 30 else None,
        "laengste_welle_s": round(laengste),
        "abschnitte": abschnitte,
        "linien": [ln for ln in linien if len(ln) >= 2],
    }
