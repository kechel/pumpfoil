"""Track nach Surge (Vortrieb fore/aft) + Wrist-Pump-Marker auf dem Track. 200 dpi."""
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from matplotlib.collections import LineCollection
import numpy as np
import viz


def colorline(ax, x, y, c, cmap, label, center=False):
    pts = np.array([x, y]).T.reshape(-1, 1, 2)
    segs = np.concatenate([pts[:-1], pts[1:]], axis=1)
    lc = LineCollection(segs, cmap=cmap, lw=4); lc.set_array(c); ax.add_collection(lc)
    if center:
        m = np.nanpercentile(np.abs(c), 98) or 1.0; lc.set_clim(-m, m)
    ax.set_xlim(x.min() - 3, x.max() + 3); ax.set_ylim(y.min() - 3, y.max() + 3)
    ax.set_aspect("equal"); ax.set_title(label, fontsize=10, loc="left"); ax.set_xticks([]); ax.set_yticks([])
    plt.colorbar(lc, ax=ax, fraction=0.046)


fig, axes = plt.subplots(len(viz.RUNS), 2, figsize=(15, 9))
for r, (label, ff, ch, mf) in enumerate(viz.RUNS):
    d = viz.run_data(ff, ch, mf)
    colorline(axes[r, 0], d["x"], d["y"], d["fields"]["Surge"], "RdBu_r",
              f"{label} — Surge/Vortrieb (rot=vorwärts, blau=zurück)", center=True)
    # Track (grau) + Pump-Marker
    ax = axes[r, 1]
    ax.plot(d["x"], d["y"], color="0.8", lw=3, zorder=1)
    ax.scatter(d["px"], d["py"], c="tab:red", s=45, zorder=2, edgecolor="white", lw=0.5)
    ax.set_aspect("equal"); ax.set_xticks([]); ax.set_yticks([])
    ax.set_title(f"{label} — {d['npump']} Pump-Marker auf dem Track", fontsize=10, loc="left")
fig.suptitle("Track nach Vortrieb (Surge) + Pump-Marker", y=1.002)
fig.tight_layout(); p = viz.OUT / "20_track_surge_pumps.png"; fig.savefig(p, dpi=200, bbox_inches="tight"); print("wrote", p)
