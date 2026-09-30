#!/usr/bin/env python3
"""Erkennung v3, Stufe A trainieren und bewerten: auf dem Foil ja/nein je Sekunde.

Validierung IMMER mit herausgehaltenen FAHRERN (GroupKFold nach Nutzer, 5 Teile) — sonst lernt das
Modell den Fahrer und die Zahl luegt. Bewertet wird je Label-Quelle getrennt, weil die Quellen
verschieden schwer sind (Stillstand ist trivial, eine Autofahrt-Schulter nicht).

Aufruf (aus server/): nice -n 15 .venv/bin/python ../scripts/v3/training_a.py --name r2 [--speichern]
  --name       Modellfassung: schreibt server/data/ml/v3/stufe_a_<name>_falten.pkl, cv_a_<name>.npz
               und mit --speichern stufe_a_<name>.pkl (NICHT im Repo, NICHT live). Die erste
               Fassung (r1) liegt unter stufe_a.pkl / stufe_a_falten.pkl und wird nie ueberschrieben.
  --ohne       Label-Quellen weglassen (Vergleich), z. B. fortsetzung,fit_neg
  --merkmale   alle (Standard) | basis (nur die 14 des bisherigen Modells) | ohne_achsen
  --kurve      Lernkurve: je Teil mit 1, 2, 4, 8 … Trainings-Fahrern (nur Bewertung, kein Speichern)
  --iter/--blaetter/--lr/--min-blatt  Modellgroesse
  --rand S     die heutigen Lauf-Grenzen sind KEINE Wahrheit: ±S s um jeden Lauf-Anfang/-Ende werden
               fuer die geschaetzten Quellen (lauf, land, ruhe) unsicher. Sonst lernt das Modell die
               Tempo-Schwellen von v2 nach (Guillaume: langsames Weiterpumpen nur zu 26 % erkannt).
  --gewichte   unabhaengige Wahrheiten staerker: fremd x3, brett/fortsetzung/sicht x5, fit_neg x2
  --brett PKL  Brett-Wahrheit (brett_training.daten(), gepickelt) als eigene Quelle je Uhr-Sekunde
"""
import argparse
import glob
import gzip
import json
import os
import pathlib
import pickle
import sys

os.environ.setdefault("OMP_NUM_THREADS", "8")
import numpy as np  # noqa: E402

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
from app.analysis.v3 import merkmale as M  # noqa: E402

ML = WURZEL / "server" / "data" / "ml"
# Wie datensatz.QUELLEN, dazu „fit_neg": Jans FIT-Dateien ohne Pumpfoil (ds/neg-*.npz, Quelle
# dort „mensch") — getrennt gefuehrt, damit sie sich einzeln messen und weglassen lassen.
Q = ["mensch", "sicht", "fremd", "lauf", "land", "ruhe", "fortsetzung", "fit_neg", "brett"]
RUHE_ANTEIL = 0.12      # Stillstand ist trivial und riesig — verduennen
ACHSEN = ["vert_rms", "hor_rms", "vert_anteil", "dreh_grad_s", "neigung_grad", "tempo_trend"]


def spalten(auswahl, mit_haltung=False):
    from app.analysis.v3 import haltung as HA
    extra = list(HA.NAMEN) if mit_haltung else []
    return _spalten(auswahl) + extra


def _spalten(auswahl):
    if auswahl == "basis":
        return list(M.BASIS_NAMEN)
    if auswahl == "ohne_achsen":
        return [n for n in M.NAMEN if n not in ACHSEN]
    return list(M.NAMEN)


GEWICHT = {"fremd": 3.0, "brett": 5.0, "fortsetzung": 5.0, "sicht": 5.0, "fit_neg": 2.0}


