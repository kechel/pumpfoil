"""Offline-Eval: eigene Foil-Erkennung (nur GPS+Accel) gegen foil_status-Ground-Truth.

Baut pro Sekunde ein Feature-Set aus Original-Garmin-Daten (Speed + accelerometer_data)
und vergleicht (a) die aktuelle GPS-Heuristik und (b) einen RandomForest (session-level CV)
gegen das foil_status der anderen App.

Aufruf:  python scripts/eval_foilstatus.py <glob-zu-fits>
"""
from __future__ import annotations

import glob
import sys
from datetime import timedelta, timezone

import numpy as np
import fitparse

from app.analysis.gps import analyze_gps
from app.analysis.features_per_sec import per_second_dataset


def load_fit(path):
    fit = fitparse.FitFile(open(path, "rb").read())
    records, accel = [], []
    for m in fit.get_messages():
        if m.name == "record":
            records.append({d.name: d.value for d in m})
        elif m.name == "accelerometer_data":
            accel.append({d.name: d.value for d in m})
    return records, accel


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "/tmp/*/fits/*.fit"
    files = sorted(glob.glob(pattern))
    X_all, y_all, groups, heur_all = [], [], [], []
    for gi, f in enumerate(files):
        records, accel = load_fit(f)
        ds = per_second_dataset(records, accel)
        if ds is None:
            continue
        X, y, t_rel = ds  # X: (n, F), y: foil_status 0/1, t_rel: ms je Sekunde

        # aktuelle Heuristik: foiling-Maske pro Sekunde aus analyze_gps-Segmenten
        from app.fitimport import gps_from_records
        # gemeinsame t0 wie im Import
        from app.fitimport import _record_time, _accel_msg_time
        times = [t for t in (_record_time(r) for r in records) if t]
        a0 = _accel_msg_time(accel[0]) if accel else None
        if a0: times.append(a0)
        t0 = min(times)
        gps = gps_from_records(records, t0)
        g = analyze_gps(gps, gps_hz=1)
        heur = np.zeros(len(t_rel), dtype=int)
        for s in g["segments"]:
            heur |= ((t_rel >= s["t_start_ms"]) & (t_rel <= s["t_end_ms"])).astype(int)

        X_all.append(X); y_all.append(y); heur_all.append(heur)
        groups.extend([gi] * len(y))
        name = f.split("/")[-1][:14]
        # Heuristik-Agreement
        tp = int(((heur == 1) & (y == 1)).sum()); fp = int(((heur == 1) & (y == 0)).sum())
        fn = int(((heur == 0) & (y == 1)).sum()); tn = int(((heur == 0) & (y == 0)).sum())
        prec = tp / (tp + fp) if tp + fp else 0; rec = tp / (tp + fn) if tp + fn else 0
        print(f"{name}: foil_status={int(y.sum())}s  heuristik: P={prec:.2f} R={rec:.2f} (tp{tp} fp{fp} fn{fn})")

    X = np.vstack(X_all); y = np.concatenate(y_all); groups = np.array(groups)
    heur = np.concatenate(heur_all)
    # Gesamt-Heuristik
    tp=((heur==1)&(y==1)).sum(); fp=((heur==1)&(y==0)).sum(); fn=((heur==0)&(y==1)).sum()
    P=tp/(tp+fp); R=tp/(tp+fn); F1=2*P*R/(P+R)
    print(f"\nHEURISTIK gesamt: P={P:.3f} R={R:.3f} F1={F1:.3f}  ({len(y)} Sekunden, {int(y.sum())} foilend)")

    # RandomForest, session-level CV
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.model_selection import GroupKFold
    from sklearn.metrics import precision_score, recall_score, f1_score
    from app.analysis.features_per_sec import FEATURE_NAMES
    gkf = GroupKFold(n_splits=min(5, len(set(groups))))
    ps, rs, fs = [], [], []
    for tr, te in gkf.split(X, y, groups):
        clf = RandomForestClassifier(n_estimators=200, random_state=0, n_jobs=-1, class_weight="balanced")
        clf.fit(X[tr], y[tr]); pred = clf.predict(X[te])
        ps.append(precision_score(y[te], pred, zero_division=0))
        rs.append(recall_score(y[te], pred, zero_division=0))
        fs.append(f1_score(y[te], pred, zero_division=0))
    print(f"RANDOMFOREST (session-CV): P={np.mean(ps):.3f} R={np.mean(rs):.3f} F1={np.mean(fs):.3f}")
    clf = RandomForestClassifier(n_estimators=200, random_state=0, n_jobs=-1, class_weight="balanced").fit(X, y)
    imp = sorted(zip(FEATURE_NAMES, clf.feature_importances_), key=lambda x: -x[1])
    print("Feature-Wichtigkeit:", ", ".join(f"{n}={v:.2f}" for n, v in imp))


if __name__ == "__main__":
    main()
