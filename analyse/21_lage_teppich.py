"""Lage-Teppich: Nick/Roll/Surge über die Zeit als farbige Streifen (weiß=0, rot/blau). 200 dpi.
Zeigt die Foil-Lage-Dynamik über den ganzen Lauf auf einen Blick."""
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
import numpy as np
import viz

ROWS = [("Nick", "Nickwinkel (°)"), ("Roll", "Rollwinkel (°)"), ("Surge", "Vortrieb (g)")]
fig, axes = plt.subplots(len(viz.RUNS), 1, figsize=(15, 7))
for r, (label, ff, ch, mf) in enumerate(viz.RUNS):
    d = viz.run_data(ff, ch, mf); t = d["fields"]["t"]
    ax = axes[r]
    img = []
    for key, _ in ROWS:
        v = d["fields"][key]; m = np.nanpercentile(np.abs(v), 98) or 1.0
        img.append(v / m)   # auf [-1,1] normiert je Größe
    img = np.array(img)
    im = ax.imshow(img, aspect="auto", cmap="RdBu_r", vmin=-1, vmax=1,
                   extent=[t[0], t[-1], 0, len(ROWS)], origin="lower")
    ax.set_yticks([0.5, 1.5, 2.5]); ax.set_yticklabels([r2[1] for r2 in ROWS][::-1], fontsize=8)
    # Pump-Marker als Ticks oben
    for px_t in (d["px"] * 0,):  # placeholder
        pass
    ax.set_title(f"{label} — Lage-Teppich (weiß=0, rot/blau je Richtung, je Zeile auto-skaliert)", fontsize=10, loc="left")
    ax.set_xlabel("t (s ab On-Foil-Start)")
fig.colorbar(im, ax=axes, fraction=0.03, label="normiert (−1…+1)")
p = viz.OUT / "21_lage_teppich.png"; fig.savefig(p, dpi=200, bbox_inches="tight"); print("wrote", p)