def laden(namen, ohne=(), rand_s=0, brett=None, lauf_nur_wasser=False):
    from app.analysis.v3 import haltung as HA
    alle = list(M.NAMEN) + list(HA.NAMEN)
    b = {s["id"]: s for s in json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))}
    sp = [alle.index(n) for n in namen]
    mit_h = any(n in HA.NAMEN for n in namen)
    Xs, ys, qs, gs, ls, ss = [], [], [], [], [], []
    rng = np.random.default_rng(0)
    for f in sorted(glob.glob(str(ML / "v3" / "ds" / "*.npz"))):
        stamm = pathlib.Path(f).stem
        d = np.load(f)
        if d["X"].shape[1] != len(M.NAMEN):
            raise SystemExit(f"{f}: {d['X'].shape[1]} Spalten statt {len(M.NAMEN)} — Datensatz neu bauen")
        y, q = d["y"], d["q"].copy()
        if stamm.startswith("neg-"):
            sid, uid = -1, int(d["user_id"])
            q[:] = Q.index("fit_neg")
        else:
            sid = int(stamm)
            uid = b[sid]["user_id"]
        y = y.copy()
        if rand_s:
            # Lauf-Grenzen: Uebergaenge in im_lauf, ±rand_s Sekunden (1 Zeile = 1 GPS-Sekunde)
            il = d["im_lauf"].astype(np.int8)
            kanten = np.flatnonzero(np.diff(il) != 0)
            nah = np.zeros(y.size, bool)
            for k in kanten:
                nah[max(k - rand_s + 1, 0):k + rand_s + 1] = True
            geschaetzt = np.isin(q, [Q.index("lauf"), Q.index("land"), Q.index("ruhe")])
            y[nah & geschaetzt] = -1
        if lauf_nur_wasser:
            # 30.09.: „lauf nahe Wasser" labelte auch die Stuecke AM UFER als Foilen (#9580: Lauf 19
            # zum Parkplatz) — so lernt das Modell genau die Faelle falsch. Lauf-Sekunden ohne
            # JRC-Wasser (occ == 0) werden unsicher; schmales Wasser deckt die Sichtpruefung ab.
            y[(q == Q.index("lauf")) & (d["occ"] == 0)] = -1
        if brett is not None and sid in brett:
            tb_, zb = brett[sid]
            j = np.clip(np.searchsorted(tb_, d["t"]), 0, tb_.size - 1)
            passt = np.abs(tb_[j] - d["t"]) <= 500
            y[passt] = (zb[j[passt]] > 0).astype(y.dtype)
            q[passt] = Q.index("brett")
        m = y >= 0
        for n in ohne:
            m &= q != Q.index(n)
        m &= ~((q == Q.index("ruhe")) & (rng.random(y.size) > RUHE_ANTEIL))
        if not m.any():
            continue
        X0 = d["X"]
        if mit_h:
            hf = ML / "v3" / "ds_h" / f"{stamm}.npz"
            H = np.load(hf)["H"] if hf.exists() else np.full((X0.shape[0], len(HA.NAMEN)), np.nan, np.float32)
            X0 = np.hstack([X0, H])
        Xk = M.mit_kontext(X0[:, sp])     # Kontext je Session bilden, dann auswaehlen
        Xs.append(Xk[m].astype(np.float32)); ys.append(y[m]); qs.append(q[m])
        gs.append(np.full(m.sum(), uid, dtype=np.int32))
        ls.append(d["im_lauf"][m]); ss.append(np.full(m.sum(), sid, dtype=np.int32))
    return (np.concatenate(Xs), np.concatenate(ys), np.concatenate(qs), np.concatenate(gs),
            np.concatenate(ls), np.concatenate(ss))


def modell(a):
    from sklearn.ensemble import HistGradientBoostingClassifier
    return HistGradientBoostingClassifier(max_iter=a.iter, learning_rate=a.lr, max_leaf_nodes=a.blaetter,
                                          min_samples_leaf=a.min_blatt, l2_regularization=1.0,
                                          class_weight="balanced", random_state=0)


