"""Pump-Kadenz: Mast vs. Wrist im Foiling-Fenster.

Pro Uhr: Gravitation per Low-Pass entfernen -> dynamische Beschleunigung ->
Haupt-Oszillationsachse per PCA -> 1D-Pump-Signal -> Welch-PSD.
Dominante Frequenz im 0.4–2.5 Hz-Band = Pump-Kadenz. Prominenz = Peak / Median(Band)
= „wie sauber ist das Pump-Signal" (Kernfrage: Mast sauberer als Wrist?).
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt, welch
import lib

OUT = lib.Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
BAND = (0.4, 2.5)  # plausible Pump-Kadenz Hz


def foil_window(fx):
    """abs. Start/Ende des Foiling-Laufs (>10 km/h) der Wrist-Uhr."""
    g = lib.load_gps(fx)
    t0 = lib.start_unix(fx)
    gt = t0 + np.array([r[0] for r in g]) / 1000.0
    gs = np.array([r[3] for r in g]) * 3.6
    fast = gt[gs > 10]
    return (fast.min(), fast.max()) if len(fast) else None


def pump_signal(sid, t_lo, t_hi):
    """1D-Pump-Signal (g, hochpassgefiltert, PCA-Hauptachse) im abs. Zeitfenster."""
    a = lib.load_accel(sid)
    t = lib.accel_abs_t(sid)
    m = (t >= t_lo) & (t <= t_hi)
    a, t = a[m], t[m]
    hz = lib.HZ[sid]
    if len(a) < hz * 3:
        return None, None, hz, len(a)
    # Gravitation raus: Hochpass 0.3 Hz
    b, ah = butter(2, 0.3 / (hz / 2), btype="high")
    dyn = filtfilt(b, ah, a, axis=0)
    # Hauptachse der Oszillation (PCA)
    u, s, vt = np.linalg.svd(dyn - dyn.mean(0), full_matrices=False)
    sig = dyn @ vt[0]
    return t - t.min(), sig, hz, len(a)


def dominant(sig, hz):
    f, p = welch(sig, fs=hz, nperseg=min(len(sig), int(hz * 8)))
    band = (f >= BAND[0]) & (f <= BAND[1])
    fb, pb = f[band], p[band]
    fpk = fb[np.argmax(pb)]
    prom = pb.max() / np.median(pb)
    return f, p, fpk, prom


CASES = [(309, 314, "P3 20:26"), (311, 316, "P5 20:53")]
fig, axes = plt.subplots(len(CASES), 2, figsize=(14, 4.2 * len(CASES)))
print(f"{'Paar':10s} {'Uhr':14s} {'n':>5s} {'Kadenz Hz':>10s} {'/min':>6s} {'Prominenz':>10s}")
for row, (fx, fr, label) in enumerate(CASES):
    win = foil_window(fx)
    if not win:
        continue
    for sid, color in ((fx, "tab:blue"), (fr, "tab:red")):
        t, sig, hz, n = pump_signal(sid, *win)
        ax_t, ax_p = axes[row]
        if sig is None:
            print(f"{label:10s} {lib.ROLE[sid]:14s} {n:5d}  (zu kurz im Fenster)")
            continue
        f, p, fpk, prom = dominant(sig, hz)
        print(f"{label:10s} {lib.ROLE[sid]:14s} {n:5d} {fpk:10.2f} {fpk*60:6.0f} {prom:10.1f}")
        ax_t.plot(t, sig, color=color, lw=0.7, label=f"{lib.ROLE[sid]} ({hz}Hz)")
        ax_p.semilogy(f, p, color=color, lw=1.1, label=f"{lib.ROLE[sid]}  fpk={fpk:.2f}Hz ({fpk*60:.0f}/min) prom={prom:.0f}")
        ax_p.axvline(fpk, color=color, ls=":", lw=0.8)
    ax_t, ax_p = axes[row]
    ax_t.set_title(f"{label}  Pump-Signal (PCA-Hauptachse) im Foiling-Fenster", fontsize=10, loc="left")
    ax_t.set_xlabel("t (s)"); ax_t.set_ylabel("a (g, hochpass)"); ax_t.legend(fontsize=8)
    ax_p.set_title(f"{label}  Welch-PSD — Pump-Kadenz", fontsize=10, loc="left")
    ax_p.set_xlabel("Hz"); ax_p.set_ylabel("PSD"); ax_p.set_xlim(0, 4); ax_p.legend(fontsize=8)
    ax_p.axvspan(*BAND, color="k", alpha=0.04)

fig.tight_layout()
p = OUT / "02_pump_spectrum.png"
fig.savefig(p, dpi=160, bbox_inches="tight")
print("wrote", p)
