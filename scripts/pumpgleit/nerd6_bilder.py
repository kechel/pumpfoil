#!/usr/bin/env python3
"""Bilder fuer Nerd-Analysen Teil 6 (Pump-/Gleit-Erkennung pg-1) -> web/public/nerd6/. REIN LESEND.

Datenschutz: Signal- und Kartenbilder NUR aus Jans eigenen Sessions (u2: Uhr #10194 + Brett-Handy #10195).
Andere Fahrer nur anonym und zusammengefasst (Fahrer A-E, ohne Orte, ohne Karten). Englische Achsen.
Karten ohne Hintergrundkacheln (nur die Spur in Metern) — keine Orte im Bild.

Aufruf (aus server/): DATABASE_URL=... OMP_NUM_THREADS=1 .venv/bin/python ../scripts/pumpgleit/nerd6_bilder.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json
import pathlib
import pickle
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G

AUS = G.WURZEL / "web" / "public" / "nerd6"
UHR, BRETT = 10194, 10195
BG, AX, GR, TX, GRAU, CY, ROT, GELB = "#0f172a", "#334155", "#1e293b", "#e2e8f0", "#94a3b8", "#22d3ee", "#f87171", "#fbbf24"
plt.rcParams.update({"figure.facecolor": BG, "axes.facecolor": BG, "axes.edgecolor": AX, "axes.labelcolor": TX,
                     "xtick.color": GRAU, "ytick.color": GRAU, "text.color": TX, "grid.color": GR, "font.size": 12,
                     "axes.titlesize": 14, "legend.facecolor": BG, "legend.edgecolor": AX})


def speichern(fig, name):
    AUS.mkdir(parents=True, exist_ok=True)
    fig.savefig(AUS / name, dpi=110, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print("geschrieben:", AUS / name)


def daten():
    with open(G.AUS / "paare" / f"{UHR}.pkl", "rb") as f:
        P = pickle.load(f)
    db = G.db_lesend()
    try:
        B = G.brett_wahrheit(db, BRETT)
        from app import models
        s = db.get(models.Session, UHR)
        segs = json.loads(s.result.segments_json)
        track = (json.loads(s.result.track_geojson or "{}").get("geometry") or {}).get("coordinates") or []
        from app.analysis import pumpgleit as PG
        neu = PG.segmente_ueberlagern(s, segs, len(track))
    finally:
        db.rollback(); db.close()
    return P, B, segs, track, neu


def bild_wahrheit(P, B):
    """Ein Lauf: oben das Brett (Hub), unten die Uhr; Brett-Pumps, Brett-Gleiten, Aufsetzen, heutige Uhr-Pumps."""
    vers = P["meta"]["versatz_ms"]
    U = P["uhr"]
    L = max((L for L in P["laeufe"] if L["ok"]), key=lambda L: sum(y - x for x, y in L["gleit"]))
    a, e = L["start"] - 3000, L["ende"] + 4000
    H = G.heute_pumps(U, G.gespeicherte_laeufe(U))
    heute = np.array([x for h in H for x in h["pump_ms"]])
    tb = B["t"] - vers
    from app.analysis.brett_regeln import _band
    import importlib
    fig, (o, u) = plt.subplots(2, 1, figsize=(13, 6.2), sharex=True, gridspec_kw={"hspace": 0.08})
    mb = (tb >= a) & (tb <= e)
    # Hub-Signal des Bretts aus den Lage-Daten (nur fuer das Bild noch einmal gerechnet)
    db = G.db_lesend()
    try:
        from app import models
        from app.api.sessions import _lage_antwort
        s = db.get(models.Session, BRETT)
        r = _lage_antwort(db, s, from_ms=0, to_ms=int(B["t"][-1]), pad_s=0.0, hz=25.0)
    finally:
        db.rollback(); db.close()
    hub = _band(np.nan_to_num(np.asarray(r["hub_cm"], float)), 0.5, 3.0)
    tt = np.asarray(r["t_ms"], float) - vers
    m = (tt >= a) & (tt <= e)
    o.plot((tt[m] - a) / 1000, hub[m], color=GRAU, lw=1.2)
    for x in L["pumps_tief"]:
        if a <= x <= e:
            o.axvline((x - a) / 1000, color=CY, lw=0.6, alpha=0.7)
    for ax in (o, u):
        for x, y in L["gleit"]:
            ax.axvspan((x - a) / 1000, (y - a) / 1000, color=GELB, alpha=0.18, lw=0)
        ax.axvline((L["aufsetzen"] - a) / 1000, color=ROT, lw=1.6, ls="--")
        ax.grid(True, alpha=0.4)
    o.set_ylabel("board heave (cm)")
    o.set_title("Phone on the board (top) and watch on the wrist (bottom), same run, same clock")
    mu = (U["t"] >= a) & (U["t"] <= e)
    u.plot((U["t"][mu] - a) / 1000, U["vsig"][mu], color=GRAU, lw=1.0)
    hv = heute[(heute >= a) & (heute <= e)]
    iv = np.clip(np.searchsorted(U["t"], hv), 0, U["t"].size - 1)
    u.scatter((hv - a) / 1000, U["vsig"][iv], color=ROT, s=18, zorder=3, label="pumps counted by the watch until now")
    u.set_ylabel("wrist, vertical (g)")
    u.set_xlabel("seconds")
    from matplotlib.lines import Line2D
    from matplotlib.patches import Patch
    o.legend(handles=[Line2D([], [], color=CY, lw=1.5, label="pump with energy (board)"),
                      Patch(color=GELB, alpha=0.35, label="glide (board)"),
                      Line2D([], [], color=ROT, ls="--", lw=1.6, label="touchdown")], loc="upper right", fontsize=10)
    u.legend(loc="upper right", fontsize=10)
    speichern(fig, "truth.png")


def bild_takt(P):
    """Takt in einem Lauf: Abstand zwischen Brett-Pumps und der lokale Takt, dem der Takt-Filter folgt."""
    L = max((L for L in P["laeufe"] if L["ok"]), key=lambda L: len(L["pumps_tief"]))
    w = np.asarray(L["pumps_tief"])
    iv = np.diff(w) / 1000
    tm = (w[1:] - w[0]) / 1000
    lok = np.array([np.median(iv[max(0, i - 4):i + 4]) for i in range(iv.size)])
    fig, ax = plt.subplots(figsize=(13, 4.2))
    ax.plot(tm, 60 / iv, "o", color=GRAU, ms=4, label="every pump on the board (pumps per minute)")
    ax.plot(tm, 60 / lok, color=CY, lw=2.2, label="local rhythm the filter follows (last few strokes)")
    ax.fill_between(tm, 60 / (lok * 1.4), 60 / (lok * 0.6), color=CY, alpha=0.08, lw=0,
                    label="where the tracker looks for the next stroke (±40 %)")
    ax.set_xlabel("seconds into the run")
    ax.set_ylabel("pumps per minute")
    ax.set_title("The rhythm is not fixed: speeding up and easing off within one run")
    ax.grid(True, alpha=0.4)
    ax.legend(loc="lower right", fontsize=10)
    speichern(fig, "rhythm.png")


def bild_ergebnis():
    T = json.loads((G.AUS / "tuning2.json").read_text())["varianten"]
    namen = [("heute", "until now", GRAU), ("hgb7_alt", "first model (one state for everything)", "#64748b"),
             ("takt+pll_schwach0.4+ml_5s_hmm", "new: rhythm + small glide model", CY)]
    ks = [("pump_treffer", "pumps found\n(±0.25 s)"), ("pump_praez", "pumps that\nare real"),
          ("gl_treffer", "glides found"), ("gl_praez", "glides that\nare real")]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 4.8), gridspec_kw={"width_ratios": [1.5, 1]})
    x = np.arange(len(ks))
    for j, (k, lab, col) in enumerate(namen):
        v = [T[k_]["mittel"][m] for k_, m in [(k, kk) for kk, _ in ks]]
        a1.bar(x + (j - 1) * 0.27, v, 0.26, color=col, label=lab)
        for xi, vi in zip(x, v):
            a1.text(xi + (j - 1) * 0.27, vi + 0.015, f"{vi:.2f}", ha="center", fontsize=9, color=col)
    a1.set_xticks(x, [l for _, l in ks])
    a1.set_ylim(0, 1.08)
    a1.set_title("Against the board, riders held out (average of 5 riders)")
    a1.legend(loc="upper right", fontsize=9)
    a1.grid(True, axis="y", alpha=0.4)
    jf_h, jf_n = T["heute"]["je_fahrer"], T["takt+pll_schwach0.4+ml_5s_hmm"]["je_fahrer"]
    fahrer = sorted(jf_h, key=lambda f: jf_h[f]["pump_treffer"])
    xr = np.arange(len(fahrer))
    a2.bar(xr - 0.2, [jf_h[f]["pump_treffer"] for f in fahrer], 0.38, color=GRAU, label="until now")
    a2.bar(xr + 0.2, [jf_n[f]["pump_treffer"] for f in fahrer], 0.38, color=CY, label="new")
    a2.set_xticks(xr, [f"rider {c}" for c in "ABCDE"[:len(fahrer)]])
    a2.set_ylim(0.6, 1.02)
    a2.set_title("Pumps found, per rider")
    a2.legend(loc="lower right", fontsize=9)
    a2.grid(True, axis="y", alpha=0.4)
    speichern(fig, "results.png")


def bild_lernen():
    E = json.loads((G.AUS / "modell.json").read_text())
    T = json.loads((G.AUS / "tuning2.json").read_text())["varianten"]
    fig, (a1, a2, a3) = plt.subplots(1, 3, figsize=(15, 4.4))
    gr = ["hgb_3", "hgb_7", "hgb_15", "hgb_31"]
    tr = [E["kandidaten"][g]["train"]["bal_acc"] for g in gr]
    ho = [E["kandidaten"][g]["mittel"]["bal_acc"] for g in gr]
    lab = ["3", "7", "15", "31"]
    a1.plot(lab, tr, "o-", color=GRAU, label="riders it learned from")
    a1.plot(lab, ho, "o-", color=CY, lw=2.2, label="riders it never saw")
    a1.set_xlabel("leaves per tree (model size)")
    a1.set_ylabel("balanced accuracy, glide / pump / off")
    a1.set_title("Bigger models only memorise")
    a1.legend(fontsize=9); a1.grid(True, alpha=0.4)
    lk = E["lernkurve"]
    ks = sorted(lk, key=int)
    a2.plot([int(k) for k in ks], [0.5 * lk[k]["pump_f1"] + 0.5 * lk[k]["gl_f1"] for k in ks], "o-", color=CY, lw=2.2)
    a2.set_xticks([int(k) for k in ks])
    a2.set_xlabel("riders in training")
    a2.set_ylabel("score on a new rider (pumps + glides)")
    a2.set_title("More riders still help")
    a2.grid(True, alpha=0.4)
    v = [("takt+ml_5s_hmm", "small tree model"), ("takt+mlp", "small neural net\n(raw signals)")]
    w = [T[k]["mittel"]["gl_f1"] for k, _ in v]
    a3.bar([l for _, l in v], w, color=[CY, GRAU], width=0.5)
    for i, x in enumerate(w):
        a3.text(i, x + 0.003, f"{x:.2f}", ha="center", color=TX)
    a3.set_ylabel("glide F1 (same pumps, same rules)")
    a3.set_title("The net lost")
    a3.grid(True, axis="y", alpha=0.4)
    fig.tight_layout()
    speichern(fig, "learning.png")


def bild_karte(segs, track, neu, laeufe=(1, 3)):
    """Vorher/nachher als Spur ohne Karte (Meter), Pumps als Punkte, Gleitphasen als dicke Linie."""
    c = np.asarray(track, float)
    lat0 = np.radians(np.mean(c[:, 1]))
    xy = np.column_stack([(c[:, 0] - c[:, 0].mean()) * 111320 * np.cos(lat0), (c[:, 1] - c[:, 1].mean()) * 111320])
    fig, axs = plt.subplots(len(laeufe), 2, figsize=(12, 5.2 * len(laeufe)))
    for r, li in enumerate(laeufe):
        for k, (titel, g) in enumerate((("until now", segs[li]), ("new (pg-1)", neu["segments"][li]))):
            ax = axs[r][k]
            i0, i1 = g["i_start"], g["i_end"]
            p = xy[max(i0 - 3, 0):i1 + 4]
            ax.plot(p[:, 0], p[:, 1], color=AX, lw=6, solid_capstyle="round")
            ax.plot(xy[i0:i1 + 1, 0], xy[i0:i1 + 1, 1], color=GRAU, lw=2.5)
            for gi in g.get("glides") or []:
                a, b = int(gi[0]), int(gi[1])
                ax.plot(xy[a:b + 1, 0], xy[a:b + 1, 1], color=GELB, lw=7, alpha=0.9, solid_capstyle="round")
            pi = np.asarray(g.get("pump_idx") or [], int)
            if pi.size:
                # mehrere Pumps je Spurpunkt (1 Hz) leicht auseinanderziehen, damit man sie zaehlen kann
                pts = []
                for idx in np.unique(pi):
                    n = int((pi == idx).sum())
                    nxt = xy[min(idx + 1, len(xy) - 1)]
                    for j in range(n):
                        pts.append(xy[idx] + (nxt - xy[idx]) * (j / max(n, 1)))
                pts = np.asarray(pts)
                ax.scatter(pts[:, 0], pts[:, 1], s=14, color=CY, zorder=3)
            ax.set_aspect("equal")
            ax.set_xticks([]); ax.set_yticks([])
            ng = len(g.get("glides") or [])
            ax.set_title(f"Run {li + 1} — {titel}: {g.get('pumps')} pumps, {ng} glide{'s' if ng != 1 else ''}"
                         f", longest {g.get('longest_glide_s') or 0:.1f} s", fontsize=12)
    from matplotlib.lines import Line2D
    fig.legend(handles=[Line2D([], [], color=CY, marker="o", ls="", label="pump"),
                        Line2D([], [], color=GELB, lw=6, label="glide")], loc="lower center", ncol=2, fontsize=11)
    fig.tight_layout(rect=(0, 0.03, 1, 1))
    speichern(fig, "before-after.png")


def main():
    import logging
    logging.disable(logging.WARNING)
    P, B, segs, track, neu = daten()
    bild_wahrheit(P, B)
    bild_takt(P)
    bild_ergebnis()
    bild_lernen()
    bild_karte(segs, track, neu)
    # Zahlen fuer den Text
    for li in range(len(segs)):
        print(f"Lauf {li + 1}: Pumps {segs[li].get('pumps')} -> {neu['segments'][li].get('pumps')}, Gleitphasen "
              f"{len(segs[li].get('glides') or [])} -> {len(neu['segments'][li].get('glides') or [])}, laengste "
              f"{segs[li].get('longest_glide_s')} -> {neu['segments'][li].get('longest_glide_s')}")
    for L in P["laeufe"]:
        if L["ok"]:
            print("Brett-Lauf: Pumps", len(L["pumps_tief"]), "Gleiten", [round((y - x) / 1000, 1) for x, y in L["gleit"]])


if __name__ == "__main__":
    main()
