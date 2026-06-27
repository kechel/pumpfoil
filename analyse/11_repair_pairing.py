"""Mast-FITs inhaltlich den fenix-Foiling-Läufen zuordnen (Zeitstempel der FR55 sind
unter Wasser unzuverlässig). Methode: Aktivitäts-Hüllkurve (gleitende RMS der
hochpassgefilterten |accel|) beider Uhren auf 5 Hz, Kreuzkorrelation über große Lags.
Bestes Lag + Korrelationspeak => Paar + Clock-Offset. Validierung an 309↔314, 310↔315.
"""
import sys
import numpy as np
from scipy.signal import butter, filtfilt, correlate
import lib, fitlib
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.gps import analyze_gps

FITS = lib.Path(__file__).parent / "fits"
FS = 5.0


def envelope_abs(t, a):
    hz = len(t) / (t[-1] - t[0])
    b, ah = butter(2, 0.5 / (hz / 2), "high")
    mag = np.linalg.norm(filtfilt(b, ah, a, axis=0), axis=1)
    # auf FS-Raster (RMS pro Bin)
    t0, t1 = t[0], t[-1]
    grid = np.arange(t0, t1, 1 / FS)
    idx = np.clip(((t - t0) * FS).astype(int), 0, len(grid) - 1)
    env = np.zeros(len(grid)); cnt = np.zeros(len(grid))
    np.add.at(env, idx, mag**2); np.add.at(cnt, idx, 1)
    env = np.sqrt(env / np.maximum(cnt, 1))
    return grid, env


def fenix_accel(sid):
    if sid == 309:
        return fitlib.load_fit_accel(str(FITS / "fenix_P3_309.fit"))
    a = lib.load_accel(sid); t = lib.accel_abs_t(sid)
    return t, a


def xcorr_offset(tf, ef, tm, em):
    """bestes Lag (s) das em an ef anlegt + normierter Peak."""
    ef = (ef - ef.mean()) / (ef.std() + 1e-9)
    em = (em - em.mean()) / (em.std() + 1e-9)
    c = correlate(ef, em, mode="full")
    c /= (len(ef) * len(em)) ** 0.5
    lag = np.argmax(c) - (len(em) - 1)        # in FS-Samples (ef-Index - em-Index)
    # abs-Zeit-Offset: t_fenix - t_mast, das die Muster deckt
    offset = (tf[0] - tm[0]) + lag / FS
    return offset, float(c.max())


FENIX_FOIL = [307, 309, 310, 311]
MASTS = ["mast_x_2017.fit", "mast_P3_314.fit", "mast_P4_315.fit", "mast_x_2105.fit", "mast_x_2113.fit"]

# Envelopes vorbereiten
fenv = {}
for sid in FENIX_FOIL:
    t, a = fenix_accel(sid); fenv[sid] = envelope_abs(t, a)
menv = {}
for fn in MASTS:
    t, a = fitlib.load_fit_accel(str(FITS / fn)); menv[fn] = envelope_abs(t, a)

print("Kreuzkorrelation fenix-Lauf x Mast-FIT  (Peak / impliziter Offset s)")
print(f"{'fenix':>6} | " + " | ".join(f"{fn.replace('mast_','').replace('.fit',''):>10}" for fn in MASTS))
best_for = {}
for sid in FENIX_FOIL:
    tf, ef = fenv[sid]; row = []
    for fn in MASTS:
        tm, em = menv[fn]
        off, peak = xcorr_offset(tf, ef, tm, em)
        row.append((fn, peak, off))
    cells = " | ".join(f"{p:4.2f}/{o:+5.0f}" for _, p, o in row)
    win = max(row, key=lambda r: r[1])
    best_for[sid] = win
    print(f"{sid:>6} | {cells}    => beste: {win[0].replace('mast_','').replace('.fit','')} (peak {win[1]:.2f}, off {win[2]:+.0f}s)")

print("\nBekannte Paare zur Validierung: 309 sollte mast_P3_314 (~0s), 310 mast_P4_315 (~0s)")
