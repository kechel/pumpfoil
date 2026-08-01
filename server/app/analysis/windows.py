"""Erkennung v2 — Schritt 2: Fenster-Merkmale (docs/detector-v2.md, Abschnitt 2).

Ein festes Raster über die GANZE Session statt einer globalen Sample-Maske: 10-s-Fenster
alle 5 s. Je Fenster ein Merkmalssatz aus GPS, Accel und Puls; das Label und daraus die
Läufe entstehen später (detect_v2) aus der Fenster-FOLGE. Vorteil gegenüber v1: Übergänge
sind robust und je Lauf steht hinterher da, welche Fenster ihn tragen.

HARTE REGEL hier: fehlt ein Signal, ist das Feld **None** — nicht 0. Eine 0 wäre eine
Messaussage („kein Puls", „keine Bewegung"), und genau solche stillen Annahmen sind der
Grund für v2.
"""
from __future__ import annotations

import numpy as np

from .geo import step_distances_m
from .timebase import TimeBase

WINDOW_MS = 10_000      # Entwurf Abschnitt 2: 10-s-Fenster …
HOP_MS = 5_000          # … alle 5 s (50 % Überlappung)

# Pump-Band. Der Entwurf nennt 0,7–2,5 Hz und weicht damit bewusst von PUMP_BAND (0,5–2,0)
# in ml/features.py ab: gemessene Pump-Kadenzen liegen bei 0,8–2,0 Hz (PUMP_CAD_BAND in
# ml/pumps.py, gegen die run_pumps-Wahrheit kalibriert), und das breitere Band lässt oben
# und unten Luft, damit die GIPFELIGKEIT (Spitze gegen Median IM Band) überhaupt etwas zu
# vergleichen hat — ein Band, das genau auf dem Gipfel sitzt, hat keinen Grundpegel.
PUMP_BAND_HZ = (0.7, 2.5)
# Gesamtband für den Bandanteil: unten die Schwerkraft/Orientierung raus (GRAVITY_CUTOFF_HZ
# in ml/features.py = 0,25), oben so weit, wie 10-s-Fenster bei niedrigen Raten hergeben.
TOTAL_BAND_HZ = (0.25, 5.0)

MIN_ACCEL_SAMPLES = 32  # darunter ist ein Spektrum über 10 s nicht aussagekräftig -> Accel None
MIN_GPS_SAMPLES = 3     # darunter kein Median/keine Kursänderung -> GPS-Felder None


def _median_or_none(a: np.ndarray) -> float | None:
    a = a[~np.isnan(a)] if a.size else a
    return float(np.median(a)) if a.size else None


def _gps_features(gps: list, t_ms: np.ndarray) -> dict:
    """GPS-Merkmale eines Fensters. Median statt Mittel: ein 10-s-Fenster bei 1 Hz hat ~10
    Werte, der Median übersteht bis zu 4 Doppler-Ausreißer unbeschadet. v2 baut deshalb
    bewusst NICHT die Despike-Kette von v1 nach (die dort nötig ist, weil dort einzelne
    Samples entscheiden)."""
    n = len(gps)
    out: dict = {
        "n_gps": n, "v_dop_mps": None, "v_pos_mps": None, "v_std_mps": None,
        "course_rate_deg": None, "hacc_m": None, "dist_m": None, "net_m": None,
    }
    if n < MIN_GPS_SAMPLES:
        return out
    lat = np.array([float(s[1]) for s in gps])
    lon = np.array([float(s[2]) for s in gps])
    v_raw = np.array([float(s[3]) if len(s) > 3 and s[3] is not None else np.nan for s in gps])
    hacc = np.array([float(s[5]) if len(s) > 5 and s[5] is not None else np.nan for s in gps])

    step = step_distances_m(lat, lon)
    dt = np.diff(t_ms, prepend=t_ms[0]) / 1000.0
    dt = np.where(dt <= 0, np.nan, dt)
    v_pos = step / dt

    out["v_dop_mps"] = _median_or_none(v_raw)
    out["v_pos_mps"] = _median_or_none(v_pos)
    vs = v_raw[~np.isnan(v_raw)]
    out["v_std_mps"] = float(np.std(vs)) if vs.size >= 2 else None
    out["hacc_m"] = _median_or_none(hacc)
    out["dist_m"] = float(np.nansum(step))

    # Kursänderung: mittlerer Betrag der Richtungsänderung je Schritt. Nur Schritte mit echter
    # Bewegung zählen — bei Stillstand ist der Kurs GPS-Rauschen und würde jede Kurvigkeit
    # vortäuschen. Lokale Meter-Ebene (Äquidistant um den Fenster-Median) statt Grad.
    la0 = float(np.median(lat))
    mx = 111320.0 * float(np.cos(np.radians(la0)))
    X = (lon - float(np.median(lon))) * mx
    Y = (lat - la0) * 111320.0
    dx, dy = np.diff(X), np.diff(Y)
    bewegt = np.hypot(dx, dy) > 1.0
    if bewegt.size >= 2:
        brg = np.degrees(np.arctan2(dy, dx))
        d = (np.diff(brg) + 180.0) % 360.0 - 180.0
        gilt = bewegt[1:] & bewegt[:-1]
        if gilt.any():
            out["course_rate_deg"] = float(np.mean(np.abs(d[gilt])))
    out["net_m"] = float(np.hypot(X[-1] - X[0], Y[-1] - Y[0]))
    return out


