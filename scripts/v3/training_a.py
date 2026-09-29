#!/usr/bin/env python3
"""Erkennung v3, Stufe A trainieren und bewerten: auf dem Foil ja/nein je Sekunde.

Validierung IMMER mit herausgehaltenen FAHRERN (GroupKFold nach Nutzer, 5 Teile) — sonst lernt das
Modell den Fahrer und die Zahl luegt. Bewertet wird je Label-Quelle getrennt, weil die Quellen
verschieden schwer sind (Stillstand ist trivial, eine Autofahrt-Schulter nicht).

Aufruf (aus server/): .venv/bin/python ../scripts/v3/training_a.py [--speichern]
  --speichern  trainiert zum Schluss auf ALLEN Daten und legt das Modell unter
               server/data/ml/v3/stufe_a.pkl ab (NICHT im Repo, NICHT live).
"""
import argparse
import glob
import gzip
import json
import pathlib
import pickle
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
from app.analysis.v3 import merkmale as M  # noqa: E402

ML = WURZEL / "server" / "data" / "ml"
Q = ["mensch", "sicht", "fremd", "lauf", "land", "ruhe"]
RUHE_ANTEIL = 0.12      # Stillstand ist trivial und riesig — verduennen


def laden():
    b = {s["id"]: s for s in json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))}
    Xs, ys, qs, gs, ls = [], [], [], [], []
    rng = np.random.default_rng(0)
    for f in sorted(glob.glob(str(ML / "v3" / "ds" / "*.npz"))):
        sid = int(pathlib.Path(f).stem)
        d = np.load(f)
        y, q = d["y"], d["q"]
        m = y >= 0
        m &= ~((q == Q.index("ruhe")) & (rng.random(y.size) > RUHE_ANTEIL))
        if not m.any():
            continue
        Xk = M.mit_kontext(d["X"])        # Kontext je Session bilden, dann auswaehlen
        Xs.append(Xk[m].astype(np.float32)); ys.append(y[m]); qs.append(q[m])
        gs.append(np.full(m.sum(), b[sid]["user_id"], dtype=np.int32))
        ls.append(d["im_lauf"][m])
    return (np.concatenate(Xs), np.concatenate(ys), np.concatenate(qs), np.concatenate(gs),
            np.concatenate(ls))


def modell():
    from sklearn.ensemble import HistGradientBoostingClassifier
    return HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, max_leaf_nodes=63,
                                          min_samples_leaf=200, l2_regularization=1.0,
                                          class_weight="balanced", random_state=0)


def bericht(name, y, p, q, heute=None):
    print(f"\n{name}")
    tp = int(((p == 1) & (y == 1)).sum()); fp = int(((p == 1) & (y == 0)).sum())
    fn = int(((p == 0) & (y == 1)).sum())
    print(f"  gesamt  Praezision {tp / max(tp + fp, 1):.3f}  Trefferquote {tp / max(tp + fn, 1):.3f}")
    for k, qn in enumerate(Q):
        m = q == k
        if not m.any():
            continue
        for v in (1, 0):
            mm = m & (y == v)
            if mm.sum() < 50:
                continue
            ok = (p[mm] == v).mean()
            h = f" (heute {(heute[mm] == v).mean():.3f})" if heute is not None else ""
            print(f"  {qn:7s} y={v}: {mm.sum():8d} s, richtig {ok:.3f}{h}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--speichern", action="store_true")
    a = ap.parse_args()
    from sklearn.model_selection import GroupKFold
    X, y, q, g, heute = laden()
    print("Zeilen", len(y), "Merkmale", X.shape[1], "Fahrer", len(np.unique(g)), flush=True)
    p = np.zeros_like(y)
    falten, fahrer_falte = [], {}
    for k, (tr, te) in enumerate(GroupKFold(5).split(X, y, g)):
        clf = modell().fit(X[tr], y[tr])
        p[te] = clf.predict(X[te])
        falten.append(clf)
        for u in np.unique(g[te]):
            fahrer_falte[int(u)] = k
        print(f"  Teil {k + 1}/5 fertig", flush=True)
    # Die fuenf Teilmodelle aufheben: im Schattenlauf bekommt jede Session das Modell, das ihren
    # Fahrer NIE gesehen hat — sonst misst der Vergleich Auswendiglernen (Sichtpruefung, Labels).
    (ML / "v3").mkdir(parents=True, exist_ok=True)
    with open(ML / "v3" / "stufe_a_falten.pkl", "wb") as f:
        pickle.dump({"falten": falten, "fahrer_falte": fahrer_falte, "namen": M.NAMEN,
                     "kontext_r": M.KONTEXT_R}, f)
    bericht("Stufe A, Fahrer herausgehalten (heute = heutiger Lauf an derselben Sekunde)", y, p, q,
            heute.astype(np.int8))
    np.savez_compressed(ML / "v3" / "cv_a.npz", y=y, p=p, q=q, g=g, heute=heute)
    if a.speichern:
        clf = modell().fit(X, y)
        (ML / "v3").mkdir(parents=True, exist_ok=True)
        with open(ML / "v3" / "stufe_a.pkl", "wb") as f:
            pickle.dump({"clf": clf, "namen": M.NAMEN, "kontext_r": M.KONTEXT_R}, f)
        print("gespeichert:", ML / "v3" / "stufe_a.pkl")


if __name__ == "__main__":
    main()
