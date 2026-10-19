"""Wenden und Halsen beim Wing-/Kite-/Parawing-Foilen (19.10.2026, Stand-Buch: wenden_halsen).

NUR ANZEIGE wie die Carves (`/carves`): getrenntes Modell, read-only, keine Pipeline-/DB-Aenderung,
nicht in Rekorde/Stats.

Erkennung rein aus GPS + Windrichtung:
1. Position glaetten, Kurs aus der Verschiebung ueber ±2 s, nur wo man faehrt (>= 6 km/h).
2. Kurs VOR (−10…−4 s) und NACH (+4…+10 s) jedem Punkt vergleichen. Dreht er um >= 100°, ist
   das ein Kurswechsel; je 20 s nur der staerkste (keine Doppelzaehlung derselben Drehung).
3. Wende oder Halse entscheidet die Windrichtung: dreht der Bug durch den Wind (die Drehung
   ueberstreicht die Richtung, AUS der der Wind kommt) -> Wende; dreht das Heck durch den Wind
   (ueberstreicht die Richtung, WOHIN er weht) -> Halse. Ueberstreicht sie keins von beiden, ist es
   nur ein Kurswechsel ohne Wind-Durchgang und zaehlt nicht.
4. „Durchgefahren" = waehrend der Drehung (±4 s) nie unter 12 km/h — also auf dem Foil geblieben.
   Sonst gilt sie als mit Absetzen/Sturz (zaehlt, aber nicht als durchgefahren).

Windrichtung: Modellwert am Spot je Stunde (`sessionwind`), keine Messung — bei drehendem Wind oder
Abdeckung am Ufer kann eine einzelne Einordnung daneben liegen. Das steht so in der Anzeige.
"""
from __future__ import annotations

import math
from datetime import datetime

import numpy as np

MIN_FAHRT_KMH = 6.0
DREHUNG_MIN_GRAD = 100.0
DURCHGEFAHREN_KMH = 12.0
ABSTAND_S = 20.0


def _winkel_diff(a: float, b: float) -> float:
    """Vorzeichenbehaftete Drehung von a nach b in (-180, 180]."""
    d = (b - a + 180.0) % 360.0 - 180.0
    return 180.0 if d == -180.0 else d


def _ueberstreicht(start: float, drehung: float, ziel: float) -> bool:
    """Liegt `ziel` auf dem Bogen, der von `start` aus um `drehung` Grad gedreht wird?"""
    d = _winkel_diff(start, ziel)
    if drehung >= 0:
        return 0 < (d % 360.0) < drehung
    return 0 < ((-d) % 360.0) < -drehung


def erkennen(t_ms, lat, lon, wind_von) -> list[dict]:
    """t_ms/lat/lon: gleich lange Folgen (getrimmt, Track-Index = Position). `wind_von`: Funktion
    t_ms -> Windrichtung (Grad, woher) oder None. Rueckgabe: je Manoever {i, t_ms, typ, durch,
    drehung, kurs_vor, kurs_nach}; typ "wende" | "halse"."""
    t, kurs, tempo = _kurs_tempo(t_ms, lat, lon)
    n = len(t)
    if n < 30:
        return []
    return _manoever(t, kurs, tempo, t_ms, wind_von)


def _kurs_tempo(t_ms, lat, lon):
    """Kurs (Grad, nur ab MIN_FAHRT_KMH) und Tempo (km/h) je Punkt aus der geglaetteten Spur.
    Eine Quelle fuer Wenden/Halsen UND Hoehe, damit beide dieselbe Spur sehen."""
    t = np.asarray(t_ms, dtype=float) / 1000.0
    la = np.asarray(lat, dtype=float)
    lo = np.asarray(lon, dtype=float)
    n = len(t)
    if n < 30:
        return t, np.full(n, np.nan), np.full(n, np.nan)
    m_lat = 111320.0
    m_lon = 111320.0 * math.cos(math.radians(float(np.nanmedian(la))))
    x = (lo - lo[0]) * m_lon
    y = (la - la[0]) * m_lat
    # Glaetten (gleitendes Mittel ueber 5 Punkte) gegen GPS-Zittern.
    k = np.ones(5) / 5.0
    xs = np.convolve(x, k, mode="same")
    ys = np.convolve(y, k, mode="same")
    kurs = np.full(n, np.nan)
    tempo = np.full(n, np.nan)
    for i in range(2, n - 2):
        dt = t[i + 2] - t[i - 2]
        if dt <= 0 or dt > 8:
            continue
        dx, dy = xs[i + 2] - xs[i - 2], ys[i + 2] - ys[i - 2]
        v = math.hypot(dx, dy) / dt * 3.6
        tempo[i] = v
        if v >= MIN_FAHRT_KMH:
            kurs[i] = (math.degrees(math.atan2(dx, dy)) + 360.0) % 360.0
    return t, kurs, tempo


