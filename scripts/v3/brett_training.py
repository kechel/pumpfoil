#!/usr/bin/env python3
"""Erkennung v3, Schritt 3: die Uhr gegen die Brett-Wahrheit messen und darauf trainieren. REIN LESEND.

Wahrheit je Uhr-Sekunde aus dem Handy am Brett (Versatz aus paare_ausrichten.py):
  pumpen  Brett-Pump (Nick-Gipfel >= 3°) in ±0,6 s und >= 2 m/s
  gleiten auf dem Foil ohne Brett-Pump in ±1,5 s: >= 2,5 m/s und im Lauf-Fenster des Brett-Handys
  aus     sonst
„Auf dem Foil" = pumpen oder gleiten. Gemessen werden das bisherige On-Foil-Modell (foil_rf) und
Stufe A (Teilmodell, das den Fahrer nie gesehen hat) — vor allem: wie viele GLEIT-Sekunden sie
erkennen (der ruhige Arm). Dann ein Modell auf der Brett-Wahrheit, bewertet mit herausgehaltenem
Paar (je Fahrt) bzw. Fahrer.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/brett_training.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "2")
import json
import pathlib
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ML = WURZEL / "server" / "data" / "ml"

# Aus Schritt 2 als brauchbar bewertet; #10874/#10873 ist dieselbe Fahrt wie #10875/#10873.
GUTE = [(9535, 9534), (9650, 9649), (10195, 10194), (10248, 10250), (10328, 10326), (10875, 10873)]
AUS, GLEITEN, PUMPEN = 0, 1, 2


def wahrheit(B, t_brett):
    p = np.sort(B["pumps"])
    v = np.interp(t_brett, B["t"], B["v"])
    lauf = np.zeros(t_brett.size, bool)
    for a, b in B["laeufe"]:
        lauf |= (t_brett >= a - 3000) & (t_brett <= b + 3000)
    j = np.searchsorted(p, t_brett)
    links = np.where(j > 0, t_brett - p[np.clip(j - 1, 0, p.size - 1)], 1e9)
    rechts = np.where(j < p.size, p[np.clip(j, 0, p.size - 1)] - t_brett, 1e9)
    nah = np.minimum(links, rechts)
    z = np.full(t_brett.size, AUS)
    z[(nah <= 600) & (v >= 2.0)] = PUMPEN
    z[(z == AUS) & lauf & (v >= 2.5) & (nah > 1500)] = GLEITEN
    return z


def daten():
    import brett_wahrheit as W
    from app import db, models
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import merkmale as M, stufe_a
    from app.analysis.foil_model import load_model, extract_features, windowize
    paare = {(p["brett"], p["uhr"]): p for p in json.loads((ML / "v3" / "paare.json").read_text())}
    alt = load_model()
    S = db.SessionLocal()
    zeilen = []
    try:
        for b_id, u_id in GUTE:
            versatz = paare[(b_id, u_id)]["versatz_ms"]
            B = W.brett(S, b_id)
            u = S.get(models.Session, u_id)
            tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": u.session_uuid, "accel_hz": u.accel_hz,
                                                             "accel_scale": u.accel_scale}))
            t, X = M.merkmale(tb)
            # bisheriges Modell auf DIESER Achse (wie detect_v2.model_mask_on_timebase)
            off = float(tb.window_start_ms)
            n = int(round((tb.window_end_ms - off) / 1000 * tb.accel_hz)) + 1
            ziel = off + np.arange(n) / tb.accel_hz * 1000
            idx = np.clip(np.searchsorted(tb.t_accel_ms, ziel), 0, tb.accel.shape[0] - 1)
            gps0 = [[g[0] - off] + list(g[1:]) for g in tb.gps]
            p_alt = alt.predict_proba(windowize(extract_features(gps0, tb.accel[idx], tb.accel_hz,
                                                                 tb.accel_scale)))[:, 1]
            p_a = stufe_a.wahrscheinlichkeit(tb, fahrer=u.user_id)
            z = wahrheit(B, t + versatz)
            # nur den gemeinsamen Zeitraum (Brett-Aufnahme laeuft)
            drin = (t + versatz >= B["t"][0]) & (t + versatz <= B["t"][-1])
            zeilen.append({"paar": (b_id, u_id), "fahrer": u.user_id, "t": t[drin], "X": X[drin],
                           "z": z[drin], "p_alt": p_alt[drin], "p_a": p_a[drin]})
            print(f"#{b_id}+#{u_id} u{u.user_id}: {drin.sum()} s · pumpen {int((z[drin]==2).sum())} "
                  f"gleiten {int((z[drin]==1).sum())} aus {int((z[drin]==0).sum())}", flush=True)
    finally:
        S.rollback(); S.close()
    return zeilen


def bewerten(name, z, p, schwelle=0.5):
    auf = z > 0
    v = p >= schwelle
    tp = int((v & auf).sum()); fp = int((v & ~auf).sum()); fn = int((~v & auf).sum())
    gl = z == GLEITEN; pu = z == PUMPEN
    print(f"  {name:28s} Praezision {tp / max(tp + fp, 1):.3f} · Trefferquote {tp / max(tp + fn, 1):.3f} · "
          f"Pump-Sek. erkannt {v[pu].mean() if pu.any() else float('nan'):.0%} · "
          f"GLEIT-Sek. erkannt {v[gl].mean() if gl.any() else float('nan'):.0%}")


def main():
    from sklearn.ensemble import HistGradientBoostingClassifier
    from app.analysis.v3 import merkmale as M
    Z = daten()
    alle_z = np.concatenate([d["z"] for d in Z])
    print(f"\nzusammen: {alle_z.size} s · pumpen {int((alle_z==2).sum())} · gleiten {int((alle_z==1).sum())}")
    print("\nBisherige Modelle gegen die Brett-Wahrheit (alle Paare):")
    bewerten("bisheriges On-Foil-Modell", alle_z, np.concatenate([d["p_alt"] for d in Z]))
    bewerten("Stufe A (Fahrer nie gesehen)", alle_z, np.concatenate([d["p_a"] for d in Z]))
    for fahrer in sorted({d["fahrer"] for d in Z}):
        zz = np.concatenate([d["z"] for d in Z if d["fahrer"] == fahrer])
        print(f" u{fahrer}:")
        bewerten("  bisheriges", zz, np.concatenate([d["p_alt"] for d in Z if d["fahrer"] == fahrer]))
        bewerten("  Stufe A", zz, np.concatenate([d["p_a"] for d in Z if d["fahrer"] == fahrer]))
    # Modell auf Brett-Wahrheit, je Paar herausgehalten
    print("\nNeues Modell auf der Brett-Wahrheit, je FAHRT herausgehalten:")
    ps, zs, fs = [], [], []
    for k, test in enumerate(Z):
        tr = [d for j, d in enumerate(Z) if j != k]
        Xtr = np.concatenate([M.mit_kontext(d["X"]) for d in tr]); ytr = np.concatenate([d["z"] > 0 for d in tr])
        clf = HistGradientBoostingClassifier(max_iter=250, learning_rate=0.06, max_leaf_nodes=31,
                                             min_samples_leaf=40, class_weight="balanced", random_state=0)
        clf.fit(Xtr, ytr)
        ps.append(clf.predict_proba(M.mit_kontext(test["X"]))[:, 1]); zs.append(test["z"]); fs.append(test["fahrer"])
    bewerten("Brett-Modell (Fahrt heraus)", np.concatenate(zs), np.concatenate(ps))
    for fahrer in sorted(set(fs)):
        bewerten(f"   nur u{fahrer}", np.concatenate([z for z, f in zip(zs, fs) if f == fahrer]),
                 np.concatenate([p for p, f in zip(ps, fs) if f == fahrer]))
    np.savez_compressed(ML / "v3" / "brett_cv.npz", z=np.concatenate(zs), p=np.concatenate(ps),
                        p_alt=np.concatenate([d["p_alt"] for d in Z]), p_a=np.concatenate([d["p_a"] for d in Z]))


if __name__ == "__main__":
    main()
