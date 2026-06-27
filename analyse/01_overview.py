"""Overview je Paar: |Accel| Mast vs. Wrist auf gemeinsamer absoluter Zeitachse,
fenix-GPS-Speed überlagert, Foiling-Fenster (>10 km/h) schraffiert.

Zeigt: Überlappen sich die Aufnahmen? Wann ist Foiling? Wie sieht das Mast-Signal
gegenüber dem Wrist-Signal in derselben Phase aus?
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import lib

OUT = lib.Path(__file__).parent / "out"
OUT.mkdir(exist_ok=True)
FOIL_MPS = 2.7  # ~10 km/h


def mag(a):
    return np.linalg.norm(a, axis=1) if len(a) else np.array([])


fig, axes = plt.subplots(len(lib.PAIRS), 1, figsize=(13, 3.0 * len(lib.PAIRS)))
for ax, (fx, fr, label) in zip(axes, lib.PAIRS):
    afx, afr = lib.load_accel(fx), lib.load_accel(fr)
    tfx, tfr = lib.accel_abs_t(fx), lib.accel_abs_t(fr)
    t0 = min(tfx[0] if len(tfx) else 1e18, tfr[0] if len(tfr) else 1e18)

    ax.plot(tfx - t0, mag(afx), lw=0.4, color="tab:blue", alpha=0.7, label=f"Wrist |g| (#{fx})")
    ax.plot(tfr - t0, mag(afr), lw=0.5, color="tab:red", alpha=0.8, label=f"Mast |g| (#{fr})")
    ax.set_ylabel("|accel| (g)")
    ax.set_ylim(0, 4)
    ax.set_title(f"{label}  —  Wrist #{fx} (25Hz) vs Mast #{fr} (10Hz)", fontsize=10, loc="left")

    # fenix-GPS-Speed auf zweiter Achse
    g = lib.load_gps(fx)
    if g:
        gt = lib.start_unix(fx) + np.array([r[0] for r in g]) / 1000.0 - t0
        gs = np.array([r[3] for r in g]) * 3.6
        ax2 = ax.twinx()
        ax2.plot(gt, gs, color="tab:green", lw=1.3, label="Wrist GPS km/h")
        ax2.set_ylabel("km/h", color="tab:green")
        ax2.set_ylim(0, 30)
        ax2.tick_params(axis="y", labelcolor="tab:green")
        # Foiling-Fenster schraffieren
        fast = gs > FOIL_MPS * 3.6
        if fast.any():
            ax.fill_between(gt, 0, 4, where=fast, color="tab:green", alpha=0.10, step="mid")

    ax.legend(loc="upper right", fontsize=7)
    ax.set_xlabel("t (s, ab frühestem Start)")

fig.suptitle("Dual-Watch 2026-06-27 — Mast (FR55) vs Wrist (fenix), abs. zeitsynchron", y=1.001)
fig.tight_layout()
p = OUT / "01_overview.png"
fig.savefig(p, dpi=160, bbox_inches="tight")
print("wrote", p)
