"""Trainiert das Foil-Modell direkt aus dem gespeicherten Daten (gps+accel+foil_status)
aller Sessions, die Ground-Truth haben. So wächst der Datensatz automatisch mit jedem
Upload (auch von Freunden) — kein erneutes Zip nötig.

Aufruf:  python scripts/train_from_storage.py [--save]
"""
from __future__ import annotations

import sys

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import f1_score, precision_score, recall_score

from app.db import SessionLocal
from app import models, storage
from app.analysis.foil_model import FEATURE_NAMES, extract_features, save_model


def main():
    db = SessionLocal()
    Xs, ys, gs, used = [], [], [], []
    for s in db.query(models.Session).all():
        foil = storage.load_foil_status(s.session_uuid)
        accel = storage.load_accel(s.session_uuid)
        if not foil or accel.shape[0] == 0:
            continue
        gps = storage.load_gps(s.session_uuid)
        if len(gps) == 0 or len(foil) != len(gps):
            continue
        X = extract_features(gps, accel, float(s.accel_hz), s.accel_scale)
        y = np.array([1 if (v is not None and int(v) >= 1) else 0 for v in foil])
        valid = np.array([v is not None for v in foil])
        if valid.sum() < 30:
            continue
        Xs.append(X[valid]); ys.append(y[valid]); gs += [s.id] * int(valid.sum())
        used.append((s.id, s.sport, int(y[valid].sum())))
    if not Xs:
        print("Keine gelabelten Sessions mit Accel gefunden."); return
    X = np.vstack(Xs); y = np.concatenate(ys); g = np.array(gs)
    print(f"Trainings-Sessions: {len(used)} | Sekunden: {len(y)} | foilend: {int(y.sum())}")
    for sid, sport, n in used:
        print(f"  S{sid} {sport}: {n}s foilend")

    n_groups = len(set(g))
    gkf = GroupKFold(n_splits=min(5, n_groups))
    P = R = F = 0.0
    for tr, te in gkf.split(X, y, g):
        c = RandomForestClassifier(200, random_state=0, n_jobs=-1, class_weight="balanced").fit(X[tr], y[tr])
        p = c.predict(X[te])
        P += precision_score(y[te], p, zero_division=0)
        R += recall_score(y[te], p, zero_division=0)
        F += f1_score(y[te], p, zero_division=0)
    k = gkf.get_n_splits()
    print(f"\nsession-CV ({n_groups} Gruppen): P={P/k:.3f} R={R/k:.3f} F1={F/k:.3f}")

    if "--save" in sys.argv:
        clf = RandomForestClassifier(200, random_state=0, n_jobs=-1, class_weight="balanced").fit(X, y)
        save_model(clf)
        imp = sorted(zip(FEATURE_NAMES, clf.feature_importances_), key=lambda x: -x[1])
        print("Modell GESPEICHERT. Importance:", ", ".join(f"{n}={v:.2f}" for n, v in imp))
    else:
        print("(ohne --save: Modell NICHT überschrieben)")


if __name__ == "__main__":
    main()