def _accel_features(mag: np.ndarray, fs: float) -> dict:
    """Accel-Merkmale eines Fensters aus dem Beschleunigungs-BETRAG (orientierungsinvariant,
    wie ml/features.magnitude_g). RMS um den Fenster-Mittelwert = die „Wucht": der Entwurf
    belegt an synchronen Sessions Autofahrt 0,037 g gegen Pumpen 1,22 g — die Frequenz trennt
    nicht (1,63 gegen 1,54 Hz), die Wucht schon."""
    out: dict = {
        "n_accel": int(mag.size), "rms_g": None, "dom_hz": None,
        "peakiness": None, "band_ratio": None,
    }
    if mag.size < MIN_ACCEL_SAMPLES or fs <= 0:
        return out
    x = mag - float(np.mean(mag))
    out["rms_g"] = float(np.sqrt(np.mean(x * x)))
    spec = np.abs(np.fft.rfft(x * np.hanning(x.size))) ** 2
    fr = np.fft.rfftfreq(x.size, d=1.0 / fs)
    band = (fr >= PUMP_BAND_HZ[0]) & (fr <= PUMP_BAND_HZ[1])
    total = (fr >= TOTAL_BAND_HZ[0]) & (fr <= TOTAL_BAND_HZ[1])
    if band.sum() >= 3 and spec[band].sum() > 0:
        p = spec[band]
        out["dom_hz"] = float(fr[band][int(np.argmax(p))])
        med = float(np.median(p))
        # Gipfeligkeit = Spitze gegen den Grundpegel IM Band. Ein echter Rhythmus ist ein
        # schmaler Gipfel über flachem Boden; Rauschen/Rumpeln füllt das Band gleichmäßig.
        out["peakiness"] = float(np.max(p) / med) if med > 0 else None
        tot = float(spec[total].sum())
        out["band_ratio"] = float(p.sum() / tot) if tot > 0 else None
    return out


def _hr_features(gps: list, t_ms: np.ndarray) -> dict:
    """Puls-Median und -Steigung (bpm/min) im Fenster. Reines Beifang-Signal: der Entwurf
    lässt Puls ausdrücklich NICHT entscheiden, nur bestätigen (später)."""
    hr = np.array([float(s[4]) if len(s) > 4 and s[4] else np.nan for s in gps]) if gps else np.empty(0)
    ok = ~np.isnan(hr) & (hr > 0) if hr.size else np.zeros(0, dtype=bool)
    if ok.sum() < 2:
        return {"hr_bpm": _median_or_none(hr) if hr.size else None, "hr_slope_bpm_min": None}
    tt = t_ms[ok] / 60000.0
    steigung = float(np.polyfit(tt, hr[ok], 1)[0]) if float(tt.max() - tt.min()) > 0 else None
    return {"hr_bpm": float(np.median(hr[ok])), "hr_slope_bpm_min": steigung}


def window_grid(tb: TimeBase, window_ms: int = WINDOW_MS, hop_ms: int = HOP_MS) -> list[dict]:
    """Merkmals-Fenster über die ganze Session, in Session-Millisekunden.

    Das Raster läuft über das Auswertefenster der Zeitachse (Trim). Ausgeschlossene Bereiche
    haben keine Samples mehr — die Fenster dort bleiben leer (n_gps = 0) und wirken damit wie
    eine Datenlücke, genau wie gewollt."""
    start, end = int(tb.window_start_ms), int(tb.window_end_ms)
    if end <= start or tb.t_gps_ms.size == 0:
        return []
    t_gps = tb.t_gps_ms
    t_acc = tb.t_accel_ms
    fs = float(tb.accel_hz) if (tb.accel_hz and tb.has_accel) else 0.0
    mag_all = None
    if fs > 0 and tb.has_accel:
        from ..ml.features import magnitude_g

        mag_all = magnitude_g(tb.accel, tb.accel_scale)

    out: list[dict] = []
    for i, w0 in enumerate(range(start, max(end - window_ms, start) + hop_ms, hop_ms)):
        w1 = min(w0 + window_ms, end)
        if w1 <= w0:
            break
        a = int(np.searchsorted(t_gps, w0, side="left"))
        b = int(np.searchsorted(t_gps, w1, side="right"))
        sub = tb.gps[a:b]
        sub_t = t_gps[a:b]
        f: dict = {"i": i, "t_start_ms": int(w0), "t_end_ms": int(w1),
                   "t_center_ms": int((w0 + w1) // 2)}
        f.update(_gps_features(sub, sub_t))
        if mag_all is not None and t_acc.size:
            ia = int(np.searchsorted(t_acc, w0, side="left"))
            ib = int(np.searchsorted(t_acc, w1, side="right"))
            f.update(_accel_features(mag_all[ia:ib], fs))
        else:
            f.update({"n_accel": 0, "rms_g": None, "dom_hz": None,
                      "peakiness": None, "band_ratio": None})
        f.update(_hr_features(sub, sub_t))
        out.append(f)
    return out
