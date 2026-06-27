"""Pitch-Pump-Kopplung (Jans Modell): Foil pitcht über den 85cm-Mast-Hebel fore/aft,
wenn das Board mit den Beinen gekippt wird. Runterdrücken -> Nase runter (Vortrieb);
leicht werden -> Nase hoch (steigen). Erwartung: Pitch oszilliert ~1x je Pump-Zyklus
und ist phasengekoppelt an die vertikale Pump-Last (Heave).

Zerlegt den Mast-Kippwinkel in 2 Komponenten in der Ebene ⊥ mittlere Gravitation
(Geräte-x bzw. -y projiziert; x ≈ Start-Knopf ≈ Fahrtrichtung -> Pitch). PCA zeigt,
ob das Rocking 1D (reine Pitch-Achse) ist. Phase Heave↔Pitch testet das Modell.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt, welch, hilbert
import lib

OUT = lib.Path(__file__).parent / "out"
FX, FR, LABEL = 309, 314, "P3 20:26"

g = lib.load_gps(FX); t0 = lib.start_unix(FX)
gt = t0 + np.array([r[0] for r in g]) / 1000.0; gs = np.array([r[3] for r in g]) * 3.6
fast = gt[gs > 10]; fl, fh = fast.min(), fast.max()
a = lib.load_accel(FR); t = lib.accel_abs_t(FR); hz = lib.HZ[FR]
m = (t >= fl) & (t <= fh); a, tt = a[m], t[m] - t[m].min()

bg, ag = butter(2, 0.5 / (hz / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
# 2 Basisvektoren in der Ebene ⊥ g0u: e_fwd aus Geräte-x (≈ Start-Knopf/Fahrtrichtung), e_lat ⊥
ex = np.array([1.0, 0, 0])
e_fwd = ex - (ex @ g0u) * g0u; e_fwd /= np.linalg.norm(e_fwd)
e_lat = np.cross(g0u, e_fwd)
tiltvec = gu - (gu @ g0u)[:, None] * g0u           # horiz. Kippvektor (rad-ähnlich, klein)
pitch = np.degrees(np.arcsin(np.clip(tiltvec @ e_fwd, -1, 1)))   # fore/aft
roll = np.degrees(np.arcsin(np.clip(tiltvec @ e_lat, -1, 1)))    # seitlich
heave = (a - grav) @ g0u

# PCA des 2D-Kippens: wie 1D ist das Rocking?
P = np.c_[tiltvec @ e_fwd, tiltvec @ e_lat]
_, sv, _ = np.linalg.svd(P - P.mean(0), full_matrices=False)
aniso = sv[0] / sv[1]

fig, axes = plt.subplots(2, 2, figsize=(14, 8))
ax = axes[0, 0]
ax.plot(tt, pitch - pitch.mean(), color="tab:orange", lw=1.0, label=f"Pitch (fore/aft) RMS={pitch.std():.1f}°")
ax.plot(tt, roll - roll.mean(), color="tab:blue", lw=0.8, alpha=0.7, label=f"Roll (seitl.) RMS={roll.std():.1f}°")
ax.set_title(f"{LABEL} Mast-Kippung zerlegt — Anisotropie {aniso:.1f}x (>1.5 ⇒ bevorz. Achse)", fontsize=10, loc="left")
ax.set_xlabel("t (s)"); ax.set_ylabel("°"); ax.legend(fontsize=8)

ax = axes[0, 1]
for sig, n, c in ((pitch - pitch.mean(), "Pitch", "tab:orange"), (roll - roll.mean(), "Roll", "tab:blue"),
                  (heave, "Heave", "tab:red")):
    f, p = welch(sig, fs=hz, nperseg=min(len(sig), hz * 8))
    sel = (f > 0.3) & (f < 2.5); fpk = f[sel][np.argmax(p[sel])]
    ax.semilogy(f, p / p.max(), color=c, lw=1.1, label=f"{n} fpk={fpk:.2f}Hz ({fpk*60:.0f}/min)")
ax.set_xlim(0, 3); ax.set_title("Spektren (norm.) — gemeinsame Propulsions-Frequenz?", fontsize=10, loc="left")
ax.set_xlabel("Hz"); ax.legend(fontsize=8); ax.axvspan(0.4, 1.5, color="k", alpha=0.05)

# Phase Heave <-> Pitch um die Propulsionsfrequenz (Bandpass), Hilbert-Phasendiff
f, p = welch(pitch, fs=hz, nperseg=min(len(pitch), hz * 8)); sel = (f > 0.3) & (f < 1.5)
fp = f[sel][np.argmax(p[sel])]
bb, aa = butter(2, [max(0.2, fp - 0.3) / (hz / 2), (fp + 0.3) / (hz / 2)], "band")
hb = filtfilt(bb, aa, heave); pb = filtfilt(bb, aa, pitch)
ph = np.angle(hilbert(hb)) - np.angle(hilbert(pb))
dphi = np.degrees(np.angle(np.mean(np.exp(1j * ph))))
ax = axes[1, 0]
ax.plot(tt, hb / (np.abs(hb).max() + 1e-9), color="tab:red", lw=1.0, label="Heave (norm.)")
ax.plot(tt, pb / (np.abs(pb).max() + 1e-9), color="tab:orange", lw=1.0, label="Pitch (norm.)")
ax.set_title(f"{LABEL} Heave vs Pitch @ {fp:.2f}Hz — Phasenlag {dphi:.0f}°", fontsize=10, loc="left")
ax.set_xlabel("t (s)"); ax.legend(fontsize=8)

ax = axes[1, 1]
ax.scatter(pb, hb, s=6, c=tt, cmap="viridis")
ax.set_xlabel("Pitch (bandpass)"); ax.set_ylabel("Heave (bandpass)")
ax.set_title("Pitch–Heave-Phasenraum (Farbe=Zeit)", fontsize=10, loc="left")

print(f"Pitch-RMS={pitch.std():.1f}°  Roll-RMS={roll.std():.1f}°  Anisotropie={aniso:.2f}")
print(f"Propulsions-Pitch-Frequenz {fp:.2f} Hz = {fp*60:.0f}/min")
print(f"Phasenlag Heave→Pitch: {dphi:.0f}°  (0°=Nase-runter-beim-Runterdrücken, 180°=Gegenphase)")
fig.tight_layout()
pp = OUT / "05_pitch_pump.png"
fig.savefig(pp, dpi=160, bbox_inches="tight")
print("wrote", pp)
