"""Gemeinsame Helfer für die Visualisierungen (P3/P4): On-Foil-Fenster, Track, Mast-Lage."""
import sys
import numpy as np
from scipy.signal import butter, filtfilt
import lib, fitlib
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.gps import analyze_gps
from app.ml.pumps import pump_times_ms

FITS = lib.Path(__file__).parent / "fits"
OUT = lib.Path(__file__).parent / "out"
RUNS = [("P3 20:26", "fenix_P3_309.fit", None, "mast_P3_314.fit"),
        ("P4 20:38", None, 310, "mast_P4_315.fit")]


def mast_fields(mfit):
    t, a = fitlib.load_fit_accel(str(FITS / mfit)); hz = round(len(t) / (t[-1] - t[0]))
    bg, ag = butter(2, 0.5 / (hz / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
    g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
    gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
    ex = np.array([1.0, 0, 0]); ef = ex - (ex @ g0u) * g0u; ef /= np.linalg.norm(ef); el = np.cross(g0u, ef)
    tv = gu - (gu @ g0u)[:, None] * g0u
    pitch = np.degrees(np.arcsin(np.clip(tv @ ef, -1, 1))) - 0
    roll = np.degrees(np.arcsin(np.clip(tv @ el, -1, 1)))
    bb, aa = butter(2, [0.3 / (hz / 2), 1.5 / (hz / 2)], "band")
    surge = filtfilt(bb, aa, (a - grav) @ ef)
    return t, pitch - np.median(pitch), roll - np.median(roll), surge


def run_data(ffit, chunk, mfit):
    if ffit:
        sm, t0 = fitlib.load_fit_gps_samples(str(FITS / ffit))
        gt = np.array([t0 + s[0] / 1000.0 for s in sm]); la = np.array([s[1] for s in sm])
        lo = np.array([s[2] for s in sm]); sp = np.array([s[3] or 0 for s in sm])
        res = analyze_gps(sm, gps_hz=1)
        tf, af = fitlib.load_fit_accel(str(FITS / ffit)); hzf = round(len(tf) / (tf[-1] - tf[0]))
    else:
        g = lib.load_gps(chunk); t0 = lib.start_unix(chunk)
        gt = t0 + np.array([r[0] for r in g]) / 1000.0; la = np.array([r[1] for r in g])
        lo = np.array([r[2] for r in g]); sp = np.array([r[3] for r in g])
        res = analyze_gps([[r[0], r[1], r[2], r[3], None, r[5] if len(r) > 5 else None] for r in g], gps_hz=1)
        af = lib.load_accel(chunk); tf = lib.accel_abs_t(chunk); hzf = lib.HZ[chunk]
    seg = res["segments"][0]; on0, on1 = t0 + seg["t_start_ms"] / 1000.0, t0 + seg["t_end_ms"] / 1000.0
    tmt, pitch, roll, surge = mast_fields(mfit)
    grid = np.arange(on0, on1, 0.1)
    lat = np.interp(grid, gt, la); lon = np.interp(grid, gt, lo); spd = np.interp(grid, gt, sp) * 3.6
    lat0, lon0 = lat.mean(), lon.mean()
    x = (lon - lon0) * np.cos(np.radians(lat0)) * 111320; y = (lat - lat0) * 111320
    # Wrist-Pump-Marker (echte Produktfunktion) -> Positionen
    mw = (tf >= on0) & (tf <= on1)
    pmag = np.linalg.norm(af[mw], axis=1)
    pt = on0 + pump_times_ms(pmag, hzf) / 1000.0
    px = np.interp(pt, grid + 0, x); py = np.interp(pt, grid, y)
    fields = dict(t=grid - on0,
                  Nick=np.interp(grid, tmt, pitch), Roll=np.interp(grid, tmt, roll),
                  Surge=np.interp(grid, tmt, surge), Speed=spd)
    return dict(x=x, y=y, fields=fields, px=px, py=py, npump=len(pt), dur=on1 - on0)
