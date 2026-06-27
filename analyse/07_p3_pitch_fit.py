"""P3 auf den VOLLEN FIT-Daten: Jans Pitch-Pump-Modell mit gutem Datensatz testen.
fenix Wrist 100 Hz + FR55 Mast 25 Hz (statt 10 Hz/42 s-Stummel), volle Länge.

Foiling-Fenster aus fenix-FIT-GPS (>10 km/h). Mast: Pitch (fore/aft) & Roll aus
Gravitation, Heave; Spektren + Phase Heave↔Pitch. Wrist: Pump-Kadenz zum Vergleich.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt, welch, hilbert
import lib, fitlib

OUT = lib.Path(__file__).parent / "out"
FITS = lib.Path(__file__).parent / "fits"
tf, af = fitlib.load_fit_accel(str(FITS / "fenix_P3_309.fit"))     # wrist 100 Hz
tm, am = fitlib.load_fit_accel(str(FITS / "mast_P3_314.fit"))      # mast 25 Hz
hz_m = round(len(tm) / (tm[-1] - tm[0]))

# Foiling-Fenster aus fenix-FIT-GPS
fg = fitlib.load_fit_gps(str(FITS / "fenix_P3_309.fit"))
gt = np.array([x[0] for x in fg]); gs = np.array([x[1] for x in fg]) * 3.6
o = np.argsort(gt); gt, gs = gt[o], gs[o]
fast = gt[gs > 10]; fl, fh = fast.min(), fast.max()
print(f"Foiling-Fenster abs {fl:.0f}..{fh:.0f} ({fh-fl:.0f}s), Mast {hz_m}Hz")

m = (tm >= fl) & (tm <= fh)
a = am[m]; tt = tm[m] - tm[m].min()

bg, ag = butter(2, 0.5 / (hz_m / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
ex = np.array([1.0, 0, 0])
e_fwd = ex - (ex @ g0u) * g0u; e_fwd /= np.linalg.norm(e_fwd)
e_lat = np.cross(g0u, e_fwd)
tiltvec = gu - (gu @ g0u)[:, None] * g0u
pitch = np.degrees(np.arcsin(np.clip(tiltvec @ e_fwd, -1, 1)))
roll = np.degrees(np.arcsin(np.clip(tiltvec @ e_lat, -1, 1)))
heave = (a - grav) @ g0u

fig, axes = plt.subplots(2, 2, figsize=(15, 8))
ax = axes[0, 0]
ax.plot(tt, pitch - pitch.mean(), color="tab:orange", lw=1.0, label=f"Pitch RMS={pitch.std():.1f}°")
ax.plot(tt, roll - roll.mean(), color="tab:blue", lw=0.8, alpha=0.7, label=f"Roll RMS={roll.std():.1f}°")
ax.set_title(f"P3 Mast 25Hz — Foil-Lage im Foiling ({fh-fl:.0f}s)", fontsize=10, loc="left")
ax.set_xlabel("t (s)"); ax.set_ylabel("°"); ax.legend(fontsize=8)

ax = axes[0, 1]
for sig, n, c in ((pitch - pitch.mean(), "Pitch", "tab:orange"), (heave, "Heave", "tab:red")):
    f, p = welch(sig, fs=hz_m, nperseg=min(len(sig), hz_m * 8))
    sel = (f > 0.3) & (f < 2.5); fpk = f[sel][np.argmax(p[sel])]
    ax.semilogy(f, p / p.max(), color=c, lw=1.2, label=f"{n} fpk={fpk:.2f}Hz ({fpk*60:.0f}/min)")
# Wrist-Pump zum Vergleich
mw = (tf >= fl) & (tf <= fh)
bw, aw = butter(2, 0.3 / (100 / 2), "high"); dw = filtfilt(bw, aw, af[mw], axis=0)
sigw = np.linalg.norm(dw, axis=1)
fw, pw = welch(sigw - sigw.mean(), fs=100, nperseg=min(mw.sum(), 800))
selw = (fw > 0.5) & (fw < 2.5); fpw = fw[selw][np.argmax(pw[selw])]
ax.semilogy(fw, pw / pw.max(), color="tab:green", lw=1.0, alpha=0.7, label=f"Wrist Pump fpk={fpw:.2f}Hz ({fpw*60:.0f}/min)")
ax.set_xlim(0, 3); ax.set_title("Spektren — Foil-Pitch vs Wrist-Pump", fontsize=10, loc="left")
ax.set_xlabel("Hz"); ax.legend(fontsize=8); ax.axvspan(0.4, 2.0, color="k", alpha=0.05)

# Phase Heave<->Pitch um Pitch-Peak
f, p = welch(pitch, fs=hz_m, nperseg=min(len(pitch), hz_m * 8)); sel = (f > 0.4) & (f < 2.0)
fp = f[sel][np.argmax(p[sel])]
bb, aa = butter(2, [max(0.2, fp - 0.3) / (hz_m / 2), (fp + 0.3) / (hz_m / 2)], "band")
hb = filtfilt(bb, aa, heave); pb = filtfilt(bb, aa, pitch)
ph = np.degrees(np.angle(np.mean(np.exp(1j * (np.angle(hilbert(hb)) - np.angle(hilbert(pb)))))))
ax = axes[1, 0]
ax.plot(tt, hb / (np.abs(hb).max() + 1e-9), color="tab:red", lw=1.0, label="Heave")
ax.plot(tt, pb / (np.abs(pb).max() + 1e-9), color="tab:orange", lw=1.0, label="Pitch")
ax.set_title(f"P3 Heave vs Pitch @ {fp:.2f}Hz — Phasenlag {ph:.0f}°", fontsize=10, loc="left")
ax.set_xlabel("t (s)"); ax.legend(fontsize=8)

ax = axes[1, 1]
ax.scatter(pb, hb, s=8, c=tt, cmap="viridis")
ax.set_xlabel("Pitch (bandpass)"); ax.set_ylabel("Heave (bandpass)")
ax.set_title("Pitch–Heave-Phasenraum (Farbe=Zeit)", fontsize=10, loc="left")

print(f"Pitch-RMS={pitch.std():.1f}° Roll-RMS={roll.std():.1f}°  Pitch-fpk={fp:.2f}Hz ({fp*60:.0f}/min)")
print(f"Wrist-Pump fpk={fpw:.2f}Hz ({fpw*60:.0f}/min)  Phasenlag Heave→Pitch={ph:.0f}°")
fig.tight_layout()
pp = OUT / "07_p3_pitch_fit.png"
fig.savefig(pp, dpi=160, bbox_inches="tight")
print("wrote", pp)
