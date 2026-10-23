#!/usr/bin/env python3
"""Tuning-Runde: Gleiten behalten, KEINE echten Pumps wegwerfen. Fahrer heraus (leave-one-rider-out). REIN LESEND.

Bewertung (Jan, 23.10.2026): (1) Brett-Wahrheit je Fahrer, herausgehalten; (2) Jans Tap-Pumps #295/#354: die
GESAMTZAHL darf nicht unter heute fallen, „wirklich fehlend" = getippt - erkannt; (3) FIT run_pumps kein
Kriterium. Varianten siehe VARIANTEN; Ableitung in ableitung2.py.

Aufruf: cd server && DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/tuning.py
Ausgabe: server/data/ml/pumpgleit/tuning.json, tuning.txt; mit --speichern <variante> das Gesamtmodell
         server/data/ml/pumpgleit/variante_<name>.pkl
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import logging
import pathlib
import pickle
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G
import merkmale as M
import modell as MO
import ableitung2 as A2
from heute import laden, zonen

PUFFER = 5.0
OHNE_POS = [n for n in M.NAMEN if n not in M.GRUPPEN["kreisel"] + M.GRUPPEN["zeit"]]
MIT_POS = [n for n in M.NAMEN if n not in M.GRUPPEN["kreisel"]]

VARIANTEN = {
    # name: (Merkmale, Zustandsmodell, cfg)
    "v_sicher":         ("ohne_pos", "hgb_7", {"theta_hoch": 0.9, "sicher_s": 2.0}),
    "v_sicher_streng":  ("ohne_pos", "hgb_7", {"theta_hoch": 0.95, "sicher_s": 3.0}),
    "v_nur_doppel_r":   ("ohne_pos", "hgb_7", {"theta_hoch": 1.01, "doppel": "regel"}),
    "v_nur_doppel_m":   ("ohne_pos", "hgb_7", {"theta_hoch": 1.01, "doppel": "modell"}),
    "v_sicher_doppel_m": ("ohne_pos", "hgb_7", {"theta_hoch": 0.95, "sicher_s": 3.0, "doppel": "modell"}),
    "v_sicher_doppel_m_g2": ("ohne_pos", "hgb_7", {"theta_hoch": 0.95, "sicher_s": 3.0, "doppel": "modell", "gleit_min_s": 2.0}),
    "v_sicher_doppel_m_hin": ("ohne_pos", "hgb_7", {"theta_hoch": 0.95, "sicher_s": 3.0, "doppel": "modell", "hinschauen_s": 4.0}),
    "v_sicher_doppel_m_pos": ("mit_pos", "hgb_7", {"theta_hoch": 0.95, "sicher_s": 3.0, "doppel": "modell"}),
    "v_sicher_doppel_m_h3": ("ohne_pos", "hgb_3", {"theta_hoch": 0.95, "sicher_s": 3.0, "doppel": "modell"}),
    "v_keine_streichung": ("ohne_pos", "hgb_7", {"theta_hoch": 1.01}),
}


# ------------------------------------------------------------------ Taps

def taps_laden(db):
    from app import models
    from app.pumptruth import compare_takes
    P = models.PumpTruth
    g = defaultdict(lambda: defaultdict(list))
    for r in db.query(P.session_id, P.run_idx, P.take, P.t_ms).filter(P.session_id.in_([295, 354])).all():
        g[r[0]][r[2]].append(float(r[3]))
    out = []
    for sid, takes in g.items():
        cmp = compare_takes([{"take": k, "times_ms": v} for k, v in takes.items()])
        s = db.get(models.Session, sid)
        tr = float(s.trim_start_ms or 0)       # Taps auf Zuschnitt-Basis (s. kontrolle.py)
        U = G.uhr_daten(db, sid)
        laeufe = G.gespeicherte_laeufe(U)
        S = M.signale(U)
        tw, X, li, puf = M.merkmale(S, laeufe, PUFFER)
        out.append({"sid": sid, "user": U["user"], "kons": np.asarray(cmp["consensus_ms"], float) + tr,
                    "fenster": [x + tr for x in cmp["window_ms"]], "U": U, "S": S, "laeufe": laeufe, "tw": tw, "X": X})
        out[-1]["off"] = taps_versatz(out[-1])
    return out


def taps_bewerten(T, abl, lag):
    """Gesamtzahl, Doppelte (< 0,2 s Abstand), „wirklich fehlend" = getippt - erkannt ohne Doppelte; Treffer
    mit dem Tap-Versatz der Session (T["off"], einmal aus dem heutigen Zaehler geschaetzt, +-halbe Periode)."""
    lo, hi = T["fenster"]
    off = T.get("off", lag)
    lo, hi = lo - 400, hi + 400
    e = np.sort(np.array([x for a in abl for x in a["pump_ms"] if lo + off <= x <= hi + off]))
    w = T["kons"]
    doppel = int(np.sum(np.diff(e) < 200)) if e.size > 1 else 0
    t_, v_, x_, _ = G.zuordnen(w, e, 250.0, off)
    t4, v4, x4, _ = G.zuordnen(w, e, 400.0, off)
    return {"getippt": int(w.size), "erkannt": int(e.size), "doppelt": doppel, "fehlend": int(w.size - e.size),
            "fehlend_ohne_doppel": int(w.size - (e.size - doppel)),
            "t250": t_, "v250": v_, "x250": x_, "t400": t4, "v400": v4, "x400": x4}


def taps_versatz(T):
    """Konstanter Tap-Versatz je Session (Reaktionszeit beim Tippen), aus dem heutigen Zaehler, +-halbe Periode."""
    H = G.heute_pumps(T["U"], T["laeufe"])
    e = np.array([x for h in H for x in h["pump_ms"]])
    halb = float(np.median(np.diff(T["kons"]))) / 2
    best = (-1, 0.0)
    for off in np.arange(-halb, halb + 1, 20.0):
        t_, _, _, _ = G.zuordnen(T["kons"], e, 250.0, off)
        if t_ > best[0]:
            best = (t_, off)
    return best[1]


# ------------------------------------------------------------------ Kandidat-Klassifikator

def kand_daten(d, p, lag):
    """Kandidaten eines Paars mit Brett-Label (1 = echter Pump, 0 = Doppel/Extra), nur in den Zonen."""
    ka = []
    A2.ableiten2(d["tw"], p, d["X"], d["S"], d["laeufe"], {"theta_hoch": 1.01}, kand_aus=ka)
    Xs, ys = [], []
    for lo, hi, i, j in zonen(d["P"], d["laeufe"]):
        w = np.array(d["P"]["laeufe"][j]["pumps_tief"])
        w = w[(w >= lo) & (w <= hi)]
        for kt, F in ka:
            m = (kt >= lo + lag) & (kt <= hi + lag)
            if not m.any():
                continue
            kk = kt[m]
            # Zuordnung eins-zu-eins
            lab = np.zeros(kk.size, int)
            paare = sorted((abs(x - lag - y), a_, b_) for a_, x in enumerate(kk) for b_, y in enumerate(w) if abs(x - lag - y) <= 250)
            ua, ub = set(), set()
            for _, a_, b_ in paare:
                if a_ not in ua and b_ not in ub:
                    ua.add(a_); ub.add(b_); lab[a_] = 1
            Xs.append(F[m]); ys.append(lab)
    if not Xs:
        return np.zeros((0, len(A2.KAND_NAMEN))), np.zeros(0, int)
    return np.vstack(Xs), np.concatenate(ys)


def kand_trainieren(tr_daten):
    from sklearn.ensemble import HistGradientBoostingClassifier
    X = np.vstack([x for x, _, _ in tr_daten]); y = np.concatenate([y for _, y, _ in tr_daten])
    g = np.concatenate([np.full(y_.size, f) for _, y_, f in tr_daten])
    w = np.zeros(y.size)
    for f in np.unique(g):
        m = g == f
        w[m] = 1.0 / m.sum()
    clf = HistGradientBoostingClassifier(max_leaf_nodes=7, max_iter=150, learning_rate=0.05, min_samples_leaf=100,
                                         l2_regularization=1.0, random_state=0).fit(X, y, sample_weight=w / w.mean())
    pr = clf.predict_proba(X)[:, 1]
    # tau: groesster Wert, bei dem auf den Trainingsfahrern hoechstens 1 % der echten Pumps verloren gehen
    tau = 0.0
    for t in np.arange(0.05, 0.6, 0.025):
        if np.mean(pr[y == 1] < t) <= 0.01:
            tau = float(t)
    return (lambda F: clf.predict_proba(F)[:, 1] if F.shape[0] else np.zeros(0)), tau, clf


# ------------------------------------------------------------------ Ablauf

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--speichern", default="")
    a = ap.parse_args()
    logging.disable(logging.WARNING)
    lag = json.loads((G.AUS / "heute.json").read_text())["lag_ms"]
    D = MO.datensatz(laden(), PUFFER)
    T = [d for d in D if d["train"]]
    fahrer = sorted({d["fahrer"] for d in T})
    db = G.db_lesend()
    try:
        TAPS = taps_laden(db)
    finally:
        db.rollback(); db.close()
    erg = {"varianten": {}, "lag_ms": lag}
    # heute und hgb_7 alt
    je = {"heute": {}, "hgb7_alt": {}}
    taps = {"heute": [], "hgb7_alt": []}
    for f in fahrer:
        je["heute"][f] = MO.zusammen([MO.bewerten(d, MO.heute_abl(d), lag) for d in T if d["fahrer"] == f])
    for Tp in TAPS:
        H = G.heute_pumps(Tp["U"], Tp["laeufe"])
        taps["heute"].append({"sid": Tp["sid"], **taps_bewerten(Tp, [{"pump_ms": h["pump_ms"]} for h in H], lag)})
    # Fold-Modelle je Merkmalssatz und Groesse
    cache = {}

    def fold(f, satz, groesse):
        k = (f, satz, groesse)
        if k in cache:
            return cache[k]
        sp = OHNE_POS if satz == "ohne_pos" else MIT_POS
        tr = [d for d in T if d["fahrer"] != f]
        X = np.vstack([d["X"][d["y"] >= 0] for d in tr]); y = np.concatenate([d["y"][d["y"] >= 0] for d in tr])
        g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in tr])
        mod = MO.Wrapper(groesse, sp).fit(X, y, MO.gewichte(y, g))
        th, _ = MO.theta_waehlen(mod, tr, PUFFER, lag)
        kd = [(*kand_daten(d, mod.predict_proba(d["X"]), lag), d["fahrer"]) for d in tr]
        kf, tau, _ = kand_trainieren(kd)
        cache[k] = (mod, th, kf, tau)
        return cache[k]

    # bisheriges hgb_7 (mit Position, alte Ableitung)
    for f in fahrer:
        mod, th, _, _ = fold(f, "mit_pos", "hgb_7")
        rs = [MO.bewerten(d, M.ableiten(d["tw"], mod.predict_proba(d["X"]), d["S"], d["laeufe"], PUFFER, theta=th), lag)
              for d in T if d["fahrer"] == f]
        je["hgb7_alt"][f] = MO.zusammen(rs)
        if f == 2:
            for Tp in TAPS:
                abl = M.ableiten(Tp["tw"], mod.predict_proba(Tp["X"]), Tp["S"], Tp["laeufe"], PUFFER, theta=th)
                taps["hgb7_alt"].append({"sid": Tp["sid"], **taps_bewerten(Tp, abl, lag)})
    for name, (satz, groesse, cfg) in VARIANTEN.items():
        je[name] = {}; taps[name] = []
        hin_n = 0
        for f in fahrer:
            mod, th, kf, tau = fold(f, satz, groesse)
            c = {**cfg, "theta": th, "tau": tau}
            rs = []
            for d in [d for d in T if d["fahrer"] == f]:
                abl = A2.ableiten2(d["tw"], mod.predict_proba(d["X"]), d["X"], d["S"], d["laeufe"], c, kf, gps=d["P"]["uhr"]["gps"])
                hin_n += sum(len(x["hinschauen"]) for x in abl)
                rs.append(MO.bewerten(d, abl, lag))
            je[name][f] = MO.zusammen(rs)
            if f == 2:
                for Tp in TAPS:
                    abl = A2.ableiten2(Tp["tw"], mod.predict_proba(Tp["X"]), Tp["X"], Tp["S"], Tp["laeufe"], c, kf, gps=Tp["U"]["gps"])
                    taps[name].append({"sid": Tp["sid"], **taps_bewerten(Tp, abl, lag)})
        erg["varianten"][name] = {"hinschauen_n": hin_n}
    # Tabellen
    zeilen = []
    kopf = (f"{'Variante':24} {'PumpF1':>6} {'Tr250':>5} {'Pr250':>5} {'|Anz|':>5} {'|Kad|':>5} | {'GlP':>4} {'GlR':>4} {'GlF1':>4} "
            f"{'sP':>4} {'sR':>4} {'LgMAE':>5} | Taps #295 erk/fehl/T/X  #354 erk/fehl/T/X")
    zeilen.append(kopf)
    for name in je:
        m = MO.mittel(je[name])
        tp = {t["sid"]: t for t in taps[name]}
        ts = " ".join(f"{tp[s]['erkannt']}/{tp[s]['fehlend']:+d}/{tp[s]['t250']}/{tp[s]['x250']}" if s in tp else "-" for s in (295, 354))
        zeilen.append(f"{name:24} {m['pump_f1']:6.3f} {m['pump_treffer']:5.3f} {m['pump_praez']:5.3f} {m['anz_fehler_rel']:5.3f} "
                      f"{m['kad_fehler_hz']:5.3f} | {m['gl_praez']:4.2f} {m['gl_treffer']:4.2f} {m['gl_f1']:4.2f} "
                      f"{m['gl_s_praez']:4.2f} {m['gl_s_treffer']:4.2f} {m['lg_mae']:5.2f} | {ts}")
        erg["varianten"].setdefault(name, {}).update({"mittel": m, "je_fahrer": je[name], "taps": taps[name]})
    zeilen.append("\nJe Fahrer: Pump-Treffer ±250 / Praezision / Gleit-F1")
    for name in je:
        zeilen.append(f"{name:24} " + "  ".join(f"u{f} {je[name][f]['pump_treffer']:.2f}/{je[name][f]['pump_praez']:.2f}/"
                                              f"{je[name][f]['gl_f1']:.2f}" for f in fahrer))
    zeilen.append("\n±400 ms Treffer (Mittel): " + ", ".join(f"{n} {MO.mittel(je[n]).get('pump_treffer', 0):.3f}" for n in []))
    zeilen.append("tau je Fahrer-Falte (Doppel-Modell): " + ", ".join(f"u{k[0]} {k[1]}/{k[2]}: {v[3]:.3f}" for k, v in cache.items()))
    zeilen.append("Hinschauen (Variante _hin, Paare): " + str(erg["varianten"]["v_sicher_doppel_m_hin"]["hinschauen_n"]))
    txt = "\n".join(zeilen)
    print(txt)
    (G.AUS / "tuning.txt").write_text(txt)
    (G.AUS / "tuning.json").write_text(json.dumps(erg, indent=1, default=float))
    if a.speichern:
        satz, groesse, cfg = VARIANTEN[a.speichern]
        sp = OHNE_POS if satz == "ohne_pos" else MIT_POS
        X = np.vstack([d["X"][d["y"] >= 0] for d in T]); y = np.concatenate([d["y"][d["y"] >= 0] for d in T])
        g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in T])
        mod = MO.Wrapper(groesse, sp).fit(X, y, MO.gewichte(y, g))
        th, _ = MO.theta_waehlen(mod, T, PUFFER, lag)
        kd = [(*kand_daten(d, mod.predict_proba(d["X"]), lag), d["fahrer"]) for d in T]
        _, tau, kclf = kand_trainieren(kd)
        with open(G.AUS / f"variante_{a.speichern}.pkl", "wb") as fh:
            pickle.dump({"clf": mod.m, "sp": mod.sp, "kand_clf": kclf, "cfg": {**A2.STANDARD, **cfg, "theta": th, "tau": tau},
                         "namen": M.NAMEN, "kand_namen": A2.KAND_NAMEN, "variante": a.speichern, "lag_ms": lag,
                         "klassen": ["aus", "gleiten", "pumpen"], "fahrer": fahrer}, fh)
        print("gespeichert:", G.AUS / f"variante_{a.speichern}.pkl", "theta", th, "tau", tau)


if __name__ == "__main__":
    main()
