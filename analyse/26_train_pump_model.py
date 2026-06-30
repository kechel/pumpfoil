"""v1 Pump-Modell: Kandidaten-Peak-Klassifikator (RandomForest) auf der getappten Wahrheit.

Idee statt fester Schwelle: ALLE plausiblen Aufwärts-Peaks im Vertikalsignal als Kandidaten
sammeln, je Kandidat Features rechnen (Amplitude, Prominenz, Rhythmik, Abstände …) und lernen,
welche echte Pumps sind. So lassen sich subtile (Markus-)Pumps annehmen UND Fehlalarme verwerfen.

Wahrheit = PumpTruth-Konsens (compare_takes), per period-begrenztem Offset auf die Accel-
Zeitbasis ausgerichtet. Eval = Leave-one-run-out (GroupKFold über die Läufe), Vergleich gegen
den festen v3-Detektor. NUR Auswertung — schreibt/aktiviert nichts in der Pipeline.

Aufruf:  server/.venv/bin/python analyse/26_train_pump_model.py
"""
from __future__ import annotations

import os
import sys
from collections import defaultdict

_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV = os.path.join(_HERE, "server", ".env")
if os.path.exists(_ENV):
    for _l in open(_ENV):
        _l = _l.strip()
        if _l.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = _l.split("=", 1)[1].strip().strip('"').strip("'")
sys.path.insert(0, os.path.join(_HERE, "server"))
os.chdir(os.path.join(_HERE, "server"))

import numpy as np  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app import models, storage  # noqa: E402
from app.analysis import analyze_gps  # noqa: E402
from app.analysis.foil_model import predict_foiling_mask, detect_jumps  # noqa: E402
from app.ml.features import bandpass_fft, vertical_against_gravity, magnitude_g, pump_rhythmicity, FILTER_BAND  # noqa: E402
from app.ml.pumps import find_pumps_local, MIN_PEAK_DISTANCE_S  # noqa: E402
from app.pumptruth import compare_takes  # noqa: E402

MATCH_TOL_MS = 200
CAND_FLOOR_G = 0.008   # sehr niedrig: Kandidaten sollen auch subtile echte Pumps enthalten
CAND_MIN_DIST_S = 0.30
FEATURES = ["amp", "rel_std", "prominence", "rhythmicity", "mag", "gap_prev_ms", "gap_next_ms"]


def _prep(s):
    gps = storage.load_gps(s.session_uuid); accel = storage.load_accel(s.session_uuid)
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    if (ts0 is not None or ts1 is not None) and gps:
        lo = ts0 or 0; hi = ts1 if ts1 is not None else gps[-1][0]
        gps = [[x[0] - lo] + list(x[1:]) for x in gps if lo <= x[0] <= hi]
        a_lo = max(int(round(lo / 1000 * s.accel_hz)), 0); a_hi = min(int(round(hi / 1000 * s.accel_hz)), accel.shape[0])
        accel = accel[a_lo:a_hi] if a_hi > a_lo else accel[0:0]
    fs = float(s.accel_hz)
    res = analyze_gps(gps, gps_hz=s.gps_hz,
                      mask_override=predict_foiling_mask(gps, accel, fs, s.accel_scale),
                      impulse_times_ms=detect_jumps(accel, fs, s.accel_scale), water_rings=None)
    vsig = bandpass_fft(vertical_against_gravity(accel, s.accel_scale, fs), fs, *FILTER_BAND)
    mag = magnitude_g(accel, s.accel_scale)
    return res, vsig, mag, fs


def _candidates(vsig, mag, fs, seg):
    """Alle Aufwärts-Peaks (lokale Maxima > CAND_FLOOR) im Segment, Mindestabstand greedy."""
    alo = max(int(round(seg["t_start_ms"] / 1000 * fs)), 0); ahi = min(int(round(seg["t_end_ms"] / 1000 * fs)), vsig.size)
    sig = vsig[alo:ahi]
    if sig.size < 3:
        return [], alo, sig
    rh = pump_rhythmicity(sig, fs)
    std = float(np.std(sig)) or 1e-6
    md = max(int(round(CAND_MIN_DIST_S * fs)), 1)
    cand = np.where((sig[1:-1] > sig[:-2]) & (sig[1:-1] >= sig[2:]) & (sig[1:-1] > CAND_FLOOR_G))[0] + 1
    order = cand[np.argsort(-sig[cand])]; taken = []; blocked = np.zeros(sig.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx)); blocked[max(idx - md, 0):min(idx + md + 1, sig.size)] = True
    taken = sorted(taken)
    feats = []
    for j, i in enumerate(taken):
        w0, w1 = max(i - int(fs), 0), min(i + int(fs) + 1, sig.size)
        prom = float(sig[i] - np.median(sig[w0:w1]))
        gp = (taken[j] - taken[j - 1]) / fs * 1000 if j > 0 else 9999.0
        gn = (taken[j + 1] - taken[j]) / fs * 1000 if j < len(taken) - 1 else 9999.0
        feats.append({"i_global": alo + i, "amp": float(sig[i]), "rel_std": float(sig[i] / std),
                      "prominence": prom, "rhythmicity": float(rh[i]),
                      "mag": float(mag[alo + i]) if alo + i < mag.size else 0.0,
                      "gap_prev_ms": gp, "gap_next_ms": gn})
    return feats, alo, sig


