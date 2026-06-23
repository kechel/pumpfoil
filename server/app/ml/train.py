"""Training + session-level Cross-Validation für die Pump/Glide-Klassifikation.

Bewusst klein & interpretierbar (RandomForest): Feature-Importances fließen zurück in
die Heuristik. Erst sinnvoll, sobald genügend gelabelte Sessions vorliegen — bis dahin
liefern die Heuristiken in pumps.py die Ergebnisse.

CV nutzt GroupKFold über die session_id-Gruppen: benachbarte Fenster derselben Session
korrelieren stark, daher dürfen sie nicht über Train/Test gemischt werden (Leakage).
"""
from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np

from ..config import get_settings
from .dataset import FEATURE_NAMES

MODEL_VERSION = "rf-1"

# sklearn wird nur im [ml]-Extra installiert -> lazy importieren, damit der Basis-Server
# (ohne scikit-learn) trotzdem startet und nur die /api/ml-Endpoints ggf. fehlschlagen.
def _sklearn():
    from sklearn.ensemble import RandomForestClassifier
    from sklearn.metrics import accuracy_score, f1_score
    from sklearn.model_selection import GroupKFold

    return RandomForestClassifier, accuracy_score, f1_score, GroupKFold


def cross_validate(X: np.ndarray, y: list[str], groups: list[int]) -> dict:
    """Session-level CV. Gibt Mittelwerte + Feature-Importances zurück.

    Wenn zu wenige Gruppen/Klassen vorliegen, wird kein CV gerechnet (status='insufficient').
    """
    y_arr = np.asarray(y)
    g_arr = np.asarray(groups)
    n_groups = len(set(groups))
    n_classes = len(set(y))
    if n_groups < 2 or n_classes < 2 or len(y) < 10:
        return {
            "status": "insufficient",
            "n_samples": len(y),
            "n_groups": n_groups,
            "n_classes": n_classes,
        }

    RandomForestClassifier, accuracy_score, f1_score, GroupKFold = _sklearn()
    n_splits = min(5, n_groups)
    gkf = GroupKFold(n_splits=n_splits)
    accs, f1s = [], []
    for train_idx, test_idx in gkf.split(X, y_arr, g_arr):
        clf = RandomForestClassifier(n_estimators=200, random_state=0, n_jobs=-1)
        clf.fit(X[train_idx], y_arr[train_idx])
        pred = clf.predict(X[test_idx])
        accs.append(accuracy_score(y_arr[test_idx], pred))
        f1s.append(f1_score(y_arr[test_idx], pred, average="macro"))

    # Importances aus einem Fit auf allen Daten.
    full = RandomForestClassifier(n_estimators=200, random_state=0, n_jobs=-1)
    full.fit(X, y_arr)
    return {
        "status": "ok",
        "model_version": MODEL_VERSION,
        "n_samples": len(y),
        "n_groups": n_groups,
        "n_splits": n_splits,
        "cv_accuracy_mean": round(float(np.mean(accs)), 4),
        "cv_accuracy_std": round(float(np.std(accs)), 4),
        "cv_f1_macro_mean": round(float(np.mean(f1s)), 4),
        "feature_importances": {
            name: round(float(imp), 4)
            for name, imp in zip(FEATURE_NAMES, full.feature_importances_)
        },
        "classes": sorted(set(y)),
    }


def train(X: np.ndarray, y: list[str]):
    RandomForestClassifier, *_ = _sklearn()
    clf = RandomForestClassifier(n_estimators=200, random_state=0, n_jobs=-1)
    clf.fit(X, np.asarray(y))
    return clf


def _model_path() -> Path:
    d = get_settings().data_dir / "models"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"pump_glide_{MODEL_VERSION}.pkl"


def save_model(clf: RandomForestClassifier) -> Path:
    p = _model_path()
    with open(p, "wb") as f:
        pickle.dump(clf, f)
    return p


def load_model() -> RandomForestClassifier | None:
    p = _model_path()
    if not p.exists():
        return None
    with open(p, "rb") as f:
        return pickle.load(f)
