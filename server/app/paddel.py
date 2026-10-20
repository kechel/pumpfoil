"""Paddelschlaege und Paddle-up-Versuche aus dem Accel der Uhr (SUP/Paddeln, NUR ANZEIGE wie manoever.py).

Jan, 20.10.2026: „bei paddle-up dann bitte die Stroke daten direkt mal mit einbauen, einmal gesamt strokes
ueber die session, aber auch die 'sprint-strokes per attempt' … und schaue mal ob man da auch dann on-foil
oder nicht on-foil vielleicht doch erkennen kann". Befund vorher (Stand-Buch sup_paddle, Plots unter
server/data/analyse-notizen/2026-10-20-sup-wake/):

* Die Uhr sitzt am Handgelenk, also am Paddel: jeder Schlag ist eine Spitze im Betrag |a| (Band 0,3–3 Hz).
  Reines SUP: 48–50 Schlaege/min, gleichmaessig.
* Vor dem Abheben ein Sprint: ~10 Schlaege mit 2–3x dem Ausschlag des normalen Paddelns. Das Merkmal ist
  die STAERKE, nicht die Rate (die schwankte vor den Laeufen von 31 bis 100/min).
* Ergebnis je Versuch: „foil", wenn direkt danach ein erkannter Lauf beginnt; „kurz", wenn das GPS-Tempo
  kurz auf >= 10 km/h springt ohne Lauf (ein Abheben von 1–2 s ist so denkbar, aber UNBELEGT — kein
  Versuch mit Video/Handy am Brett zum Abgleich); sonst „nein".

Die Schwellen stehen auf EINEM Fahrer mit Foil-Laeufen (#10051) und zwei Sessions ohne (u744) — duenn.
"""
from __future__ import annotations

import numpy as np

# Hochzaehlen, wenn sich hier etwas aendert -> alle Cache-Eintraege (data/paddel/) ungueltig.
VERSION = "p4"   # p2: Punkte je Sprint fuer die Karte (`linie`); p3: Ort je Schlag (`schlag_pkt`); p4: Orte der Sprintschlaege je Versuch

BAND_HZ = (0.3, 3.0)        # Paddelschlaege liegen bei 0,7–1,7 Hz
MIN_ABSTAND_S = 0.5          # zwei Schlaege nie dichter
SPITZE_FAKTOR = 0.5          # Spitze >= 0,5 x Grundausschlag des Paddelns
SPRINT_FAKTOR = 2.0          # Sprint = Huellkurve >= 2 x Grundausschlag
SPRINT_MIN_S = 3.0           # so lange mindestens
SPRINT_LUECKE_S = 4.0        # kuerzere Pausen gehoeren zum selben Sprint
PADDEL_KMH = (1.5, 8.0)      # Tempo, bei dem normal gepaddelt wird (Grundausschlag)
START_MAX_KMH = 9.0          # ein Versuch beginnt langsam, nicht schon auf dem Foil
LAUF_NACH_S = 5.0            # beginnt ein Lauf so kurz nach dem Sprint -> „foil"
KURZ_KMH = 10.0              # GPS-Sprung ohne Lauf -> „kurz" (vielleicht kurz abgehoben)
KURZ_FENSTER_S = 15.0
KURZ_MIN_S = 0.4
MIN_PADDEL_S = 30.0          # weniger normales Paddeln -> kein Grundausschlag -> keine Auswertung


def _tempo_kmh(t_s: np.ndarray, gps: list) -> np.ndarray:
    g = np.array([[r[0] / 1000.0, (r[3] if len(r) > 3 and r[3] is not None else np.nan)] for r in gps], float)
    if len(g) < 2:
        return np.zeros_like(t_s)
    ok = ~np.isnan(g[:, 1])
    if ok.sum() < 2:
        return np.zeros_like(t_s)
    return np.interp(t_s, g[ok, 0], g[ok, 1]) * 3.6


