"""Trainiert das Foil-Erkennungsmodell auf dem GESPEICHERTEN Feature-Format
(identisch zur Laufzeit) gegen die foil_status-Ground-Truth und speichert es.

Aufruf:  python scripts/train_foil_model.py <glob-zu-fits>
"""
from __future__ import annotations

import glob
import sys

import numpy as np
import fitparse
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import f1_score, precision_score, recall_score

from app.analysis.foil_model import FEATURE_NAMES, extract_features, save_model
from app.fitimport import _accel_msg_time, _record_time, accel_from_messages, gps_from_records


def build_xy(path):
    fit = fitparse.FitFile(open(path, "rb").read())
    records, accel_msgs = [], []
    for m in fit.get_messages():
        if m.name == "record":
            records.append({d.name: d.value for d in m})
        elif m.name == "accelerometer_data":
            accel_msgs.append({d.name: d.value for d in m})
    times = [t for t in (_record_time(r) for r in records) if t]
    a0 = _accel_msg_time(accel_msgs[0]) if accel_msgs else None
    if a0:
        times.append(a0)
    if not times:
        return None
    t0 = min(times)

    gps = gps_from_records(records, t0)
    # foil_status parallel zu gps (gleiche Filterung: Records mit Position)
    foil = [r.get("foil_status") for r in records
            if r.get("position_lat") is not None and r.get("position_long") is not None
            and r.get("timestamp") is not None]
    accel_bytes, accel_hz = accel_from_messages(accel_msgs)
    accel = np.frombuffer(accel_bytes, dtype="<i2")
    accel = accel[: (accel.size // 3) * 3].reshape(-1, 3)

    X = extract_features(gps, accel, float(accel_hz or 25), 2048)
    y = np.array([1 if (f is not None and int(f) >= 1) else 0 for f in foil])
    valid = np.array([f is not None for f in foil])
    return X[valid], y[valid]


def main():
    pattern = sys.argv[1] if len(sys.argv) > 1 else "/tmp/*/fits/*.fit"
    Xs, ys, gs = [], [], []
    for gi, f in enumerate(sorted(glob.glob(pattern))):
        r = build_xy(f)
        if r is None:
            continue
        Xs.append(r[0]); ys.append(r[1]); gs += [gi] * len(r[1])
    X = np.vstack(Xs); y = np.concatenate(ys); g = np.array(gs)
    print(f"{len(y)} Sekunden, {int(y.sum())} foilend, {len(set(g))} Sessions")

    gkf = GroupKFold(n_splits=min(5, len(set(g))))
    P = R = F = 0.0
    for tr, te in gkf.split(X, y, g):
        c = RandomForestClassifier(200, random_state=0, n_jobs=-1, class_weight="balanced").fit(X[tr], y[tr])
        p = c.predict(X[te])
        P += precision_score(y[te], p, zero_division=0)
        R += recall_score(y[te], p, zero_division=0)
        F += f1_score(y[te], p, zero_division=0)
    k = gkf.get_n_splits()
    print(f"session-CV (stored features): P={P/k:.3f} R={R/k:.3f} F1={F/k:.3f}")

    clf = RandomForestClassifier(200, random_state=0, n_jobs=-1, class_weight="balanced").fit(X, y)
    save_model(clf)
    imp = sorted(zip(FEATURE_NAMES, clf.feature_importances_), key=lambda x: -x[1])
    print("Modell gespeichert. Importance:", ", ".join(f"{n}={v:.2f}" for n, v in imp))


if __name__ == "__main__":
    main()
