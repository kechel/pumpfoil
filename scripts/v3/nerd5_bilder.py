#!/usr/bin/env python3
"""Grafiken fuer Nerd-Analysen Teil 5 (web/public/nerd5/), aus den echten Messungen. ~/ml-venv.

Quellen: data/ml/v3/haltung.json (Haltung gegen die anderen Laeufe der Session),
data/ml/v3/konstanz.json (Konstanz/Drehrate in 10-s-Fenstern), Lernkurve und Ergebnis-Zahlen
aus docs/DETECTION-V3.md (Stand 30.09.2026). Keine Nutzernamen, keine Session-Nummern Dritter.
Aufruf: ~/ml-venv/bin/python scripts/v3/nerd5_bilder.py
"""
import json
import pathlib

import numpy as np
import matplotlib; matplotlib.use("Agg")
import matplotlib.pyplot as plt

W = pathlib.Path(__file__).resolve().parents[2]
ML = W / "server" / "data" / "ml" / "v3"
AUS = W / "web" / "public" / "nerd5"
BG, AX, GR, TX = "#0f172a", "#334155", "#1e293b", "#e2e8f0"
CY, OR, RO, GRAU = "#22d3ee", "#f59e0b", "#f87171", "#94a3b8"
plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "axes.edgecolor": AX,
                     "axes.labelcolor": TX, "xtick.color": GRAU, "ytick.color": GRAU, "text.color": TX,
                     "grid.color": GR, "font.size": 13, "axes.titlesize": 16, "legend.facecolor": BG,
                     "legend.edgecolor": AX})


def speichern(fig, name):
    fig.savefig(AUS / name, dpi=100, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(AUS / name)


# 1) Ergebnis
fig, ax = plt.subplots(figsize=(16, 7.5))
kz = ["runs on land\n(checked on the map, of 82)", "short runs next to\na car drive", "runs inside ranges riders\nhad removed themselves"]
heute, neu = [81, 25, 73], [19, 1, 24]
y = np.arange(len(kz))
ax.barh(y + 0.2, heute, 0.38, color=GRAU, label="old detection")
ax.barh(y - 0.2, neu, 0.38, color=CY, label="new detection")
for i, (a, b) in enumerate(zip(heute, neu)):
    ax.text(a + 1, i + 0.2, str(a), va="center", color=GRAU, fontsize=14)
    ax.text(b + 1, i - 0.2, str(b), va="center", color=CY, fontsize=14, fontweight="bold")
ax.set_yticks(y); ax.set_yticklabels(kz); ax.invert_yaxis()
ax.set_xlabel("runs counted that should not be (fewer is better)")
ax.grid(axis="x"); ax.set_axisbelow(True); ax.legend(loc="lower right")
ax.set_title("What the new detection throws out — measured over 2,648 recordings")
speichern(fig, "results.png")

# 2) Haltung gegen die anderen Laeufe der Session
Z = json.loads((ML / "haltung.json").read_text())
G = {}
for g, u, sid, a, b, f in Z:
    G.setdefault(g, []).append(f[0])
fig, ax = plt.subplots(figsize=(16, 7.5))
bins = np.linspace(0, 180, 46)
for key, lab, col in (("echt", "real runs", CY), ("gehen", "walking / carrying on land", OR), ("land", "runs on land (map)", RO)):
    x = np.asarray(G[key]); w = np.ones_like(x) / x.size
    ax.hist(x, bins=bins, weights=w, histtype="stepfilled" if key == "echt" else "step", lw=2.5,
            color=col, alpha=0.35 if key == "echt" else 1.0, label=f"{lab} — median {np.median(x):.0f}°")
ax.set_xlabel("angle between the watch here and the same rider's other runs of that session  [°]")
ax.set_ylabel("share of stretches"); ax.grid(True); ax.set_axisbelow(True); ax.legend()
ax.set_title("On the foil, the watch sits the way it sat in every other run")
speichern(fig, "orientation-angle.png")

# 3) Konstanz und Drehrate in 10-s-Fenstern
K = json.loads((ML / "konstanz.json").read_text())
F = {}
for z in K:
    F.setdefault(z[0], []).extend(z[6])
fig, (a1, a2) = plt.subplots(1, 2, figsize=(16, 7))
for key, lab, col in (("echt", "real runs", CY), ("gehen", "walking on land", OR), ("auto", "car, over 40 km/h", RO)):
    f = np.asarray(F[key])
    a1.hist(f[:, 0], bins=np.linspace(0, 1, 21), weights=np.ones(len(f)) / len(f), histtype="step", lw=2.5, color=col, label=lab)
    a2.hist(f[:, 1], bins=np.linspace(0, 80, 33), weights=np.ones(len(f)) / len(f), histtype="step", lw=2.5, color=col,
            label=f"{lab} — median {np.median(f[:, 1]):.0f}°/s")
a1.set_xlabel("share of 10 s within 20° of its own main direction"); a1.set_ylabel("share of windows")
a1.set_title("Steady? Everyone is.")
a2.set_xlabel("how fast the watch axis turns  [°/s]"); a2.set_title("Turning while steady? Only on the foil.")
for a in (a1, a2):
    a.grid(True); a.set_axisbelow(True); a.legend(loc="upper center")
speichern(fig, "steady-and-turning.png")

# 4) Lernkurve
n = [1, 2, 4, 8, 16, 32, 64, 258]
pr = [0.777, 0.810, 0.982, 0.989, 0.989, 0.990, 0.993, 0.993]
tr = [0.989, 0.972, 0.984, 0.963, 0.949, 0.974, 0.992, 0.992]
fig, ax = plt.subplots(figsize=(16, 7))
ax.plot(n, pr, "o-", color=CY, lw=3, ms=9, label="precision (seconds called on-foil that really were)")
ax.plot(n, tr, "o-", color=OR, lw=3, ms=9, label="recall (on-foil seconds that were found)")
ax.set_xscale("log"); ax.set_xticks(n); ax.set_xticklabels([str(x) for x in n])
ax.set_xlabel("number of riders the model learned from (tested on riders it never saw)")
ax.set_ylim(0.75, 1.0); ax.grid(True); ax.set_axisbelow(True); ax.legend(loc="lower right")
ax.set_title("More riders of the same kind stop helping at about 64")
speichern(fig, "learning-curve.png")