def _best_offset(truth, ref, maxshift):
    best, bc = 0, float("inf")
    for off in range(-maxshift, maxshift + 1, 10):
        c = float(np.sum([np.min(np.abs(ref - (t - off))) for t in truth]))
        if c < bc:
            bc, best = c, off
    return best


def build():
    db = SessionLocal()
    rows = db.query(models.PumpTruth).order_by(models.PumpTruth.take, models.PumpTruth.t_ms).all()
    groups = defaultdict(lambda: defaultdict(list))
    for r in rows:
        groups[(r.session_id, r.run_idx)][r.take].append(r.t_ms)
    data = []   # je Lauf: (label, X, cand_ms, truth_ms, v3_ms, window)
    for (sid, run), bt in sorted(groups.items()):
        s = db.get(models.Session, sid)
        cmp = compare_takes([{"take": k, "times_ms": v} for k, v in sorted(bt.items())])
        if not cmp.get("consensus_ms"):
            continue
        truth = np.asarray(cmp["consensus_ms"], float); w = cmp["window_ms"]
        res, vsig, mag, fs = _prep(s)
        segs = res["segments"] if run is None else [res["segments"][run]] if run < len(res["segments"]) else []
        feats, v3 = [], []
        for seg in segs:
            f, alo, sig = _candidates(vsig, mag, fs, seg)
            feats += f
            v3 += list((alo + find_pumps_local(sig, fs)) / fs * 1000.0)
        if not feats:
            continue
        cand_ms = np.array([f["i_global"] / fs * 1000 for f in feats])
        period = float(np.median(np.diff(truth))) if truth.size > 1 else 700.0
        off = _best_offset(truth, cand_ms, int(period / 2))
        al = truth - off
        # Label: Kandidat ist Pump, wenn naechster ausgerichteter Wahrheits-Pump < tol
        y = np.array([1 if np.min(np.abs(al - c)) < MATCH_TOL_MS else 0 for c in cand_ms])
        X = np.array([[f[k] for k in FEATURES] for f in feats])
        data.append({"sid": sid, "run": run, "X": X, "y": y, "cand_ms": cand_ms, "al": al,
                     "v3": np.array(sorted(v3)), "w": w, "label": f"{sid}" + ("" if run is None else f"/r{run}")})
    db.close()
    return data


def score(pred_ms, truth, w, off=0):
    """Recall/Precision im Fenster (truth schon ausgerichtet; pred in Kandidaten-Zeitbasis)."""
    pw = pred_ms[(pred_ms >= w[0] - off - MATCH_TOL_MS) & (pred_ms <= w[1] - off + MATCH_TOL_MS)]
    if pw.size == 0 or truth.size == 0:
        return 0.0, 0.0, pw.size
    rec = np.mean([np.min(np.abs(pw - t)) < MATCH_TOL_MS for t in truth])
    fp = np.sum([np.min(np.abs(truth - d)) > MATCH_TOL_MS for d in pw])
    return rec, (pw.size - fp) / pw.size, pw.size


def main():
    from sklearn.ensemble import RandomForestClassifier
    data = build()
    if not data:
        print("Keine gelabelten Laeufe."); return
    n = len(data)
    tot = sum(d["y"].size for d in data); pos = sum(int(d["y"].sum()) for d in data)
    print(f"{n} gelabelte Laeufe | {tot} Kandidaten, davon {pos} Pumps ({100*pos/tot:.0f}%)")
    # Kandidaten-Recall-Decke: wie viele Wahrheits-Pumps haben ueberhaupt einen Kandidaten?
    for d in data:
        ceil = np.mean([np.min(np.abs(d["cand_ms"] - t)) < MATCH_TOL_MS for t in d["al"]])
        print(f"  {d['label']}: Kandidaten-Recall-Decke {100*ceil:.0f}% ({d['al'].size} Wahrheit)")
    print("\nLeave-one-run-out (Modell vs. v3):")
    print(f"{'Lauf':12} {'Modell R/P':14} {'v3 R/P':14}")
    for i in range(n):
        tr = [d for j, d in enumerate(data) if j != i]; te = data[i]
        Xtr = np.vstack([d["X"] for d in tr]); ytr = np.concatenate([d["y"] for d in tr])
        if len(set(ytr)) < 2:
            print(f"{te['label']:12} (zu wenig Klassen im Training)"); continue
        clf = RandomForestClassifier(n_estimators=200, min_samples_leaf=2, class_weight="balanced", random_state=0)
        clf.fit(Xtr, ytr)
        pred = clf.predict(te["X"])
        pred_ms = te["cand_ms"][pred == 1]
        mr, mp, _ = score(pred_ms, te["al"], te["w"])
        vr, vp, _ = score(te["v3"], te["al"], te["w"])
        print(f"{te['label']:12} {100*mr:>4.0f}% /{100*mp:>4.0f}%   {100*vr:>4.0f}% /{100*vp:>4.0f}%")
    # Feature-Importances (Modell auf allen Daten)
    X = np.vstack([d["X"] for d in data]); y = np.concatenate([d["y"] for d in data])
    clf = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, class_weight="balanced", random_state=0).fit(X, y)
    imp = sorted(zip(FEATURES, clf.feature_importances_), key=lambda x: -x[1])
    print("\nFeature-Importances:", "  ".join(f"{k}={v:.2f}" for k, v in imp))


if __name__ == "__main__":
    main()
