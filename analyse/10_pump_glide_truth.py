"""Ground-Truth-Check der drei Produkt-Detektoren an P3 & P4 (beide Uhren voll).

Mast sitzt am Foil -> Wahrheit für "pumpt gerade?" (Pitch-Oszillation) und "fliegt noch?"
(Lage). Wrist+GPS = was das Produkt hat. Zeitleiste durch Lauf + Auslaufen:
  1) GPS-Speed (km/h), On-Foil-Fenster (Webseiten-Detektor) schraffiert
  2) Wrist-Pump-Aktivität (bandpass |a_dyn| 0.8-2.5Hz, gleitende RMS)
  3) Mast-Foil-Pump (bandpass Pitch 0.3-1.5Hz, gleitende RMS) = Pump-Wahrheit
  4) Mast-Lage (Kippwinkel ggü. Flug-Mittel) = fliegt vs. abgesackt
Zeigt v.a. das AUSLAUFEN: Speed noch hoch, aber Pump-Aktivität ~0 = Gleiten; dann Foil-Drop.
"""
import sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt
import lib, fitlib
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.gps import analyze_gps

FITS = lib.Path(__file__).parent / "fits"
OUT = lib.Path(__file__).parent / "out"


def srms(x, hz, win_s=2.0):
    w = max(int(hz * win_s), 1)
    return np.sqrt(np.convolve(x**2, np.ones(w) / w, mode="same"))


def bp(x, hz, lo, hi):
    b, a = butter(2, [lo / (hz / 2), hi / (hz / 2)], "band")
    return filtfilt(b, a, x, axis=0)


def mast_pitch_tilt(t, a, hz):
    bg, ag = butter(2, 0.5 / (hz / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
    g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
    gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
    tiltvec = gu - (gu @ g0u)[:, None] * g0u
    ex = np.array([1.0, 0, 0]); ef = ex - (ex @ g0u) * g0u; ef /= np.linalg.norm(ef)
    pitch = np.degrees(np.arcsin(np.clip(tiltvec @ ef, -1, 1)))
    tilt = np.degrees(np.arccos(np.clip(gu @ g0u, -1, 1)))
    return pitch, tilt


RUNS = [("P3 20:26", "mast_P3_314.fit", "fenix_P3_309.fit", None),
        ("P4 20:38", "mast_P4_315.fit", None, 310)]

fig, axes = plt.subplots(4, 2, figsize=(15, 10), sharex="col")
for col, (label, mfit, ffit, chunk) in enumerate(RUNS):
    tm, am = fitlib.load_fit_accel(str(FITS / mfit)); hzm = round(len(tm) / (tm[-1] - tm[0]))
    if ffit:
        tf, af = fitlib.load_fit_accel(str(FITS / ffit)); hzf = round(len(tf) / (tf[-1] - tf[0]))
        sm, gt0 = fitlib.load_fit_gps_samples(str(FITS / ffit))
        gt = np.array([gt0 + s[0] / 1000.0 for s in sm]); gs = np.array([s[3] or 0 for s in sm]) * 3.6
    else:
        af = None
        g = lib.load_gps(chunk); gt0 = lib.start_unix(chunk)
        gt = gt0 + np.array([r[0] for r in g]) / 1000.0; gs = np.array([r[3] for r in g]) * 3.6
        sm = [[r[0], r[1], r[2], r[3], None, r[5] if len(r) > 5 else None] for r in g]
    res = analyze_gps(sm, gps_hz=1)
    seg = res["segments"][0]
    on0, on1 = gt0 + seg["t_start_ms"] / 1000.0, gt0 + seg["t_end_ms"] / 1000.0
    x0, x1 = on0 - 12, on1 + 22                      # Lauf + Vor-/Auslauf

    # GPS
    ax = axes[0, col]
    mg = (gt >= x0) & (gt <= x1)
    ax.plot(gt[mg] - on0, gs[mg], color="tab:green", lw=1.4)
    ax.axvspan(0, on1 - on0, color="tab:green", alpha=0.10)
    ax.axhline(10, color="gray", ls=":", lw=0.6); ax.set_ylim(0, 22)
    ax.set_title(f"{label} — On-Foil {on1-on0:.0f}s (Webseiten-Detektor)", fontsize=10, loc="left")
    ax.set_ylabel("GPS km/h")

    # Wrist-Pump
    ax = axes[1, col]
    if af is not None:
        mw = (tf >= x0) & (tf <= x1)
        dyn = bp(np.linalg.norm(af[mw] - af[mw].mean(0), axis=1), hzf, 0.8, 2.5)
        ax.plot(tf[mw] - on0, srms(dyn, hzf), color="tab:blue", lw=1.0)
    else:
        ax.text(0.5, 0.5, "kein Wrist-FIT (P4: nur Chunk-GPS)", transform=ax.transAxes, ha="center", fontsize=8, color="gray")
    ax.axvspan(0, on1 - on0, color="tab:green", alpha=0.10); ax.set_ylabel("Wrist-Pump\nRMS (g)")

    # Mast-Foil-Pump (Pitch-Oszillation = Wahrheit)
    pitch, tilt = mast_pitch_tilt(tm, am, hzm)
    mm = (tm >= x0) & (tm <= x1)
    ax = axes[2, col]
    pp = bp(pitch, hzm, 0.3, 1.5)[mm]
    ax.plot(tm[mm] - on0, srms(pp, hzm), color="tab:orange", lw=1.1)
    ax.axvspan(0, on1 - on0, color="tab:green", alpha=0.10); ax.set_ylabel("Mast-Foil-Pump\nPitch-RMS (°)")

    # Mast-Lage
    ax = axes[3, col]
    ax.plot(tm[mm] - on0, tilt[mm] - np.median(tilt[mm]), color="tab:purple", lw=0.8)
    ax.axvspan(0, on1 - on0, color="tab:green", alpha=0.10); ax.set_ylabel("Mast-Lage\nTilt (°)")
    ax.set_xlabel("t (s, 0 = On-Foil-Start)")

fig.suptitle("Pump-/On-Foil-/Gleit-Erkennung vs. Foil-Wahrheit (Mast) — Lauf + Auslaufen", y=1.002)
fig.tight_layout()
p = OUT / "10_pump_glide_truth.png"; fig.savefig(p, dpi=150, bbox_inches="tight"); print("wrote", p)
