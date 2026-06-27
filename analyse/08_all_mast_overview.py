"""Überblick über ALLE FR55-Mast-FITs: Struktur jeder Aufnahme, wo sind Läufe?
Pro Datei: gleitende Heave-RMS (Pump-/Flug-Energie), Pitch (Foil-Lage), Mast-GPS-Speed
(wo unter Wasser ein Fix kam). Foiling-Kandidat = Mast-GPS>8 km/h ODER ruhige Flug-Signatur.
Grundlage für die gepoolte Pro-Lauf-Analyse (09).
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt
import lib, fitlib

OUT = lib.Path(__file__).parent / "out"
FITS = lib.Path(__file__).parent / "fits"
FILES = [
    ("mast_x_2017.fit", "FR55 20:17"),
    ("mast_P3_314.fit", "FR55 20:26 (P3)"),
    ("mast_P4_315.fit", "FR55 20:38 (P4)"),
    ("mast_x_2105.fit", "FR55 21:05"),
    ("mast_x_2113.fit", "FR55 21:13"),
]


def decompose(t, a, hz):
    bg, ag = butter(2, 0.5 / (hz / 2), "low")
    grav = filtfilt(bg, ag, a, axis=0)
    g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
    gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
    tiltvec = gu - (gu @ g0u)[:, None] * g0u
    ex = np.array([1.0, 0, 0]); ef = ex - (ex @ g0u) * g0u; ef /= np.linalg.norm(ef)
    pitch = np.degrees(np.arcsin(np.clip(tiltvec @ ef, -1, 1)))
    heave = (a - grav) @ g0u
    w = int(hz * 2)
    rms = np.sqrt(np.convolve(heave**2, np.ones(w) / w, mode="same"))
    return pitch, rms


fig, axes = plt.subplots(len(FILES), 1, figsize=(15, 2.6 * len(FILES)), sharex=False)
for ax, (fn, label) in zip(axes, FILES):
    t, a = fitlib.load_fit_accel(str(FITS / fn))
    if len(t) < 50:
        ax.set_title(f"{label}: keine Accel"); continue
    hz = round(len(t) / (t[-1] - t[0])); tt = t - t[0]
    pitch, rms = decompose(t, a, hz)
    ax.plot(tt, rms, color="tab:red", lw=0.9, label="Heave-RMS (2s)")
    ax.set_ylabel("Heave-RMS (g)", color="tab:red"); ax.set_ylim(0, 0.4)
    ax.tick_params(axis="y", labelcolor="tab:red")
    ax2 = ax.twinx()
    ax2.plot(tt, pitch - np.median(pitch), color="tab:purple", lw=0.5, alpha=0.5, label="Pitch")
    ax2.set_ylabel("Pitch (°)", color="tab:purple"); ax2.set_ylim(-60, 60)
    ax2.tick_params(axis="y", labelcolor="tab:purple")
    # Mast-GPS-Speed (wo Fix)
    fg = fitlib.load_fit_gps(str(FITS / fn))
    if fg:
        gt = np.array([x[0] for x in fg]) - t[0]; gs = np.array([x[1] for x in fg]) * 3.6
        keep = (gt >= 0) & (gt <= tt[-1])      # nur GPS im Accel-Zeitfenster (Clock-Müll raus)
        gt, gs = gt[keep], gs[keep]; o = np.argsort(gt)
        if gt.size:
            ax3 = ax.twinx(); ax3.spines["right"].set_position(("outward", 42))
            ax3.plot(gt[o], gs[o], color="tab:green", lw=1.2, label="Mast-GPS km/h")
            ax3.set_ylabel("km/h", color="tab:green"); ax3.set_ylim(0, 20)
            ax3.tick_params(axis="y", labelcolor="tab:green")
            ax3.axhline(8, color="tab:green", ls=":", lw=0.6)
    ax.set_xlim(0, tt[-1])
    ax.set_title(f"{label} — {hz}Hz, {tt[-1]:.0f}s", fontsize=10, loc="left")
    ax.set_xlabel("t (s)")

fig.suptitle("Alle FR55-Mast-Aufnahmen — Struktur & Lauf-Kandidaten", y=1.002)
fig.tight_layout()
p = OUT / "08_all_mast_overview.png"
fig.savefig(p, dpi=150, bbox_inches="tight")
print("wrote", p)
