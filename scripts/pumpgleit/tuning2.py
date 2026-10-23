#!/usr/bin/env python3
"""Tuning-Runde 2: physikalischer Weg (Takt/Phase adaptiv, physik.py) mit Vorrang, ML-Varianten daran gemessen.
Fahrer heraus (leave-one-rider-out). REIN LESEND.

Varianten (gleiche Bewertung wie modell.py/tuning.py, dazu +-400 ms und Treffer an Kadenzwechseln):
  heute / hgb7_alt / ml_doppel     Vergleich (Stufe 11, erstes Modell, Kandidat-Klassifikator aus tuning.py)
  pll                              adaptiver Takt-Verfolger allein (physik.physik, feste Parameter)
  takt                             heutige Kandidaten + Takt-Filter (physik.physik_filter), Gleiten ueber Energie
  takt+ml[_hmm|_5s|_5s_hmm]        Takt-Pumps, Gleitphasen aus dem Gleit-Zustand (hgb_7 ohne Position), geglaettet
                                   per Median / HMM mit Dauern / ueberlappenden 5-s-Fenstern / beidem
  takt+mlp                         Gleit-Zustand aus kleinem Netz (MLP 16) auf den Rohsignalen
  takt&ml                          Gleiten nur, wo Physik UND Modell gleiten sagen
  takt_schwachF+ml_5s_hmm          Pumps im Zustand gleiten nur streichen, wenn Gipfel < F x Lauf-Median
  ...+hin                          Gleitphasen >= 4 s ohne Tempoabfall als „genauer hinschauen" statt Gleiten
  takt+pll_schwach0.4+ml_5s_hmm    EMPFOHLEN: Takt-Filter vereinigt mit dem Takt-Verfolger, sonst wie oben
Takt-Filter-Parameter je Falte auf den Trainingsfahrern per Gitter gewaehlt.

Aufruf: cd server && DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/tuning2.py
Ausgabe: server/data/ml/pumpgleit/tuning2.json, tuning2.txt
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import itertools
import json
import logging
import pathlib
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G
import merkmale as M
import modell as MO
import physik as PH
import ableitung2 as A2
from heute import laden, zonen
from tuning import OHNE_POS, taps_laden, taps_bewerten, kand_daten, kand_trainieren

PUFFER = 5.0
GITTER = {"doppel": (0.5, 0.6, 0.65), "alpha_fuell": (0.1, 0.35), "luecke_min": (1.5, 1.6), "gamma": (0.3, 0.5, 0.7)}
PLL_FEST = {"alpha": 0.3, "beta": 0.4, "delta": 0.4, "gamma": 0.5}


def extra(d, abl, lag):
    """+-400-ms-Treffer und Treffer/Extra in +-3 s um Kadenzwechsel (Brett: Median der naechsten 3 Abstaende
    weicht > 20 % von den vorigen 3 ab)."""
    P, laeufe = d["P"], d["laeufe"]
    r = defaultdict(float)
    for lo, hi, i, j in zonen(P, laeufe):
        w = np.array([x for x in P["laeufe"][j]["pumps_tief"] if lo <= x <= hi])
        e = np.array([x for x in abl[i]["pump_ms"] if lo + lag <= x <= hi + lag])
        t4, _, x4, _ = G.zuordnen(w, e, 400.0, lag)
        r["t400"] += t4; r["brett"] += w.size
        if w.size >= 8:
            iv = np.diff(w)
            for k in range(3, iv.size - 3):
                a_, b_ = np.median(iv[k - 3:k]), np.median(iv[k:k + 3])
                if abs(b_ - a_) / a_ > 0.2:
                    c = w[k]
                    ww = w[(w >= c - 3000) & (w <= c + 3000)]
                    ee = e[(e >= c - 3000 + lag) & (e <= c + 3000 + lag)]
                    tt, vv, xx, _ = G.zuordnen(ww, ee, 250.0, lag)
                    r["w_t"] += tt; r["w_n"] += ww.size; r["w_x"] += xx; r["w_e"] += ee.size; r["w_anz"] += 1
    return r


def gleit_aus_zustand(tw, zust, laeufe, abl_p, gleit_min=1.5):
    """Gleitphasen = Zustand gleiten (1), an den Pumps geteilt, nach dem ersten Pump, vor dem Ende."""
    out = []
    for (a, b, bp), ap in zip(M.zone(laeufe, PUFFER), abl_p):
        m = (tw >= a) & (tw < bp)
        tz, zz = tw[m], zust[m]
        pumps = np.asarray(ap["pump_ms"])
        gl = []
        if pumps.size and tz.size:
            gm = (zz == 1) & (tz < ap["ende"]) & (tz > pumps[0])
            for s0, s1 in A2._laeufe_stuecke(gm):
                x0, x1 = tz[s0] - 125, min(tz[s1 - 1] + 125, ap["ende"])
                gr = [x0] + [x for x in pumps if x0 < x < x1] + [x1]
                for y0, y1 in zip(gr[:-1], gr[1:]):
                    if gleit_min <= (y1 - y0) / 1000.0 <= 15.0:
                        gl.append((float(y0), float(y1)))
        out.append({**ap, "gleit": gl, "longest": round(max([(y - x) / 1000 for x, y in gl], default=0.0), 2)})
    return out


def schwach_streichen(abl, tw, zust, S, frac):
    """Takt-Pumps im Zustand gleiten nur streichen, wenn ihr Gipfel < frac x Median-Gipfel des Laufs ist
    (Energie faellt) — kraeftige Pumps bleiben auch dort, wo das Modell gleiten sagt."""
    t, v = S["t"], S["v"]
    out = []
    for a in abl:
        ps = np.asarray(a["pump_ms"])
        if ps.size == 0:
            out.append(a); continue
        amp = v[np.clip(np.searchsorted(t, ps), 0, t.size - 1)]
        ref = float(np.median(amp))
        j = np.clip(np.searchsorted(tw, ps - 125), 0, max(tw.size - 1, 0))
        weg = (zust[j] == 1) & (amp < frac * ref) if tw.size else np.zeros(ps.size, bool)
        out.append({**a, "pump_ms": list(ps[~weg])})
    return out


def hinschauen(abl, gps, ab_s=4.0, steigung=-0.05):
    """Gleitphasen >= ab_s, in denen das GPS-Tempo kaum faellt, nicht als Gleiten zaehlen, sondern ausweisen."""
    out = []
    for a in abl:
        gl, hin = [], []
        for x0, x1 in a["gleit"]:
            m = (gps[:, 0] >= x0) & (gps[:, 0] <= x1) & np.isfinite(gps[:, 3])
            if (x1 - x0) / 1000.0 >= ab_s and m.sum() >= 3 and np.polyfit(gps[m, 0] / 1000.0, gps[m, 3], 1)[0] > steigung:
                hin.append((x0, x1))
            else:
                gl.append((x0, x1))
        out.append({**a, "gleit": gl, "hinschauen": hin,
                    "longest": round(max([(y - x) / 1000 for x, y in gl], default=0.0), 2)})
    return out


def vereinigen(abl1, abl2, abstand_ms=250.0):
    """Takt-Filter-Pumps plus Takt-Verfolger-Pumps, die weiter als abstand_ms von jedem Takt-Filter-Pump liegen."""
    out = []
    for a1, a2 in zip(abl1, abl2):
        p1 = np.asarray(a1["pump_ms"]); p2 = np.asarray(a2["pump_ms"])
        if p1.size and p2.size:
            d = np.min(np.abs(p2[:, None] - p1[None, :]), axis=1)
            p = np.sort(np.concatenate([p1, p2[d > abstand_ms]]))
        else:
            p = p1 if p1.size else p2
        out.append({**a1, "pump_ms": list(p)})
    return out


def schnitt(abl1, abl2):
    """Gleiten nur, wo beide Ableitungen gleiten sagen."""
    out = []
    for a1, a2 in zip(abl1, abl2):
        gl = []
        for x0, x1 in a1["gleit"]:
            for y0, y1 in a2["gleit"]:
                lo, hi = max(x0, y0), min(x1, y1)
                if (hi - lo) / 1000.0 >= 1.5:
                    gl.append((lo, hi))
        out.append({**a1, "gleit": gl, "longest": round(max([(y - x) / 1000 for x, y in gl], default=0.0), 2)})
    return out


def zustand_q(p, theta, glaett=3):
    from scipy.ndimage import median_filter
    q = p[:, 1] / np.maximum(p[:, 1] + p[:, 2], 1e-9)
    z = np.where(p[:, 0] >= 0.5, 0, np.where(q >= theta, 1, 2))
    return median_filter(z, size=glaett, mode="nearest")


def roh_fenster(S, tw, laeufe):
    """Rohsignale fuer das kleine Netz: senkrecht + waagerecht, 2 s um die Fenstermitte, auf den Lauf-RMS normiert."""
    t, v, h = S["t"], S["v"], S["h"]
    X = np.zeros((tw.size, 100), np.float32)
    for a, b, bp in M.zone(laeufe, PUFFER):
        m = (tw >= a) & (tw < bp)
        il = (t >= a) & (t <= b)
        rv = max(float(np.sqrt(np.mean(v[il] ** 2))) if il.any() else 0.1, 1e-3)
        rh = max(float(np.sqrt(np.mean(h[il] ** 2))) if il.any() else 0.1, 1e-3)
        for n in np.flatnonzero(m):
            i = np.searchsorted(t, tw[n]) - 25
            sv = v[max(i, 0):i + 50]; sh = h[max(i, 0):i + 50]
            if sv.size == 50:
                X[n, :50] = sv / rv; X[n, 50:] = sh / rh
    return X


def main():
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
    for d in T + TAPS:
        if "S" in d:
            pass
    # Physik-Gitter einmal je Paar vorrechnen
    kombis = [dict(zip(GITTER, v)) for v in itertools.product(*GITTER.values())]
    phys_cache = {}
    for d in T:
        for ci, c in enumerate(kombis):
            phys_cache[(id(d), ci)] = PH.physik_filter(d["S"], d["laeufe"], c, PUFFER, d["P"]["uhr"]["gps"])
    print("Physik-Gitter gerechnet", flush=True)
    prior = None
    erg = defaultdict(dict); taps = defaultdict(list); ex = defaultdict(lambda: defaultdict(float))
    gewaehlt = {}
    from sklearn.neural_network import MLPClassifier
    for f in fahrer:
        tr = [d for d in T if d["fahrer"] != f]
        te = [d for d in T if d["fahrer"] == f]
        # Physik-Parameter auf den Trainingsfahrern
        best = (-1, 0)
        for ci in range(len(kombis)):
            n = MO.note(MO.zusammen([MO.bewerten(d, phys_cache[(id(d), ci)], lag) for d in tr]))
            if n > best[0]:
                best = (n, ci)
        c = kombis[best[1]]
        gewaehlt[f] = c
        # Gleit-Zustandsmodell (ohne Position) + Kandidat-Klassifikator
        X = np.vstack([d["X"][d["y"] >= 0] for d in tr]); y = np.concatenate([d["y"][d["y"] >= 0] for d in tr])
        g = np.concatenate([np.full((d["y"] >= 0).sum(), d["fahrer"]) for d in tr])
        w = MO.gewichte(y, g)
        mod = MO.Wrapper("hgb_7", OHNE_POS).fit(X, y, w)
        th, _ = MO.theta_waehlen(mod, tr, PUFFER, lag)
        kd = [(*kand_daten(d, mod.predict_proba(d["X"]), lag), d["fahrer"]) for d in tr]
        kf, tau, _ = kand_trainieren(kd)
        prior = np.array([np.mean(y == k) for k in (0, 1, 2)])
        # kleines Netz auf Rohsignalen
        Xr = np.vstack([roh_fenster(d["S"], d["tw"], d["laeufe"])[d["y"] >= 0] for d in tr])
        rng = np.random.default_rng(0)
        # Klassen ausgleichen per Wiederholung (MLP kennt keine Gewichte)
        idx = np.concatenate([rng.choice(np.flatnonzero((y == k)), size=4000, replace=True) for k in (0, 1, 2)])
        mlp = MLPClassifier(hidden_layer_sizes=(16,), alpha=1.0, max_iter=300, random_state=0).fit(Xr[idx], y[idx])
        mod_alt = MO.Wrapper("hgb_7", [n for n in M.NAMEN if n not in M.GRUPPEN["kreisel"]]).fit(X, y, w)
        th_alt, _ = MO.theta_waehlen(mod_alt, tr, PUFFER, lag)

        def varianten(dd, U_gps, S, tw, Xf, laeufe):
            p = mod.predict_proba(Xf)
            phys = PH.physik_filter(S, laeufe, c, PUFFER, U_gps)
            v = {"takt": phys, "pll": PH.physik(S, laeufe, PLL_FEST, PUFFER, U_gps)}
            v["hgb7_alt"] = M.ableiten(tw, mod_alt.predict_proba(Xf), S, laeufe, PUFFER, theta=th_alt)
            v["ml_doppel"] = A2.ableiten2(tw, p, Xf, S, laeufe, {"theta": th, "tau": tau, "theta_hoch": 1.01,
                                                                 "doppel": "modell"}, kf, gps=U_gps)
            z_med = zustand_q(p, th)
            v["takt+ml"] = gleit_aus_zustand(tw, z_med, laeufe, phys)
            # HMM: Emission aus p mit q-Schwelle als Verschiebung (theta wirkt wie ein Prior)
            ps = p.copy(); ps[:, 1] *= (1 - th) / th
            ps = ps / ps.sum(1, keepdims=True)
            v["takt+ml_hmm"] = gleit_aus_zustand(tw, PH.hsmm_glaetten(ps, prior), laeufe, phys)
            p5 = PH.abstimmen_5s(tw, p)
            v["takt+ml_5s"] = gleit_aus_zustand(tw, zustand_q(p5, th, 1), laeufe, phys)
            p5s = p5.copy(); p5s[:, 1] *= (1 - th) / th; p5s = p5s / p5s.sum(1, keepdims=True)
            v["takt+ml_5s_hmm"] = gleit_aus_zustand(tw, PH.hsmm_glaetten(p5s, prior), laeufe, phys)
            pm = mlp.predict_proba(roh_fenster(S, tw, laeufe)) if tw.size else np.zeros((0, 3))
            v["takt+mlp"] = gleit_aus_zustand(tw, zustand_q(pm, 0.5), laeufe, phys)
            v["takt&ml"] = schnitt(phys, v["takt+ml"])
            z5h = PH.hsmm_glaetten(p5s, prior)
            for frac in (0.4, 0.5, 0.6):
                v[f"takt_schwach{frac}+ml_5s_hmm"] = gleit_aus_zustand(tw, z5h, laeufe, schwach_streichen(phys, tw, z5h, S, frac))
            v["takt_schwach0.4+ml_5s_hmm+hin"] = hinschauen(v["takt_schwach0.4+ml_5s_hmm"], U_gps)
            vereint = vereinigen(phys, v["pll"])
            v["takt+pll_schwach0.4+ml_5s_hmm"] = gleit_aus_zustand(tw, z5h, laeufe, schwach_streichen(vereint, tw, z5h, S, 0.4))
            return v

        rs = defaultdict(list)
        for d in te:
            H = MO.heute_abl(d)
            vs = varianten(d, d["P"]["uhr"]["gps"], d["S"], d["tw"], d["X"], d["laeufe"])
            vs["heute"] = H
            for name, abl in vs.items():
                rs[name].append(MO.bewerten(d, abl, lag))
                for k, val in extra(d, abl, lag).items():
                    ex[name][k] += val
        for name, r in rs.items():
            erg[name][f] = MO.zusammen(r)
        if f == 2:
            for Tp in TAPS:
                vs = varianten(Tp, Tp["U"]["gps"], Tp["S"], Tp["tw"], Tp["X"], Tp["laeufe"])
                vs["heute"] = [{"pump_ms": h["pump_ms"]} for h in G.heute_pumps(Tp["U"], Tp["laeufe"])]
                for name, abl in vs.items():
                    taps[name].append({"sid": Tp["sid"], **taps_bewerten(Tp, abl, lag)})
        print("Falte", f, "fertig, Physik", c, flush=True)
    reihen = ["heute", "hgb7_alt", "ml_doppel", "pll", "takt", "takt+ml", "takt+ml_hmm", "takt+ml_5s", "takt+ml_5s_hmm",
              "takt+mlp", "takt&ml", "takt_schwach0.4+ml_5s_hmm", "takt_schwach0.5+ml_5s_hmm",
              "takt_schwach0.6+ml_5s_hmm", "takt_schwach0.4+ml_5s_hmm+hin", "takt+pll_schwach0.4+ml_5s_hmm"]
    zeilen = [f"{'Variante':16} {'PumpF1':>6} {'Tr250':>5} {'Tr400':>5} {'Pr250':>5} {'|Anz|':>5} {'|Kad|':>5} | "
              f"{'Wechsel Tr/Extra':>16} | {'GlP':>4} {'GlR':>4} {'GlF1':>4} {'sP':>4} {'sR':>4} {'LgMAE':>5} | "
              f"Taps je Session: erkannt/doppelt/wirklich fehlend/Treffer400"]
    out = {"physik_je_falte": gewaehlt, "varianten": {}}
    for name in reihen:
        m = MO.mittel(erg[name]); e = ex[name]
        tp = {t["sid"]: t for t in taps[name]}
        zeilen.append(f"{name:16} {m['pump_f1']:6.3f} {m['pump_treffer']:5.3f} {e['t400'] / max(e['brett'], 1):5.3f} "
                      f"{m['pump_praez']:5.3f} {m['anz_fehler_rel']:5.3f} {m['kad_fehler_hz']:5.3f} | "
                      f"{e['w_t'] / max(e['w_n'], 1):7.3f}/{e['w_x'] / max(e['w_e'], 1):6.3f} ({int(e['w_anz'])}) | "
                      f"{m['gl_praez']:4.2f} {m['gl_treffer']:4.2f} {m['gl_f1']:4.2f} {m['gl_s_praez']:4.2f} "
                      f"{m['gl_s_treffer']:4.2f} {m['lg_mae']:5.2f} | "
                      + "  ".join(f"#{s} {tp[s]['erkannt']}/{tp[s]['doppelt']}/{tp[s]['fehlend_ohne_doppel']:+d}/{tp[s]['t400']}"
                                  for s in (295, 354) if s in tp))
        out["varianten"][name] = {"mittel": m, "je_fahrer": erg[name], "extra": dict(e), "taps": taps[name]}
    zeilen.append("\nJe Fahrer: Pump-Treffer / Praezision / Gleit-F1")
    for name in reihen:
        zeilen.append(f"{name:16} " + "  ".join(f"u{f} {erg[name][f]['pump_treffer']:.2f}/{erg[name][f]['pump_praez']:.2f}/"
                                                f"{erg[name][f]['gl_f1']:.2f}" for f in fahrer))
    zeilen.append("\nPhysik-Parameter je Falte: " + json.dumps({str(k): v for k, v in gewaehlt.items()}))
    zeilen.append("Taps: getippt " + ", ".join(f"#{t['sid']} {t['getippt']}" for t in taps["heute"])
                  + " · Versatz " + ", ".join(f"#{T_['sid']} {T_['off']:.0f} ms" for T_ in TAPS))
    txt = "\n".join(zeilen)
    print(txt)
    (G.AUS / "tuning2.txt").write_text(txt)
    (G.AUS / "tuning2.json").write_text(json.dumps(out, indent=1, default=float))


if __name__ == "__main__":
    main()