def auswerten(t_s: np.ndarray, accel: np.ndarray, hz: float, gps: list,
              laeufe: list[tuple[float, float]]) -> dict | None:
    """`t_s`: Session-Sekunden je Accel-Sample, `accel`: (N, 3) in beliebiger, fester Einheit (nur
    Verhaeltnisse zaehlen), `laeufe`: erkannte Laeufe als (Beginn, Ende) in Session-Sekunden.
    None, wenn zu wenig Daten fuer einen Grundausschlag da sind."""
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    from scipy.signal import butter, filtfilt, find_peaks

    if hz is None or hz < 8 or len(t_s) < hz * 60:
        return None
    mag = np.linalg.norm(accel.astype(float), axis=1)
    b, a = butter(2, [BAND_HZ[0] / (hz / 2), BAND_HZ[1] / (hz / 2)], "band")
    f = filtfilt(b, a, mag - np.median(mag))
    env = uniform_filter1d(maximum_filter1d(np.abs(f), max(int(hz * 1.2), 1)), max(int(hz * 2), 1))
    kmh = _tempo_kmh(t_s, gps)
    paddeln = (kmh > PADDEL_KMH[0]) & (kmh < PADDEL_KMH[1])
    im_lauf = np.zeros(len(t_s), bool)
    for lo, hi in laeufe:
        im_lauf |= (t_s >= lo) & (t_s <= hi)
    paddeln &= ~im_lauf
    if paddeln.sum() < MIN_PADDEL_S * hz:
        return None
    grund = float(np.median(env[paddeln]))
    if grund <= 0:
        return None

    spitzen, _ = find_peaks(f, height=SPITZE_FAKTOR * grund, distance=max(int(MIN_ABSTAND_S * hz), 1))
    ausserhalb = spitzen[~im_lauf[spitzen]]
    paddel_min = paddeln.sum() / hz / 60.0
    rate = float(paddeln[spitzen].sum() / paddel_min) if paddel_min > 0 else None

    # Sprints: Huellkurve ueber der Schwelle, kurze Pausen zusammengefasst.
    hoch = env >= SPRINT_FAKTOR * grund
    kanten = np.flatnonzero(np.diff(np.r_[0, hoch.astype(np.int8), 0]))
    fenster: list[list[int]] = []
    for lo, hi in zip(kanten[::2], kanten[1::2]):
        if fenster and (t_s[lo] - t_s[fenster[-1][1] - 1]) < SPRINT_LUECKE_S:
            fenster[-1][1] = hi
        else:
            fenster.append([lo, hi])

    g_pos = np.array([[r[0] / 1000.0, r[1], r[2]] for r in gps if r[1] is not None and r[2] is not None], float)

    def orte(ix: np.ndarray) -> list:
        """Ort je Schlag-Index: GPS linear auf den Zeitpunkt interpoliert, bis 5 s ueber den Rand hinaus."""
        if len(g_pos) < 2 or len(ix) == 0:
            return []
        ts = t_s[ix]
        ts = ts[(ts >= g_pos[0, 0] - 5) & (ts <= g_pos[-1, 0] + 5)]
        return [[round(float(a_), 6), round(float(b_), 6)]
                for a_, b_ in zip(np.interp(ts, g_pos[:, 0], g_pos[:, 1]), np.interp(ts, g_pos[:, 0], g_pos[:, 2]))]

    versuche = []
    n = len(t_s)
    for lo, hi in fenster:
        if t_s[hi - 1] - t_s[lo] < SPRINT_MIN_S or im_lauf[lo] or kmh[lo] > START_MAX_KMH:
            continue
        # Der Sprint endet, wo ein Lauf beginnt (danach ist es Pumpen/Fahren, keine Sprintschlaege mehr).
        drin = np.flatnonzero(im_lauf[lo:hi])
        ende = lo + int(drin[0]) if len(drin) else hi
        sprint_s = float(t_s[ende - 1] - t_s[lo]) if ende > lo else 0.0
        im_sprint = spitzen[(spitzen >= lo) & (spitzen < ende)]
        schlaege = int(len(im_sprint))
        t_ende = t_s[ende - 1] if ende > lo else t_s[lo]
        lauf = next(((a_, b_) for a_, b_ in laeufe if a_ <= t_ende + LAUF_NACH_S and b_ >= t_s[lo]), None)
        bis = min(n, int(np.searchsorted(t_s, t_s[lo] + KURZ_FENSTER_S)))
        schnell_s = float((kmh[lo:bis] >= KURZ_KMH).sum() / hz)
        # Fertige Punkte des Sprints fuer die Karte (wie Startversuche: keine Indizes, die verschiebt der Trim).
        linie = [[g[1], g[2]] for g in gps if t_s[lo] * 1000 <= g[0] <= t_ende * 1000]
        e = {"t_ms": int(round(t_s[lo] * 1000)), "sprint_s": round(sprint_s, 1), "schlaege": schlaege, "linie": linie,
             "schlag_pkt": orte(im_sprint),   # p4: Karte „nur Foil" zeigt nur die Sprintschlaege
             "staerke": round(float(env[lo:max(ende, lo + 1)].mean() / grund), 1),
             "max_kmh": round(float(kmh[lo:bis].max()), 1) if bis > lo else None}
        if lauf is not None:
            e.update(ergebnis="foil", foil_s=round(lauf[1] - lauf[0], 1))
        elif schnell_s >= KURZ_MIN_S:
            e.update(ergebnis="kurz", schnell_s=round(schnell_s, 1))
        else:
            e["ergebnis"] = "nein"
        versuche.append(e)

    # Ort je gezaehltem Schlag fuer die Karte (Jan, 20.10.2026: der Knopf „Strokes" soll Schlaege aus DIESER
    # Erkennung zeigen, nicht die Pumps der Pump-Erkennung). GPS linear auf den Schlag-Zeitpunkt interpoliert.
    schlag_pkt = orte(ausserhalb)

    return {
        "schlag_pkt": schlag_pkt,
        "schlaege": int(len(ausserhalb)),
        "schlaege_pro_min": round(rate) if rate else None,
        "versuche": versuche,
        "auf_foil": sum(1 for v in versuche if v["ergebnis"] == "foil"),
        "kurz": sum(1 for v in versuche if v["ergebnis"] == "kurz"),
    }
