#!/usr/bin/env python3
"""Schritt 4: EIN Modell je 0,25-s-Fenster (aus / gleiten / pumpen), daraus Pump-Ereignisse UND
Gleitphasen; Fahrer herausgehalten (leave-one-rider-out). Liest NUR die Pickles aus labels.py.

Kandidaten (Kapazitaet bewusst klein, Jan: nur ~5 Fahrer, kein Auswendiglernen):
  regel       2-3 Schwellen (v_rms2_rel, rhythmus, tempo) per Gitter auf den Trainingsfahrern
  logreg      multinomiale logistische Regression, standardisiert, C klein
  hgb_L       HistGradientBoosting mit L Blaettern je Baum, min_samples_leaf 400, l2 1, 150 Runden
Gewichte: jede Klasse und jeder Fahrer gleich schwer (gleiten selten, u683 lang).
Training nur mit Paaren, deren Uhr >= 15 Hz liefert und deren Ausrichtung nicht 'schwach' ist.

Bewertung je herausgehaltenem Fahrer, gegen heute (Stufe 11 auf denselben Laeufen):
  Pumps Treffer/verpasst/extra (+-250 ms, Phasenversatz aus heute.json), Kadenz- und Anzahlfehler je Lauf,
  Gleit-Intervalle Praezision/Trefferquote, Gleit-Sekunden, laengste Gleitphase je Lauf.

Aufruf: cd server && OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/modell.py [--puffer 5]
Ausgabe: server/data/ml/pumpgleit/modell.json (Messwerte), modell_gesamt.pkl (auf allen Fahrern).
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import itertools
import json
import pathlib
import pickle
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G
import merkmale as M
from heute import laden, zonen

GROESSEN = [3, 7, 15, 31]


# ------------------------------------------------------------------ Daten

def datensatz(paare, puffer_s):
    D = []
    for P in paare:
        m = P["meta"]
        S = M.signale(P["uhr"])
        laeufe = G.gespeicherte_laeufe(P["uhr"])
        tw, X, li, puf = M.merkmale(S, laeufe, puffer_s)
        y, carve = M.ziel(P, tw)
        D.append({"P": P, "S": S, "laeufe": laeufe, "tw": tw, "X": X, "li": li, "puf": puf, "y": y,
                  "carve": carve, "fahrer": m["user"], "train": m["pump_timing_ok"] and m["qualitaet"] != "schwach"})
    return D


def gewichte(y, g):
    w = np.zeros(y.size)
    for f in np.unique(g):
        for k in (0, 1, 2):
            m = (g == f) & (y == k)
            if m.any():
                w[m] = 1.0 / m.sum()
    return w / w.mean()


# ------------------------------------------------------------------ Modelle

class Regel:
    """pumpen: v_rms2_rel >= a UND rhythmus >= b; aus: tempo_abs < c; sonst gleiten."""
    name = "regel"

    def fit(self, X, y, w):
        iv, ir, it = M.NAMEN.index("v_rms2_rel"), M.NAMEN.index("rhythmus"), M.NAMEN.index("tempo_abs")
        best = (-1, None)
        for a in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8):
            for b in (0.0, 0.2, 0.3, 0.4, 0.5):
                for c in (1.0, 1.5, 2.0, 2.5):
                    pred = self._p(X, a, b, c, iv, ir, it).argmax(1)
                    s = sum(np.sum(w[(y == k) & (pred == k)]) / max(np.sum(w[y == k]), 1e-9) for k in (0, 1, 2))
                    if s > best[0]:
                        best = (s, (a, b, c))
        self.par = best[1]
        self.idx = (iv, ir, it)
        return self

    @staticmethod
    def _p(X, a, b, c, iv, ir, it):
        p = np.zeros((X.shape[0], 3))
        pump = (X[:, iv] >= a) & (X[:, ir] >= b)
        aus = (~pump) & (X[:, it] < c)
        p[pump, 2] = 1; p[aus, 0] = 1; p[~pump & ~aus, 1] = 1
        return p

    def predict_proba(self, X):
        return self._p(X, *self.par, *self.idx)


def bauen(name, spalten):
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler
    from sklearn.impute import SimpleImputer
    from sklearn.linear_model import LogisticRegression
    from sklearn.ensemble import HistGradientBoostingClassifier
    if name == "regel":
        return Regel()
    if name == "logreg":
        return make_pipeline(SimpleImputer(strategy="constant", fill_value=0.0, keep_empty_features=True),
                             StandardScaler(), LogisticRegression(C=0.1, max_iter=500))
    L = int(name.split("_")[1])
    return HistGradientBoostingClassifier(max_leaf_nodes=L, max_iter=150, learning_rate=0.05,
                                          min_samples_leaf=400, l2_regularization=1.0, random_state=0)


class Wrapper:
    def __init__(self, name, spalten):
        self.name, self.sp = name, [M.NAMEN.index(s) for s in spalten]
        self.m = bauen(name, spalten)

    def fit(self, X, y, w):
        if self.name == "regel":
            self.m.fit(X, y, w)        # Regel kennt die vollen Spalten
        elif self.name == "logreg":
            self.m.fit(X[:, self.sp], y, logisticregression__sample_weight=w)
        else:
            self.m.fit(X[:, self.sp], y, sample_weight=w)
        return self

    def predict_proba(self, X):
        if self.name == "regel":
            return self.m.predict_proba(X)
        p = self.m.predict_proba(X[:, self.sp])
        if p.shape[1] < 3:
            q = np.zeros((p.shape[0], 3)); q[:, self.m.classes_ if hasattr(self.m, "classes_") else [0, 1]] = p
            return q
        return p


# ------------------------------------------------------------------ Bewertung

def brett_laengste(P):
    return [max([(y - x) / 1000.0 for x, y in L["gleit"]], default=0.0) for L in P["laeufe"] if L["ok"]]


def lauf_zuordnung(P, laeufe):
    """Brett-Lauf (ok) -> Uhr-Lauf mit groesster Ueberlappung (oder None)."""
    z = []
    for L in P["laeufe"]:
        if not L["ok"]:
            continue
        best, bi = 0.0, None
        for i, (a, b) in enumerate(laeufe):
            u = min(b, L["ende"]) - max(a, L["start"])
            if u > best:
                best, bi = u, i
        z.append(bi)
    return z


def bewerten(d, abl, lag):
    """abl: je Uhr-Lauf {"pump_ms", "gleit", "longest"}. Gleiche Regeln fuer heute und neu."""
    P, laeufe = d["P"], d["laeufe"]
    r = defaultdict(float)
    for lo, hi, i, j in zonen(P, laeufe):
        w = np.array([x for x in P["laeufe"][j]["pumps_tief"] if lo <= x <= hi])
        e = np.array([x for x in abl[i]["pump_ms"] if lo + lag <= x <= hi + lag])
        t_, v_, x_, _ = G.zuordnen(w, e, 250.0, lag)
        r["t"] += t_; r["v"] += v_; r["x"] += x_; r["brett"] += w.size; r["uhr"] += e.size
        dur = (hi - lo) / 1000.0
        r["laeufe"] += 1
        r["kad"] += abs(e.size - w.size) / dur
        r["anz"] += abs(e.size - w.size) / max(w.size, 1)
    # Gleiten: Brett-Intervalle in ok-Laeufen, die einen Uhr-Lauf (+Puffer) beruehren
    wahr = [g for L in P["laeufe"] if L["ok"] for g in L["gleit"]]
    erk = [g for a in abl for g in a["gleit"]]
    tU = P["uhr"]["t"]
    known = lambda x: P["lab"][min(np.searchsorted(tU, (x[0] + x[1]) / 2), tU.size - 1)] >= 0
    erk_k = [g for g in erk if known(g)]
    tp_e, n_e, tp_w, n_w = G.intervalle_vergleich(wahr, erk_k)
    r["gl_tp_e"] += tp_e; r["gl_n_e"] += n_e; r["gl_tp_w"] += tp_w; r["gl_n_w"] += n_w
    tw = d["tw"]
    kn = d["y"] >= 0
    mw = G.sekunden_maske(tw, wahr) & kn
    me = G.sekunden_maske(tw, erk_k) & kn
    r["s_tp"] += (mw & me).sum() * M.SCHRITT_S; r["s_w"] += mw.sum() * M.SCHRITT_S; r["s_e"] += me.sum() * M.SCHRITT_S
    # laengste Gleitphase je Brett-Lauf gegen den zugeordneten Uhr-Lauf
    bl = brett_laengste(P)
    for bi, ui in zip(range(len(bl)), lauf_zuordnung(P, laeufe)):
        if ui is None:
            continue
        r["lg_n"] += 1
        r["lg_err"] += abs(abl[ui]["longest"] - bl[bi])
        r["lg_bias"] += abl[ui]["longest"] - bl[bi]
    return r


def heute_abl(d):
    H = G.heute_pumps(d["P"]["uhr"], d["laeufe"])
    return [{"pump_ms": h["pump_ms"], "gleit": h["gleit"],
             "longest": max([(y - x) / 1000.0 for x, y in h["gleit"]], default=0.0),
             "longest_live": h["longest"] or 0.0} for h in H]


def zusammen(rs):
    s = defaultdict(float)
    for r in rs:
        for k, v in r.items():
            s[k] += v
    f = lambda a, b: a / b if b else float("nan")
    tr, pr = f(s["t"], s["brett"]), f(s["t"], s["uhr"])
    gp, gr = f(s["gl_tp_e"], s["gl_n_e"]), f(s["gl_tp_w"], s["gl_n_w"])
    sp, sr = f(s["s_tp"], s["s_e"]), f(s["s_tp"], s["s_w"])
    return {"pump_treffer": tr, "pump_praez": pr, "pump_f1": 2 * tr * pr / (tr + pr) if tr + pr else 0,
            "extra_anteil": f(s["x"], s["uhr"]), "kad_fehler_hz": f(s["kad"], s["laeufe"]),
            "anz_fehler_rel": f(s["anz"], s["laeufe"]),
            "gl_praez": gp, "gl_treffer": gr, "gl_f1": (2 * gp * gr / (gp + gr)) if (gp + gr) > 0 else 0.0,
            "gl_n_brett": s["gl_n_w"], "gl_n_erk": s["gl_n_e"],
            "gl_s_praez": sp, "gl_s_treffer": sr, "gl_s_brett": s["s_w"], "gl_s_erk": s["s_e"],
            "lg_mae": f(s["lg_err"], s["lg_n"]), "lg_bias": f(s["lg_bias"], s["lg_n"]),
            "laeufe": s["laeufe"], "brett_pumps": s["brett"]}


def fenster_metrik(y, p, w=None):
    pred = p.argmax(1)
    rec = [np.mean(pred[y == k] == k) if (y == k).any() else np.nan for k in (0, 1, 2)]
    tp = np.sum((pred == 1) & (y == 1)); fp = np.sum((pred == 1) & (y != 1)); fn = np.sum((pred != 1) & (y == 1))
    return {"bal_acc": float(np.nanmean(rec)), "gl_f1_fenster": float(2 * tp / max(2 * tp + fp + fn, 1))}


# ------------------------------------------------------------------ Ablauf

def loro(D, name, spalten, puffer_s, lag, fahrer_train=None, nur=None):
    """Fahrer heraus: je Fahrer trainieren ohne ihn, auf ihm bewerten. -> (Ergebnis je Fahrer, train-Metrik)."""
    T = [d for d in D if d["train"]]
    fahrer = sorted({d["fahrer"] for d in T})
    out, trainm = {}, []
    for f in fahrer:
        if nur is not None and f != nur:
            continue
        tr = [d for d in T if d["fahrer"] != f and (fahrer_train is None or d["fahrer"] in fahrer_train)]
        if not tr:
            continue
        X = np.vstack([d["X"][d["y"] >= 0] for d in tr]); y = np.concatenate([d["y"][d["y"] >= 0] for d in tr])
        g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in tr])
        w = gewichte(y, g)
        mod = Wrapper(name, spalten).fit(X, y, w)
        trainm.append(fenster_metrik(y, mod.predict_proba(X)))
        theta, tr_note = theta_waehlen(mod, tr, puffer_s, lag)
        trainm[-1]["theta"] = theta
        trainm[-1]["note_train"] = tr_note
        rs, fm = [], []
        for d in [d for d in D if d["fahrer"] == f and d["train"]]:
            p = mod.predict_proba(d["X"])
            abl = M.ableiten(d["tw"], p, d["S"], d["laeufe"], puffer_s, theta=theta)
            rs.append(bewerten(d, abl, lag))
            k = d["y"] >= 0
            fm.append((d["y"][k], p[k]))
        yy = np.concatenate([a for a, _ in fm]); pp = np.vstack([b for _, b in fm])
        out[f] = {**zusammen(rs), **fenster_metrik(yy, pp)}
    train = {k: float(np.mean([t[k] for t in trainm])) for k in trainm[0]} if trainm else {}
    return out, train


THETAS = (0.3, 0.4, 0.5, 0.6, 0.7, 0.8)


def note(m):
    return 0.5 * m["pump_f1"] + 0.5 * m["gl_f1"]


def theta_waehlen(mod, tr, puffer_s, lag):
    """Gleit-Schwelle auf den TRAININGSFAHRERN waehlen (Note = Mittel aus Pump-F1 und Gleit-F1)."""
    ps = [(d, mod.predict_proba(d["X"])) for d in tr]
    best = (-1.0, 0.5)
    for th in THETAS:
        rs = [bewerten(d, M.ableiten(d["tw"], p, d["S"], d["laeufe"], puffer_s, theta=th), lag) for d, p in ps]
        n = note(zusammen(rs))
        if n > best[0]:
            best = (n, th)
    return best[1], best[0]


def mittel(je_fahrer):
    ks = next(iter(je_fahrer.values())).keys()
    return {k: float(np.nanmean([v[k] for v in je_fahrer.values()])) for k in ks}


def gesamt_speichern(T, wahl, puffer, lag, fahrer, erg):
    alle = [n for n in M.NAMEN if n not in M.GRUPPEN["kreisel"]]
    X = np.vstack([d["X"][d["y"] >= 0] for d in T]); y = np.concatenate([d["y"][d["y"] >= 0] for d in T])
    g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in T])
    mod = Wrapper(wahl, alle).fit(X, y, gewichte(y, g))
    theta, _ = theta_waehlen(mod, T, puffer, lag)
    with open(G.AUS / "modell_gesamt.pkl", "wb") as fh:
        pickle.dump({"clf": mod.m, "sp": mod.sp, "name": wahl, "spalten": alle, "namen": M.NAMEN,
                     "puffer_s": puffer, "schritt_s": M.SCHRITT_S, "hz": M.HZ,
                     "klassen": ["aus", "gleiten", "pumpen"], "theta": theta, "lag_ms": lag, "fahrer": fahrer}, fh)
    print("Gesamtmodell", wahl, "theta", theta, flush=True)
    return theta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--puffer", type=float, default=5.0)
    ap.add_argument("--schnell", action="store_true")
    ap.add_argument("--aus", default="modell.json")
    ap.add_argument("--nur-gesamt", dest="nur_gesamt", default="", help="nur Gesamtmodell dieses Namens speichern")
    a = ap.parse_args()
    lag = json.loads((G.AUS / "heute.json").read_text())["lag_ms"]
    paare = laden()
    D = datensatz(paare, a.puffer)
    T = [d for d in D if d["train"]]
    fahrer = sorted({d["fahrer"] for d in T})
    print(f"Trainingspaare {len(T)} von {len(D)}, Fahrer {fahrer}; Fenster je Klasse:",
          {k: int(sum((d['y'] == k).sum() for d in T)) for k in (-1, 0, 1, 2)}, flush=True)
    erg = {"puffer_s": a.puffer, "lag_ms": lag, "fahrer": fahrer}
    if a.nur_gesamt:
        gesamt_speichern(T, a.nur_gesamt, a.puffer, lag, fahrer, {})
        return
    # heute (gleiche Bewertung)
    heute = {}
    for f in fahrer:
        rs = [bewerten(d, heute_abl(d), lag) for d in T if d["fahrer"] == f]
        heute[f] = zusammen(rs)
    erg["heute"] = {"je_fahrer": heute, "mittel": mittel(heute)}
    zeile = lambda n, m, tr=None: print(
        f"{n:16} Pump Tr {m['pump_treffer']:.3f} Pr {m['pump_praez']:.3f} F1 {m['pump_f1']:.3f} "
        f"|Anz| {m['anz_fehler_rel']:.3f} |Kad| {m['kad_fehler_hz']:.3f} | Gleit P {m['gl_praez']:.2f} "
        f"R {m['gl_treffer']:.2f} F1 {m['gl_f1']:.2f} sP {m['gl_s_praez']:.2f} sR {m['gl_s_treffer']:.2f} "
        f"| Laengste MAE {m['lg_mae']:.2f} s Bias {m['lg_bias']:+.2f}"
        + (f" | Fenster balAcc {m.get('bal_acc', float('nan')):.3f}" if 'bal_acc' in m else "")
        + (f" (train {tr['bal_acc']:.3f}, Note train {tr.get('note_train', float('nan')):.3f}, theta {tr.get('theta', float('nan')):.2f})" if tr else "")
        + f" | Note {note(m):.3f}", flush=True)
    zeile("heute", erg["heute"]["mittel"])
    # Kandidaten mit allen Merkmalen ausser Kreisel (in keinem Paar vorhanden)
    alle = [n for n in M.NAMEN if n not in M.GRUPPEN["kreisel"]]
    erg["kandidaten"] = {}
    for name in ["regel", "logreg"] + [f"hgb_{L}" for L in GROESSEN]:
        jf, tr = loro(D, name, alle, a.puffer, lag)
        erg["kandidaten"][name] = {"je_fahrer": jf, "mittel": mittel(jf), "train": tr}
        zeile(name, mittel(jf), tr)
    # Wahl: bestes Mittel aus Pump-F1 und Gleit-F1 (herausgehalten), bei Gleichstand das kleinere
    reihen = ["regel", "logreg"] + [f"hgb_{L}" for L in GROESSEN]
    # Kleinstes Modell (Reihenfolge = Kapazitaet), dessen Note hoechstens 0,02 unter der besten liegt:
    # bei 5 Fahrern sind kleinere Unterschiede Rauschen, und groessere Modelle lernen die Fahrer auswendig.
    beste = max(note(erg["kandidaten"][n]["mittel"]) for n in reihen)
    wahl = next(n for n in reihen if note(erg["kandidaten"][n]["mittel"]) >= beste - 0.02)
    erg["wahl"] = wahl
    print("gewaehlt:", wahl, flush=True)
    if a.schnell:
        (G.AUS / a.aus).write_text(json.dumps(erg, indent=1, default=float)); return
    # Ablation (Merkmalsgruppen weg) mit dem gewaehlten Modell
    erg["ablation"] = {}
    for weg in ["quer", "gps", "zeit", "vertikal"]:
        sp = [n for n in alle if n not in M.GRUPPEN[weg]]
        jf, tr = loro(D, wahl if wahl != "regel" else "hgb_7", sp, a.puffer, lag)
        erg["ablation"][f"ohne_{weg}"] = {"mittel": mittel(jf), "train": tr}
        zeile(f"ohne {weg}", mittel(jf), tr)
    sp = M.GRUPPEN["vertikal"]
    jf, tr = loro(D, wahl if wahl != "regel" else "hgb_7", sp, a.puffer, lag)
    erg["ablation"]["nur_vertikal"] = {"mittel": mittel(jf), "train": tr}
    zeile("nur vertikal", mittel(jf), tr)
    # Lernkurve gegen Zahl der Trainingsfahrer
    erg["lernkurve"] = {}
    for k in range(1, len(fahrer) - 1):
        ms = []
        for f in fahrer:
            andere = [x for x in fahrer if x != f]
            for sub in itertools.combinations(andere, k):
                jf, _ = loro([d for d in D if d["fahrer"] in set(sub) | {f}], wahl, alle, a.puffer, lag, nur=f)
                if f in jf:
                    ms.append(jf[f])
        m = {kk: float(np.nanmean([x[kk] for x in ms])) for kk in ms[0]}
        erg["lernkurve"][k] = m
        zeile(f"{k} Trainingsfahrer", m)
    erg["lernkurve"][len(fahrer) - 1] = erg["kandidaten"][wahl]["mittel"]
    # Permutations-Wichtigkeit (herausgehalten, Fenster-balAcc) je Merkmal
    from sklearn.metrics import balanced_accuracy_score
    imp = defaultdict(list)
    rng = np.random.default_rng(0)
    for f in fahrer:
        tr = [d for d in T if d["fahrer"] != f]
        X = np.vstack([d["X"][d["y"] >= 0] for d in tr]); y = np.concatenate([d["y"][d["y"] >= 0] for d in tr])
        g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in tr])
        mod = Wrapper(wahl, alle).fit(X, y, gewichte(y, g))
        Xt = np.vstack([d["X"][d["y"] >= 0] for d in T if d["fahrer"] == f])
        yt = np.concatenate([d["y"][d["y"] >= 0] for d in T if d["fahrer"] == f])
        base = balanced_accuracy_score(yt, mod.predict_proba(Xt).argmax(1))
        for n in alle:
            j = M.NAMEN.index(n)
            Xp = Xt.copy(); Xp[:, j] = rng.permutation(Xp[:, j])
            imp[n].append(base - balanced_accuracy_score(yt, mod.predict_proba(Xp).argmax(1)))
    erg["wichtigkeit"] = {n: float(np.mean(v)) for n, v in sorted(imp.items(), key=lambda x: -np.mean(x[1]))}
    print("Wichtigkeit (Abfall balAcc, herausgehalten):",
          ", ".join(f"{n} {v:.3f}" for n, v in list(erg["wichtigkeit"].items())[:12]), flush=True)
    # Carve: genug Labels?
    cw = sum(int((d["carve"] & (d["y"] >= 1)).sum()) for d in T)
    ce = sum(int(np.sum(np.diff(np.concatenate([[0], (d["carve"] & (d["y"] >= 1)).astype(np.int8)])) == 1)) for d in T)
    cg = sum(int((d["carve"] & (d["y"] == 1)).sum()) for d in T)
    erg["carve"] = {"fenster": cw, "ereignisse": ce, "fenster_gleiten": cg, "fahrer": {}}
    for f in fahrer:
        erg["carve"]["fahrer"][f] = int(sum(np.sum(np.diff(np.concatenate([[0], (d["carve"] & (d["y"] >= 1)).astype(np.int8)])) == 1)
                                            for d in T if d["fahrer"] == f))
    print(f"Carve-Labels (Trainingspaare, auf dem Foil): {ce} Ereignisse, {cw * M.SCHRITT_S:.0f} s, "
          f"davon {cg * M.SCHRITT_S:.0f} s waehrend Gleiten; je Fahrer {erg['carve']['fahrer']}", flush=True)
    # Carve als Nebenfrage: binaer, Fahrer heraus, AUC
    from sklearn.ensemble import HistGradientBoostingClassifier
    from sklearn.metrics import roc_auc_score
    auc = {}
    for f in fahrer:
        tr = [d for d in T if d["fahrer"] != f]
        X = np.vstack([d["X"][d["y"] >= 1] for d in tr]); y = np.concatenate([d["carve"][d["y"] >= 1] for d in tr])
        te = [d for d in T if d["fahrer"] == f]
        Xt = np.vstack([d["X"][d["y"] >= 1] for d in te]); yt = np.concatenate([d["carve"][d["y"] >= 1] for d in te])
        if y.sum() < 20 or yt.sum() < 5:
            continue
        sp = [M.NAMEN.index(n) for n in alle]
        clf = HistGradientBoostingClassifier(max_leaf_nodes=7, max_iter=100, learning_rate=0.05, min_samples_leaf=200,
                                             l2_regularization=1.0, class_weight="balanced").fit(X[:, sp], y)
        auc[f] = float(roc_auc_score(yt, clf.predict_proba(Xt[:, sp])[:, 1]))
    erg["carve"]["auc_herausgehalten"] = auc
    print("Carve AUC je herausgehaltenem Fahrer:", auc, flush=True)
    erg["theta_gesamt"] = gesamt_speichern(T, wahl, a.puffer, lag, fahrer, erg)
    (G.AUS / a.aus).write_text(json.dumps(erg, indent=1, default=float))
    print("geschrieben:", G.AUS / "modell.json")


if __name__ == "__main__":
    main()