def bericht(name, y, p, q, heute=None, g=None):
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
            print(f"  {qn:11s} y={v}: {mm.sum():8d} s, richtig {ok:.3f}{h}")
    if g is not None and (g == 350).any():
        m = (g == 350) & (y == 1)
        print(f"  u350 (Guillaume) y=1: {m.sum()} s, richtig {(p[m] == 1).mean():.3f}"
              + (f" (heute {(heute[m] == 1).mean():.3f})" if heute is not None else ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", default="r2")
    ap.add_argument("--speichern", action="store_true")
    ap.add_argument("--ohne", default="")
    ap.add_argument("--merkmale", default="alle", choices=["alle", "basis", "ohne_achsen"])
    ap.add_argument("--kurve", action="store_true")
    ap.add_argument("--iter", type=int, default=300)
    ap.add_argument("--blaetter", type=int, default=63)
    ap.add_argument("--lr", type=float, default=0.08)
    ap.add_argument("--min-blatt", dest="min_blatt", type=int, default=200)
    ap.add_argument("--rand", type=int, default=0)
    ap.add_argument("--gewichte", action="store_true")
    ap.add_argument("--brett", default="")
    ap.add_argument("--lauf-nur-wasser", dest="lauf_nur_wasser", action="store_true")
    ap.add_argument("--haltung", action="store_true", help="Haltung relativ zur Session (ds_h/, s. datensatz_haltung.py)")
    a = ap.parse_args()
    if a.name in ("", "r1"):
        raise SystemExit("r1 ist die erste Fassung und bleibt unangetastet — anderen --name waehlen")
    from sklearn.model_selection import GroupKFold
    namen = spalten(a.merkmale, a.haltung)
    ohne = [x for x in a.ohne.split(",") if x]
    brett = None
    if a.brett:
        brett = {d["paar"][1]: (np.asarray(d["t"], float), np.asarray(d["z"])) for d in pickle.load(open(a.brett, "rb"))}
    X, y, q, g, heute, sid = laden(namen, ohne, a.rand, brett, a.lauf_nur_wasser)
    w = np.ones(y.size, np.float32)
    if a.gewichte:
        for n, f in GEWICHT.items():
            w[q == Q.index(n)] = f
    print(f"[{a.name}] Zeilen {len(y)} Merkmale {X.shape[1]} ({len(namen)} je Sekunde) Fahrer "
          f"{len(np.unique(g))} ohne {ohne or '-'} · iter {a.iter} Blaetter {a.blaetter} · Rand {a.rand} s"
          f" · Gewichte {'ja' if a.gewichte else 'nein'} · Brett {'ja' if brett else 'nein'}", flush=True)
    teile = list(GroupKFold(5).split(X, y, g))
    if a.kurve:
        rng = np.random.default_rng(1)
        for n in (1, 2, 4, 8, 16, 32, 64, 10 ** 6):
            p = np.full_like(y, -1)
            for tr, te in teile:
                fahrer = np.unique(g[tr])
                wahl = rng.choice(fahrer, size=min(n, fahrer.size), replace=False)
                t2 = tr[np.isin(g[tr], wahl)]
                if np.unique(y[t2]).size < 2:
                    continue
                p[te] = modell(a).fit(X[t2], y[t2], sample_weight=w[t2]).predict(X[te])
            m = p >= 0
            yy, pp = y[m], p[m]
            tp = ((pp == 1) & (yy == 1)).sum(); fp = ((pp == 1) & (yy == 0)).sum(); fn = ((pp == 0) & (yy == 1)).sum()
            fr = (q[m] == Q.index("fremd"))
            print(f"  Kurve {min(n, 999):>4} Fahrer: Praezision {tp / max(tp + fp, 1):.3f} Trefferquote "
                  f"{tp / max(tp + fn, 1):.3f} · fremd richtig {(pp[fr] == yy[fr]).mean():.3f}", flush=True)
        return
    p = np.zeros_like(y); pr = np.zeros(y.size, np.float32)
    falten, fahrer_falte = [], {}
    for k, (tr, te) in enumerate(teile):
        clf = modell(a).fit(X[tr], y[tr], sample_weight=w[tr])
        pr[te] = clf.predict_proba(X[te])[:, 1]
        p[te] = (pr[te] >= 0.5).astype(y.dtype)
        falten.append(clf)
        for u in np.unique(g[te]):
            fahrer_falte[int(u)] = k
        print(f"  Teil {k + 1}/5 fertig", flush=True)
    # Die fuenf Teilmodelle aufheben: im Schattenlauf bekommt jede Session das Modell, das ihren
    # Fahrer NIE gesehen hat — sonst misst der Vergleich Auswendiglernen (Sichtpruefung, Labels).
    (ML / "v3").mkdir(parents=True, exist_ok=True)
    meta = {"namen": namen, "kontext_r": M.KONTEXT_R, "ohne": ohne, "iter": a.iter, "blaetter": a.blaetter,
            "rand": a.rand, "gewichte": a.gewichte, "brett": bool(brett)}
    with open(ML / "v3" / f"stufe_a_{a.name}_falten.pkl", "wb") as f:
        pickle.dump(dict(meta, falten=falten, fahrer_falte=fahrer_falte), f)
    bericht(f"Stufe A [{a.name}], Fahrer herausgehalten (heute = heutiger Lauf an derselben Sekunde)",
            y, p, q, heute.astype(np.int8), g)
    np.savez_compressed(ML / "v3" / f"cv_a_{a.name}.npz", y=y, p=p, pr=pr, q=q, g=g, heute=heute, sid=sid)
    if a.speichern:
        clf = modell(a).fit(X, y, sample_weight=w)
        with open(ML / "v3" / f"stufe_a_{a.name}.pkl", "wb") as f:
            pickle.dump(dict(meta, clf=clf), f)
        print("gespeichert:", ML / "v3" / f"stufe_a_{a.name}.pkl")


if __name__ == "__main__":
    main()
