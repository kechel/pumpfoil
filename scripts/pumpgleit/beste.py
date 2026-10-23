#!/usr/bin/env python3
"""Empfohlene Variante der Tuning-Runde (23.10.2026): „takt+pll_schwach0.4+ml_5s_hmm" — Gesamtmodell speichern,
Ableitung fuer eine Session, Bestand rechnen. REIN LESEND.

Ableitung je Lauf (Lauf + 5 s Puffer, Laufgrenzen unveraendert):
  1. Pumps: heutige Kandidaten (find_pumps_cadence) durch den Takt-Filter (physik.physik_filter: Doppel weg,
     Luecken im Takt fuellen) VEREINIGT mit dem adaptiven Takt-Verfolger (physik.physik), wo der einen Pump
     findet, der > 250 ms von jedem Filter-Pump liegt.
  2. Gleit-Zustand: hgb_7 OHNE Position-im-Lauf (21 Merkmale), ueberlappende 5-s-Fenster abgestimmt, HMM mit
     Dauern geglaettet.
  3. Pumps im Zustand gleiten fallen nur weg, wenn ihr Gipfel < 0,4 x Median-Gipfel des Laufs ist.
  4. Gleitphasen = Zustand gleiten, an den Pumps geteilt, 1,5-15 s, nach dem ersten Pump, bis Aufsetzen (Uhr-GPS).
  5. „genauer hinschauen": Gleitphasen >= 4 s, in denen das GPS-Tempo kaum faellt (> -0,05 m/s je s) — nicht
     als Gleiten gezaehlt, eigene Liste.

Aufruf (aus server/):
  ... beste.py --speichern                  Gesamtmodell -> data/ml/pumpgleit/beste.pkl
  ... beste.py --korpus --jobs 8            Bestand -> data/ml/pumpgleit/korpus_beste.jsonl
  ... beste.py --bericht                    Bestandszahlen + Rekord „laengste Gleitphase"
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import multiprocessing as mp
import pathlib
import pickle
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G
import merkmale as M
import physik as PH

PUFFER = 5.0
PFAD = G.AUS / "beste.pkl"
TAKT = {"doppel": 0.6, "alpha_fuell": 0.35, "luecke_min": 1.5, "gamma": 0.5}   # in 4 von 5 Falten gewaehlt
PLL = {"alpha": 0.3, "beta": 0.4, "delta": 0.4, "gamma": 0.5}
SCHWACH = 0.4
MOD = None


def ableiten(mod, U, laeufe):
    """Eingang: Uhr-Daten (gemeinsam.uhr_daten), Laeufe [(Start, Ende) Session-ms]. Ausgang je Lauf:
    {pump_ms, gleit, hinschauen, ende, longest}."""
    import tuning2 as T2
    S = M.signale(U)
    tw, X, li, puf = M.merkmale(S, laeufe, PUFFER)
    if X.shape[0] == 0:
        return [{"pump_ms": [], "gleit": [], "hinschauen": [], "ende": b, "longest": 0.0} for a, b in laeufe]
    p = mod["clf"].predict_proba(X[:, mod["sp"]])
    p5 = PH.abstimmen_5s(tw, p)
    p5[:, 1] *= (1 - mod["theta"]) / mod["theta"]
    p5 = p5 / p5.sum(1, keepdims=True)
    z = PH.hsmm_glaetten(p5, mod["prior"])
    takt = PH.physik_filter(S, laeufe, TAKT, PUFFER, U["gps"])
    pll = PH.physik(S, laeufe, PLL, PUFFER, U["gps"])
    abl = T2.gleit_aus_zustand(tw, z, laeufe, T2.schwach_streichen(T2.vereinigen(takt, pll), tw, z, S, SCHWACH))
    return T2.hinschauen(abl, U["gps"])


def speichern():
    import modell as MO
    from heute import laden
    from tuning import OHNE_POS
    lag = json.loads((G.AUS / "heute.json").read_text())["lag_ms"]
    D = MO.datensatz(laden(), PUFFER)
    T = [d for d in D if d["train"]]
    X = np.vstack([d["X"][d["y"] >= 0] for d in T]); y = np.concatenate([d["y"][d["y"] >= 0] for d in T])
    g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in T])
    mod = MO.Wrapper("hgb_7", OHNE_POS).fit(X, y, MO.gewichte(y, g))
    th, _ = MO.theta_waehlen(mod, T, PUFFER, lag)
    out = {"clf": mod.m, "sp": mod.sp, "spalten": OHNE_POS, "namen": M.NAMEN, "theta": th,
           "prior": np.array([np.mean(y == k) for k in (0, 1, 2)]), "takt": TAKT, "pll": PLL, "schwach": SCHWACH,
           "puffer_s": PUFFER, "schritt_s": M.SCHRITT_S, "hz": M.HZ, "klassen": ["aus", "gleiten", "pumpen"],
           "fahrer": sorted({d["fahrer"] for d in T}), "variante": "takt+pll_schwach0.4+ml_5s_hmm"}
    with open(PFAD, "wb") as f:
        pickle.dump(out, f)
    print("gespeichert:", PFAD, "theta", th)


def _init():
    global MOD
    import logging
    logging.disable(logging.WARNING)
    with open(PFAD, "rb") as f:
        MOD = pickle.load(f)


def eine(sid):
    db = G.db_lesend()
    try:
        U = G.uhr_daten(db, sid)
        if U is None:
            return {"id": sid, "fehler": "keine Daten"}
        segs = [g for g in U["segs"] if "t_start_session_ms" in g]
        laeufe = G.gespeicherte_laeufe(U)
        out = {"id": sid, "user": U["user"], "fs": U["fs"], "sport_class": U["sport_class"], "laeufe": []}
        if not laeufe:
            return out
        abl = ableiten(MOD, U, laeufe)
        for g, a in zip(segs, abl):
            leer = g.get("pumps") is None
            heute_gl = [x[2] for x in (g.get("glides") or [])]
            out["laeufe"].append({
                "dauer": round(float(g.get("duration_s") or 0), 1), "p_h": g.get("pumps"),
                "p_n": None if leer else len(a["pump_ms"]), "gn_h": len(heute_gl),
                "gn_n": None if leer else len(a["gleit"]), "gs_h": round(sum(heute_gl), 1),
                "gs_n": None if leer else round(sum((y - x) / 1000 for x, y in a["gleit"]), 1),
                "lg_h": g.get("longest_glide_s"), "lg_n": None if leer else a["longest"],
                "hin": None if leer else [[round(x), round((y - x) / 1000, 1)] for x, y in a["hinschauen"]]})
        return out
    except Exception as e:  # pragma: no cover
        return {"id": sid, "fehler": repr(e)[:200]}
    finally:
        db.rollback(); db.close()


def korpus(jobs, aus):
    from korpus import ids
    alle = ids()
    fertig = set()
    if aus.exists():
        for z in aus.read_text().splitlines():
            try:
                fertig.add(json.loads(z)["id"])
            except ValueError:
                pass
    rest = [i for i in alle if i not in fertig]
    print(f"{len(alle)} Sessions, offen {len(rest)}", flush=True)
    with mp.get_context("spawn").Pool(min(jobs, 8), initializer=_init) as pool, open(aus, "a") as f:
        for k, r in enumerate(pool.imap_unordered(eine, rest, chunksize=4)):
            f.write(json.dumps(r) + "\n")
            if k % 500 == 0:
                print(k, flush=True); f.flush()


def bericht(aus):
    from collections import defaultdict
    from sqlalchemy import or_
    Z = [json.loads(z) for z in aus.read_text().splitlines()]
    ok = [z for z in Z if "fehler" not in z]
    for titel, filt in (("alle", lambda z: True), ("pumpfoil", lambda z: (z["sport_class"] or "pumpfoil") == "pumpfoil")):
        L = [(z, l) for z in ok if filt(z) for l in z["laeufe"] if l["p_h"] is not None and l["p_n"] is not None]
        s = lambda k: sum(l[k] or 0 for _, l in L)
        lgh = np.array([l["lg_h"] or 0 for _, l in L]); lgn = np.array([l["lg_n"] or 0 for _, l in L])
        hin = [(z, h) for z, l in L for h in (l["hin"] or [])]
        foil = sum(l["dauer"] for _, l in L)
        print(f"[{titel}] Laeufe {len(L)}: Pumps {s('p_h')} -> {s('p_n')} ({100 * (s('p_n') / max(s('p_h'), 1) - 1):+.1f} %), "
              f"Gleit-Anzahl {s('gn_h')} -> {s('gn_n')}, Gleit-s {s('gs_h'):.0f} -> {s('gs_n'):.0f} "
              f"({100 * s('gs_n') / max(foil, 1):.1f} % der Foil-Zeit), laengste je Lauf Median {np.median(lgh):.1f} -> "
              f"{np.median(lgn):.1f} s (P90 {np.percentile(lgh, 90):.1f} -> {np.percentile(lgn, 90):.1f}), "
              f"„genauer hinschauen\" {len(hin)} in {len({z['id'] for z, _ in hin})} Sessions")
        rel = np.array([(l["p_n"] - l["p_h"]) / max(l["p_h"], 1) for _, l in L if l["p_h"] >= 10])
        print(f"   Pumps je Lauf (>= 10) relativ P10/P50/P90 {np.round(np.percentile(rel, [10, 50, 90]), 3)}")
    bg = {}
    for z in ok:
        ls = [l for l in z["laeufe"] if l["lg_n"] is not None]
        bg[z["id"]] = (max([l["lg_h"] or 0 for l in ls], default=0.0), max([l["lg_n"] for l in ls], default=0.0))
    print(f"best_glide_s je Session Median {np.median([h for h, _ in bg.values()]):.1f} -> {np.median([n for _, n in bg.values()]):.1f}")
    db = G.db_lesend()
    try:
        from app import models
        S, R, Us = models.Session, models.AnalysisResult, models.User
        rows = (db.query(S.id, S.user_id, R.best_glide_s).select_from(R).join(S, R.session_id == S.id)
                .join(Us, S.user_id == Us.id)
                .filter(S.deleted.isnot(True), S.flagged.isnot(True), Us.blocked.isnot(True), Us.hidden.isnot(True),
                        S.status.notin_(("recording", "live")), S.is_pumpfoil.is_(True), S.needs_classification.isnot(True),
                        or_(S.sport_class.is_(None), S.sport_class == "pumpfoil"),
                        or_(S.data_quality.is_(None), S.data_quality == "ok"), R.detection == "model").all())
    finally:
        db.rollback(); db.close()
    h = sorted(rows, key=lambda r: -(r[2] or 0))[:5]
    n = sorted([(r[0], r[1], bg.get(r[0], (0, 0.0))[1]) for r in rows], key=lambda r: -r[2])[:5]
    print("Rekord laengste Gleitphase heute:", [(r[0], f"u{r[1]}", r[2]) for r in h])
    print("Rekord laengste Gleitphase neu  :", [(r[0], f"u{r[1]}", r[2]) for r in n])
    gr = sorted(ok, key=lambda z: -abs(sum((l["p_n"] or 0) - (l["p_h"] or 0) for l in z["laeufe"])))[:6]
    print("Groesste Pump-Aenderung:", [(z["id"], f"u{z['user']}", z["sport_class"], sum(l["p_h"] or 0 for l in z["laeufe"]),
                                         sum(l["p_n"] or 0 for l in z["laeufe"])) for z in gr])
    hin = sorted([(z, l, h) for z in ok for l in z["laeufe"] for h in (l.get("hin") or [])], key=lambda x: -x[2][1])[:8]
    print("Beispiele „genauer hinschauen\":", [(z["id"], f"u{z['user']}", z["sport_class"], h[1]) for z, l, h in hin])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--speichern", action="store_true")
    ap.add_argument("--korpus", action="store_true")
    ap.add_argument("--bericht", action="store_true")
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus", default=str(G.AUS / "korpus_beste.jsonl"))
    a = ap.parse_args()
    if a.speichern:
        speichern()
    if a.korpus:
        korpus(a.jobs, pathlib.Path(a.aus))
    if a.bericht:
        bericht(pathlib.Path(a.aus))


if __name__ == "__main__":
    main()
