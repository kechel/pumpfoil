"""Tests des ML-Trainings-Gerüsts mit synthetischen, trennbaren Daten.

Sanity-Checks der Pipeline (Dataset-Bau, session-level CV) — NICHT der echten
Pump-Erkennung (die braucht reale gelabelte Daten, siehe pumps.py-Caveat).
"""
from __future__ import annotations

import math

import numpy as np

from app.ml.dataset import (
    FEATURE_NAMES,
    assign_labels,
    build_session_dataset,
    windows_to_matrix,
)
from app.ml.train import cross_validate, train


def _pump_accel(secs=30, fs=25, scale=2048, freq=1.0):
    n = int(secs * fs)
    t = np.arange(n) / fs
    z = 1.0 + 0.4 * np.sin(2 * math.pi * freq * t)
    raw = np.stack([np.zeros(n), np.zeros(n), z * scale], axis=1)
    return raw.astype(np.int16)


def test_assign_labels_by_center():
    windows = [{"t_center_ms": 1000}, {"t_center_ms": 5000}, {"t_center_ms": 9000}]
    spans = [{"t_start_ms": 0, "t_end_ms": 2000, "label": "pump"}]
    assert assign_labels(windows, spans) == ["pump", None, None]


def test_build_session_dataset_shapes():
    raw = _pump_accel(30)
    spans = [{"t_start_ms": 0, "t_end_ms": 30000, "label": "pump"}]
    X, y = build_session_dataset(raw, 2048, 25.0, spans)
    assert X.shape[1] == len(FEATURE_NAMES)
    assert X.shape[0] == len(y) > 0
    assert set(y) == {"pump"}


def _synthetic_feature_dataset():
    """Baue klar trennbare pump/glide-Fenster über 4 'Sessions' (groups)."""
    rng = np.random.default_rng(0)
    X, y, groups = [], [], []
    for sess in range(4):
        for _ in range(8):
            # pump: hohe band_power_ratio, dom_freq ~1, höhere rms, niedrige entropy
            X.append([
                1.0 + rng.normal(0, 0.05),
                0.7 + rng.normal(0, 0.05),
                0.3 + rng.normal(0, 0.03),
                0.3 + rng.normal(0, 0.05),
            ])
            y.append("pump")
            groups.append(sess)
            # glide: niedrige ratio/rms, höhere entropy
            X.append([
                0.2 + rng.normal(0, 0.05),
                0.15 + rng.normal(0, 0.05),
                0.03 + rng.normal(0, 0.01),
                0.8 + rng.normal(0, 0.05),
            ])
            y.append("glide")
            groups.append(sess)
    return np.array(X), y, groups


def test_cross_validate_separable():
    X, y, groups = _synthetic_feature_dataset()
    rep = cross_validate(X, y, groups)
    assert rep["status"] == "ok"
    assert rep["cv_accuracy_mean"] > 0.85
    assert set(rep["feature_importances"].keys()) == set(FEATURE_NAMES)


def test_cross_validate_insufficient():
    X = windows_to_matrix([])
    rep = cross_validate(X, [], [])
    assert rep["status"] == "insufficient"


def test_train_predicts():
    X, y, _ = _synthetic_feature_dataset()
    clf = train(X, y)
    # ein klarer Pump-Vektor sollte als pump klassifiziert werden
    assert clf.predict([[1.0, 0.7, 0.3, 0.3]])[0] == "pump"
