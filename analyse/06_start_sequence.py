"""Startsequenz P3 genau gelesen (Jans Ablauf):
Board steht auf dem Kopf am Steg -> umdrehen (180°) -> Foil eintauchen -> 1-5s konzentrieren
-> zwei Schritte + Board mit der Hand beschleunigen -> Sprung + Landung aufs Board
(kurzer kräftiger Impuls, auf BEIDEN Uhren) -> Anpumpen -> Foiling.

fenix-Wrist aus FIT (100 Hz), FR55-Mast aus Chunks (10 Hz), gemeinsame absolute Zeit
(x = s seit Mast-Start). Sucht den koinzidenten Sprung-Lande-Impuls als Sync-Punkt.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt
import lib, fitlib

OUT = lib.Path(__file__).parent / "out"
FIT = "/tmp/claude-1000/-home-jan-garmin-connect-iq/6006ad19-1592-431f-b6fe-6bf07845f283/scratchpad/fit_p3/23399673593_ACTIVITY.fit"

tf, af = fitlib.load_fit_accel(FIT)            # fenix wrist 100 Hz, abs unix
tm = lib.accel_abs_t(314); am = lib.load_accel(314)   # FR55 mast 10 Hz, abs unix
t0 = tm[0]                                     # x-Ursprung = Mast-Start

# Geschwindigkeit aus dem FIT (native enhanced_speed — zuverlässiger als Chunk-GPS,
# dessen t_ms hier unsauber/lückig ist).
fg = fitlib.load_fit_gps(FIT)
gt = np.array([x[0] for x in fg]); gs = np.array([x[1] for x in fg]) * 3.6
o = np.argsort(gt); gt, gs = gt[o], gs[o]
fl = gt[gs > 10].min()                         # Foiling-Start (abs, FIT)

# dynamische Beschleunigung (Gravitation raus) + Betrag
def dynmag(t, a):
    hz = 1.0 / np.median(np.diff(t))
    b, ah = butter(2, 0.4 / (hz / 2), "high")
    d = filtfilt(b, ah, a, axis=0)
    return np.linalg.norm(d, axis=1)
mf = dynmag(tf, af); mm = dynmag(tm, am)

# Mast-Orientierung (Gravitation, lowpass) -> z-Komponente zeigt den 180°-Flip
hz_m = 10.0
bg, ag = butter(2, 0.4 / (hz_m / 2), "low")
grav = filtfilt(bg, ag, am, axis=0)
gz = grav[:, 2] / np.linalg.norm(grav, axis=1)   # cos(Winkel zur Geräte-z): +1<->-1 = Flip

win = (tm >= t0) & (tm <= fl + 12)
xlim = (0, fl + 12 - t0)

fig, axes = plt.subplots(3, 1, figsize=(15, 9), sharex=True)

ax = axes[0]
ax.plot(tm[win] - t0, gz[win], color="tab:purple", lw=1.2)
ax.axhline(0, color="gray", lw=0.5, ls=":")
ax.set_ylabel("Mast Gravitation·z\n(+1↔−1 = 180°-Flip)"); ax.set_ylim(-1.1, 1.1)
ax.set_title("P3 Startsequenz — Mast-Orientierung: der 180°-Flip ist das Umdrehen am Steg, NICHT der Start", fontsize=10, loc="left")

ax = axes[1]
wf = (tf >= t0) & (tf <= fl + 12)
ax.plot(tf[wf] - t0, mf[wf], color="tab:blue", lw=0.5, alpha=0.8, label="fenix Wrist |a_dyn| (100Hz)")
ax.plot(tm[win] - t0, mm[win], color="tab:red", lw=0.9, label="FR55 Mast |a_dyn| (10Hz)")
# Echter Start: groesster fenix-Impuls im Fenster kurz VOR der Speed-Rampe = Anschieben+Sprung+Landung
wlo, whi = fl - 16, fl
sel = (tf >= wlo) & (tf <= whi)
jump = tf[sel][np.argmax(mf[sel])]
ax.axvline(jump - t0, color="k", ls="--", lw=1.4)
ax.annotate(f"Anschieben + Sprung + Landung\n(fenix {mf[sel].max():.1f}g; Mast verpasst Spitze @10Hz)",
            (jump - t0, ax.get_ylim()[1] * 0.82), fontsize=8, ha="center", color="k")
# frueheres Ereignis (gehoert NICHT zu diesem Lauf)
ax.annotate("früheres Ereignis\n(Vorbereiten/Warten)", (22.8, ax.get_ylim()[1] * 0.5),
            fontsize=7, ha="center", color="gray")
ax.axvline(fl - t0, color="tab:green", ls="-", lw=1.5)
ax.annotate("Foiling >10 km/h", (fl - t0, ax.get_ylim()[1] * 0.6), fontsize=8, color="tab:green")
ax.set_ylabel("|a_dyn| (g)"); ax.legend(fontsize=8, loc="upper left")

ax = axes[2]
wg = (gt >= t0) & (gt <= fl + 12)
ax.plot(gt[wg] - t0, gs[wg], color="tab:green", lw=1.6)
ax.axhline(10, color="gray", lw=0.6, ls=":"); ax.set_ylabel("fenix GPS km/h")
ax.set_xlabel("t (s, seit Mast-Start)"); ax.set_xlim(*xlim)

print(f"Echter Start (Sprung+Landung) bei mast-t {jump-t0:.1f}s, fenix {mf[sel].max():.1f}g")
print(f"Foiling >10 km/h ab mast-t {fl-t0:.1f}s")
fig.tight_layout()
p = OUT / "06_start_sequence.png"
fig.savefig(p, dpi=160, bbox_inches="tight")
print("wrote", p)