def _manoever(t, kurs, tempo, t_ms, wind_von) -> list[dict]:
    n = len(t)

    def mittel_kurs(a: float, b: float, um: int):
        sel = (t >= t[um] + a) & (t <= t[um] + b) & ~np.isnan(kurs)
        if sel.sum() < 3:
            return None
        r = np.radians(kurs[sel])
        return (math.degrees(math.atan2(np.sin(r).mean(), np.cos(r).mean())) + 360.0) % 360.0

    kandidaten = []
    for i in range(n):
        if np.isnan(tempo[i]):
            continue
        vor = mittel_kurs(-10, -4, i)
        nach = mittel_kurs(4, 10, i)
        if vor is None or nach is None:
            continue
        d = _winkel_diff(vor, nach)
        if abs(d) >= DREHUNG_MIN_GRAD:
            kandidaten.append((abs(d), i, vor, nach, d))
    # Je ABSTAND_S nur die staerkste Drehung.
    kandidaten.sort(reverse=True)
    gewaehlt: list[tuple] = []
    for c in kandidaten:
        if all(abs(t[c[1]] - t[g[1]]) >= ABSTAND_S for g in gewaehlt):
            gewaehlt.append(c)
    out = []
    for _, i, vor, nach, d in sorted(gewaehlt, key=lambda c: c[1]):
        w = wind_von(t_ms[i])
        if w is None:
            continue
        # Drehrichtung: die tatsaechliche Drehung kann auch > 180° sein; der Kurs dazwischen sagt,
        # in welche Richtung gedreht wurde (Vorzeichen der aufsummierten Kursaenderung).
        sel = np.where((t >= t[i] - 6) & (t <= t[i] + 6) & ~np.isnan(kurs))[0]
        summe = sum(_winkel_diff(kurs[a], kurs[b]) for a, b in zip(sel, sel[1:]))
        drehung = summe if abs(summe) >= DREHUNG_MIN_GRAD else d
        if _ueberstreicht(vor, drehung, w):
            typ = "wende"
        elif _ueberstreicht(vor, drehung, (w + 180.0) % 360.0):
            typ = "halse"
        else:
            continue
        um = (t >= t[i] - 4) & (t <= t[i] + 4) & ~np.isnan(tempo)
        durch = bool(um.any() and float(np.nanmin(tempo[um])) >= DURCHGEFAHREN_KMH)
        out.append({"i": int(i), "t_ms": int(t_ms[i]), "typ": typ, "durch": durch,
                    "drehung": round(float(drehung)), "kurs_vor": round(vor), "kurs_nach": round(nach)})
    return out


def wind_funktion(wind: dict | None):
    """Aus der sessionwind-Antwort eine Funktion Session-Zeit -> Windrichtung (naechste Stunde).
    Erwartet `stunden` mit ISO-Zeit; die Session-Zeit kommt als Epoch-ms ueber `start_epoch_ms`."""
    if not wind or not wind.get("stunden"):
        return None
    pkt = [(datetime.fromisoformat(s["t"]).timestamp() * 1000.0, s["richtung"]) for s in wind["stunden"]]
    return pkt


# --- Hoehe laufen (19.10.2026, Stand-Buch: hoehe) --------------------------------------------------
# Ebenfalls NUR ANZEIGE. VMG zum Wind = Tempo * cos(Winkel zwischen Kurs und der Richtung, AUS der der
# Wind kommt): positiv = man gewinnt Hoehe. Gezaehlt wird nur auf dem Foil (>= DURCHGEFAHREN_KMH).
HOEHE_FENSTER_S = 10.0


def hoehe(t_ms, lat, lon, wind_von) -> dict | None:
    """Kennzahlen zum Hoehelaufen oder None (zu wenig Fahrt / keine Windrichtung):
    vmg_max_kmh = bestes 10-s-Mittel der VMG zum Wind, vmg_mittel_kmh = mittlere VMG am Wind,
    am_wind_anteil = Anteil der Foil-Zeit mit Kurs gegen den Wind, hoehe_m = gesamt gewonnene Hoehe
    (Summe der positiven VMG), winkel_med = typischer Winkel zum Wind am Wind (kleiner = hoeher)."""
    t, kurs, tempo = _kurs_tempo(t_ms, lat, lon)
    n = len(t)
    if n < 30:
        return None
    vmg = np.full(n, np.nan)
    winkel = np.full(n, np.nan)
    for i in range(n):
        if np.isnan(kurs[i]) or np.isnan(tempo[i]) or tempo[i] < DURCHGEFAHREN_KMH:
            continue
        w = wind_von(t_ms[i])
        if w is None:
            continue
        d = abs(_winkel_diff(kurs[i], w))
        winkel[i] = d
        vmg[i] = tempo[i] * math.cos(math.radians(d))
    ok = ~np.isnan(vmg)
    if ok.sum() < 30:
        return None
    dt = np.concatenate([[0.0], np.diff(t)])
    dt = np.where((dt > 0) & (dt <= 5), dt, 0.0)
    am_wind = ok & (vmg > 0)
    zeit_foil = float(dt[ok].sum())
    beste = 0.0
    j = 0
    for i in range(n):
        if not ok[i]:
            continue
        while t[i] - t[j] > HOEHE_FENSTER_S:
            j += 1
        sel = ok[j:i + 1]
        if t[i] - t[j] >= HOEHE_FENSTER_S * 0.8 and sel.sum() >= 5:
            beste = max(beste, float(np.nanmean(vmg[j:i + 1][sel])))
    return {
        "vmg_max_kmh": round(beste, 1),
        "vmg_mittel_kmh": round(float(np.mean(vmg[am_wind])), 1) if am_wind.any() else None,
        "am_wind_anteil": round(float(dt[am_wind].sum()) / zeit_foil, 2) if zeit_foil > 0 else None,
        "hoehe_m": int(round(float(np.sum(vmg[am_wind] / 3.6 * dt[am_wind])))),
        "winkel_med": int(round(float(np.median(winkel[am_wind])))) if am_wind.any() else None,
    }
