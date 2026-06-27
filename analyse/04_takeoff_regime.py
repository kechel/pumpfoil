"""Mast über die ganze Aufnahme: Regimewechsel Anpumpen -> Fliegen (Takeoff).

Tilt(t) + gleitende Heave-RMS + Spektrogramm des Mast-|accel|. Foiling-Fenster (Wrist-GPS)
schraffiert. Frage: Sieht man am Mast den Übergang Verdrängung -> Foiling?
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt, spectrogram
import lib

OUT = lib.Path(__file__).parent / "out"
FX, FR, LABEL = 309, 314, "P3 20:26"

g = lib.load_gps(FX); t0g = lib.start_unix(FX)
gt = t0g + np.array([r[0] for r in g]) / 1000.0
gs = np.array([r[3] for r in g]) * 3.6
fast = gt[gs > 10]
fl, fh = fast.min(), fast.max()

a = lib.load_accel(FR); t = lib.accel_abs_t(FR); hz = lib.HZ[FR]
tt = t - t.min()
fl0, fh0 = fl - t.min(), fh - t.min()

bg, ag = butter(2, 0.5 / (hz / 2), btype="low")
grav = filtfilt(bg, ag, a, axis=0)
g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
tilt = np.degrees(np.arccos(np.clip(gu @ g0u, -1, 1)))
dyn = a - grav
heave = dyn @ g0u
# gleitende RMS (2 s)
w = int(hz * 2)
rms = np.sqrt(np.convolve(heave**2, np.ones(w) / w, mode="same"))

fig, axes = plt.subplots(3, 1, figsize=(13, 9), sharex=True)
ax = axes[0]
ax.plot(tt, tilt, color="tab:purple", lw=0.8)
ax.set_ylabel("Mast Tilt (°)"); ax.axvspan(fl0, fh0, color="tab:green", alpha=0.12, label="Foiling (Wrist-GPS)")
ax.set_title(f"{LABEL} Mast über die ganze Aufnahme — Regimewechsel Anpumpen → Fliegen", fontsize=11, loc="left")
ax.legend(fontsize=8)

ax = axes[1]
ax.plot(tt, rms, color="tab:red", lw=1.0)
ax.set_ylabel("Heave-RMS (g, 2s)"); ax.axvspan(fl0, fh0, color="tab:green", alpha=0.12)

ax = axes[2]
f, ts, Sxx = spectrogram(heave, fs=hz, nperseg=int(hz * 4), noverlap=int(hz * 3.5))
ax.pcolormesh(ts, f, 10 * np.log10(Sxx + 1e-9), shading="gouraud", cmap="magma")
ax.set_ylim(0, 5); ax.set_ylabel("Hz"); ax.set_xlabel("t (s)")
ax.axvspan(fl0, fh0, color="tab:green", alpha=0.18)
ax.set_title("Spektrogramm Mast-Heave", fontsize=10, loc="left")

print(f"Pre-Foiling Tilt-RMS: {tilt[tt<fl0].std():.2f}°  Foiling: {tilt[(tt>=fl0)&(tt<=fh0)].std():.2f}°")
print(f"Pre-Foiling Heave-RMS: {heave[tt<fl0].std():.3f}g  Foiling: {heave[(tt>=fl0)&(tt<=fh0)].std():.3f}g")
fig.tight_layout()
p = OUT / "04_takeoff_regime.png"
fig.savefig(p, dpi=160, bbox_inches="tight")
print("wrote", p)
