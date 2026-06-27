"""Coole Bilder: Foiling-Track eingefärbt nach Foil-Lage (Nick/Roll), Surge, Speed.
Mast-Lage (FR55) zeitlich auf die GPS-Positionen (fenix) gemappt — Uhren ~synchron.
Track auf 10 Hz interpoliert für glatte Farbe. P3 + P4."""
import sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import numpy as np
from scipy.signal import butter, filtfilt
import lib, fitlib
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.gps import analyze_gps

FITS = lib.Path(__file__).parent / "fits"; OUT = lib.Path(__file__).parent / "out"


def mast_fields(mfit):
    t, a = fitlib.load_fit_accel(str(FITS / mfit)); hz = round(len(t) / (t[-1] - t[0]))
    bg, ag = butter(2, 0.5 / (hz / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
    g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
    gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
    ex = np.array([1.0, 0, 0]); ef = ex - (ex @ g0u) * g0u; ef /= np.linalg.norm(ef); el = np.cross(g0u, ef)
    tv = gu - (gu @ g0u)[:, None] * g0u
    pitch = np.degrees(np.arcsin(np.clip(tv @ ef, -1, 1)))
    roll = np.degrees(np.arcsin(np.clip(tv @ el, -1, 1)))
    bb, aa = butter(2, [0.3 / (hz / 2), 1.5 / (hz / 2)], "band")
    surge = filtfilt(bb, aa, (a - grav) @ ef)
    return t, pitch - np.median(pitch), roll - np.median(roll), surge


def run_track(ffit, chunk, mfit):
    if ffit:
        sm, t0 = fitlib.load_fit_gps_samples(str(FITS / ffit))
        gt = np.array([t0 + s[0] / 1000.0 for s in sm]); la = np.array([s[1] for s in sm])
        lo = np.array([s[2] for s in sm]); sp = np.array([s[3] or 0 for s in sm])
        res = analyze_gps(sm, gps_hz=1)
    else:
        g = lib.load_gps(chunk); t0 = lib.start_unix(chunk)
        gt = t0 + np.array([r[0] for r in g]) / 1000.0; la = np.array([r[1] for r in g])
        lo = np.array([r[2] for r in g]); sp = np.array([r[3] for r in g])
        res = analyze_gps([[r[0], r[1], r[2], r[3], None, r[5] if len(r) > 5 else None] for r in g], gps_hz=1)
    seg = res["segments"][0]; on0, on1 = t0 + seg["t_start_ms"] / 1000.0, t0 + seg["t_end_ms"] / 1000.0
    tmt, pitch, roll, surge = mast_fields(mfit)
    # feines Raster
    g = np.arange(on0, on1, 0.1)
    lat = np.interp(g, gt, la); lon = np.interp(g, gt, lo); spd = np.interp(g, gt, sp) * 3.6
    lat0, lon0 = lat.mean(), lon.mean()
    x = (lon - lon0) * np.cos(np.radians(lat0)) * 111320; y = (lat - lat0) * 111320
    P = np.interp(g, tmt, pitch); R = np.interp(g, tmt, roll); S = np.interp(g, tmt, surge)
    return x, y, dict(Nick=P, Roll=R, Surge=S, Speed=spd)


def colorline(ax, x, y, c, cmap, label, center=False):
    pts = np.array([x, y]).T.reshape(-1, 1, 2)
    segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
    lc = LineCollection(segs, cmap=cmap, lw=4)
    lc.set_array(c); ax.add_collection(lc)
    if center:                       # weiß bei 0, symmetrisch -> rot/blau je Richtung
        m = np.nanpercentile(np.abs(c), 98) or 1.0
        lc.set_clim(-m, m)
    ax.set_xlim(x.min() - 3, x.max() + 3); ax.set_ylim(y.min() - 3, y.max() + 3)
    ax.set_aspect("equal"); ax.set_title(label, fontsize=10, loc="left")
    ax.set_xticks([]); ax.set_yticks([])
    plt.colorbar(lc, ax=ax, fraction=0.046)


RUNS = [("P3 20:26", "fenix_P3_309.fit", None, "mast_P3_314.fit"),
        ("P4 20:38", None, 310, "mast_P4_315.fit")]
COLS = [("Nick", "RdBu_r", "Nickwinkel (°) — weiß=0, rot Nase hoch, blau Nase runter", True),
        ("Roll", "RdBu_r", "Rollwinkel (°) — weiß=0, rot/blau je Seite", True),
        ("Speed", "viridis", "Speed (km/h)", False)]
fig, axes = plt.subplots(len(RUNS), len(COLS), figsize=(16, 9))
for r, (label, ff, ch, mf) in enumerate(RUNS):
    x, y, fields = run_track(ff, ch, mf)
    for cidx, (key, cmap, ttl, ctr) in enumerate(COLS):
        colorline(axes[r, cidx], x, y, fields[key], cmap, f"{label} — {ttl}", center=ctr)
fig.suptitle("Foiling-Tracks eingefärbt: Foil-Lage (Mast) + Speed", y=1.002)
fig.tight_layout(); p = OUT / "19_track_colored.png"; fig.savefig(p, dpi=200, bbox_inches="tight"); print("wrote", p)
