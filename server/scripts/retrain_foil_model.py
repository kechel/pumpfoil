"""On-Foil-Detektor neu trainieren aus dem STORAGE (alle gelabelten Sessions).

Liest gps+accel+foil_status direkt aus data/<uuid>/ (persistente Label-App-Importe),
dedupliziert identische Aktivitaeten (Test-Konten-Kopien), baut die erweiterten
Features (14: 7 alt + 7 Richtung/Delta) im Fenster (±WINDOW_RADIUS s) und trainiert
einen RandomForest. Ohne --write: nur Cross-Validation (F1 + Fragmentierung).
Mit --write: speichert foil_rf.pkl (Produktionsmodell).

Aufruf:
  DATABASE_URL=... .venv/bin/python -m scripts.retrain_foil_model          # nur CV
  DATABASE_URL=... .venv/bin/python -m scripts.retrain_foil_model --write   # + speichern
"""
from __future__ import annotations

import glob
import os
import sys

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, precision_score, recall_score

from app import storage
from app.analysis import foil_model as FM

MIN_RUN_S = 5


def load_labeled():
    """-> Liste (uuid, X14, y), dedupliziert nach (Sekunden, foil-Summe)."""
    seen = {}
    out = []
    for p in sorted(glob.glob("data/fit-*/foil_status.json")):
        uuid = os.path.basename(os.path.dirname(p))
        fs = storage.load_foil_status(uuid)
        if not fs:
            continue
        gps = storage.load_gps(uuid)
        accel = storage.load_accel(uuid)
        if accel is None or accel.shape[0] == 0 or not gps:
            continue
        y = np.array([1 if (f is not None and int(f) >= 1) else 0 for f in fs], dtype=int)
        valid = np.array([f is not None for f in fs], dtype=bool)
        # 25 Hz-Default fuer FIT-Importe; Skala 2048 (wie train_foil_model)
        X = FM.extract_features(gps, accel, 25.0, 2048)
        m = min(len(X), len(y), len(valid))
        X, y, valid = X[:m], y[:m], valid[:m]
        X, y = X[valid], y[valid]
        if y.size < 60 or not (0.02 < y.mean() < 0.98):
            continue
        sig = (y.size, int(y.sum()))
        if sig in seen:      # Duplikat (Test-Konto) -> ueberspringen
            continue
        seen[sig] = uuid
        out.append((uuid, X, y))
    return out


def count_runs(mask, min_len=MIN_RUN_S):
    runs, i, n = 0, 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if j - i >= min_len:
                runs += 1
            i = j
        else:
            i += 1
    return runs


def rf():
    return RandomForestClassifier(300, random_state=0, n_jobs=-1, class_weight="balanced")


def main():
    data = load_labeled()
    tot = sum(d[2].size for d in data)
    print(f"{len(data)} Sessions (dedupliziert), {tot} gelabelte Sekunden, "
          f"{sum(int(d[2].sum()) for d in data)} foilend")
    print(f"Features: {len(FM.FEATURE_NAMES)} x Fenster(±{FM.WINDOW_RADIUS}s) = "
          f"{len(FM.FEATURE_NAMES)*(2*FM.WINDOW_RADIUS+1)} Eingaenge\n")

    # 5-fach GroupKFold-CV (je Fold 1 Training; Fragmentierung pro Session gezaehlt)
    from sklearn.model_selection import GroupKFold
    Xall = [FM.windowize(d[1]) for d in data]
    groups = np.concatenate([[i] * data[i][2].size for i in range(len(data))])
    Xcat = np.vstack(Xall); ycat = np.concatenate([d[2] for d in data])
    gkf = GroupKFold(n_splits=5)
    Ps = Rs = Fs = 0.0; pr = tr = 0; nsess = 0
    for trn, tst in gkf.split(Xcat, ycat, groups):
        clf = rf().fit(Xcat[trn], ycat[trn])
        for si in np.unique(groups[tst]):        # jede Test-Session einzeln
            p = clf.predict(Xall[si]); yte = data[si][2]
            Ps += precision_score(yte, p, zero_division=0)
            Rs += recall_score(yte, p, zero_division=0)
            Fs += f1_score(yte, p, zero_division=0)
            pr += count_runs(p); tr += count_runs(yte); nsess += 1
    print(f"CV (5-fold, pro Session): P={Ps/nsess:.3f} R={Rs/nsess:.3f} F1={Fs/nsess:.3f}  "
          f"Laeufe pred/true={pr}/{tr} (Faktor {pr/max(tr,1):.2f})")

    if "--write" in sys.argv:
        X = np.vstack([FM.windowize(d[1]) for d in data])
        y = np.concatenate([d[2] for d in data])
        clf = rf().fit(X, y)
        FM.save_model(clf)
        print(f"\nfoil_rf.pkl geschrieben ({X.shape[0]} Samples, {X.shape[1]} Features).")


if __name__ == "__main__":
    main()
