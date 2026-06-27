"""Foil-Lage (Gravitation) + Wrist↔Mast-Kohärenz im Foiling-Fenster (P3).

A) Mast-Attitude: Low-Pass(<0.5 Hz) der Accel = Gravitationsrichtung im Geräteframe.
   Kipp-Winkel ggü. mittlerer Lage (mount-agnostisch: braucht keine Achs-Identifikation)
   -> oszilliert die Foil-Lage mit der Pump-Kadenz? + Heave (dyn. Accel entlang Gravitation).
B) Kohärenz: beide Uhren auf 10 Hz resampled, Heave-Signal -> teilen sie den Pump-Rhythmus?
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt, welch, coherence
import lib

OUT = lib.Path(__file__).parent / "out"
FX, FR, LABEL = 309, 314, "P3 20:26"


def foil_window(fx):
    g = lib.load_gps(fx); t0 = lib.start_unix(fx)
    gt = t0 + np.array([r[0] for r in g]) / 1000.0
    gs = np.array([r[3] for r in g]) * 3.6
    fast = gt[gs > 10]
    return fast.min(), fast.max()


def grab(sid, t_lo, t_hi):
    a = lib.load_accel(sid); t = lib.accel_abs_t(sid)
    m = (t >= t_lo) & (t <= t_hi)
    return t[m], a[m], lib.HZ[sid]


def split(a, hz):
    """gravity (lowpass), heave (dyn. entlang mittlerer Gravitation), tilt-deg(t)."""
    bg, ag = butter(2, 0.5 / (hz / 2), btype="low")
    grav = filtfilt(bg, ag, a, axis=0)
    g0 = grav.mean(0); g0u = g0 / np.linalg.norm(g0)
    dyn = a - grav
    heave = dyn @ g0u
    gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
    cosang = np.clip(gu @ g0u, -1, 1)
    tilt = np.degrees(np.arccos(cosang))
    return heave, tilt, np.degrees(np.arccos(np.clip(g0u[2], -1, 1)))


t_lo, t_hi = foil_window(FX)
fig, axes = plt.subplots(2, 2, figsize=(14, 8))

# --- A) Mast-Attitude ---
tm, am, hzm = grab(FR, t_lo, t_hi)
heave_m, tilt_m, base_m = split(am, hzm)
tm0 = tm - tm.min()
ax = axes[0, 0]
ax.plot(tm0, tilt_m, color="tab:red", lw=0.9)
ax.set_title(f"{LABEL} Mast-Kippwinkel ggü. mittl. Lage (Foil-Attitude-Oszillation)", fontsize=10, loc="left")
ax.set_xlabel("t (s)"); ax.set_ylabel("Tilt (°)")

ax = axes[0, 1]
ax.plot(tm0, heave_m, color="tab:red", lw=0.8, label="Mast Heave")
ax.set_title(f"{LABEL} Mast-Heave (dyn. Accel entlang Gravitation)", fontsize=10, loc="left")
ax.set_xlabel("t (s)"); ax.set_ylabel("a (g)"); ax.legend(fontsize=8)

# Spektrum von Tilt & Heave (Mast) — wo liegt die Foil-Oszillation?
ax = axes[1, 0]
for sig, name, c in ((tilt_m - tilt_m.mean(), "Tilt", "tab:purple"), (heave_m, "Heave", "tab:red")):
    f, p = welch(sig, fs=hzm, nperseg=min(len(sig), hzm * 8))
    fpk = f[(f > 0.3) & (f < 2.5)][np.argmax(p[(f > 0.3) & (f < 2.5)])]
    ax.semilogy(f, p, color=c, lw=1.1, label=f"Mast {name}  fpk={fpk:.2f}Hz ({fpk*60:.0f}/min)")
ax.set_xlim(0, 4); ax.set_title(f"{LABEL} Mast-Spektren: Tilt & Heave", fontsize=10, loc="left")
ax.set_xlabel("Hz"); ax.set_ylabel("PSD"); ax.legend(fontsize=8); ax.axvspan(0.4, 2.5, color="k", alpha=0.04)

# --- B) Kohärenz Wrist <-> Mast (Heave), beide auf 10 Hz ---
tw, aw, hzw = grab(FX, t_lo, t_hi)
heave_w, _, _ = split(aw, hzw)
fs = 10.0
grid = np.arange(max(tw.min(), tm.min()), min(tw.max(), tm.max()), 1 / fs)
hw = np.interp(grid, tw, heave_w)
hm = np.interp(grid, tm, heave_m)
f, Cxy = coherence(hw, hm, fs=fs, nperseg=min(len(grid), int(fs * 8)))
ax = axes[1, 1]
ax.plot(f, Cxy, color="tab:green", lw=1.3)
ax.set_xlim(0, 5); ax.set_ylim(0, 1)
ax.set_title(f"{LABEL} Kohärenz Wrist↔Mast (Heave) — teilen sie den Pump-Rhythmus?", fontsize=10, loc="left")
ax.set_xlabel("Hz"); ax.set_ylabel("Kohärenz"); ax.axvspan(0.4, 2.5, color="k", alpha=0.04)
for fp in (0.5, 1.5):
    ax.axvline(fp, color="gray", ls=":", lw=0.8)

print(f"Mast mittl. Tilt-Basis ggü. z-Achse: {base_m:.0f}°")
print(f"Tilt RMS: {tilt_m.std():.2f}°  Heave RMS Mast: {heave_m.std():.3f}g  Wrist: {heave_w.std():.3f}g")
top = f[(f > 0.4) & (f < 2.5)][np.argmax(Cxy[(f > 0.4) & (f < 2.5)])]
print(f"Höchste Kohärenz im Pump-Band bei {top:.2f} Hz = {top*60:.0f}/min  (C={Cxy[(f>0.4)&(f<2.5)].max():.2f})")

fig.tight_layout()
p = OUT / "03_orientation_coherence.png"
fig.savefig(p, dpi=160, bbox_inches="tight")
print("wrote", p)
