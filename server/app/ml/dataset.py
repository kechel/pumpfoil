"""Trainingsdaten-Aufbau: Roh-Accel + Nutzer-Labels -> Fenster-Feature-Matrix.

Reine Funktionen (ohne DB) sind unit-testbar; build_dataset() aggregiert über alle
gelabelten Sessions eines Nutzers via DB + storage.

Jedes Fenster (aus features.window_features) bekommt das Label, dessen Zeitspanne das
Fensterzentrum überdeckt. Fenster ohne überdeckendes Label werden verworfen (nur
explizit gelabelte Daten fließen ins Training).
"""
from __future__ import annotations

import numpy as np

from .features import magnitude_g, window_features

FEATURE_NAMES = ["dom_freq", "band_power_ratio", "rms", "spectral_entropy"]


def windows_to_matrix(windows: list[dict]) -> np.ndarray:
    """Feature-Dicts -> (n, len(FEATURE_NAMES)) Matrix."""
    if not windows:
        return np.empty((0, len(FEATURE_NAMES)))
    return np.array([[w[k] for k in FEATURE_NAMES] for w in windows], dtype=float)


def assign_labels(windows: list[dict], label_spans: list[dict]) -> list[str | None]:
    """Pro Fenster das Label, dessen [t_start_ms, t_end_ms] das Zentrum überdeckt."""
    out: list[str | None] = []
    for w in windows:
        c = w["t_center_ms"]
        lbl = None
        for s in label_spans:
            if s["t_start_ms"] <= c <= s["t_end_ms"]:
                lbl = s["label"]
                break
        out.append(lbl)
    return out


def build_session_dataset(
    accel_i16: np.ndarray,
    accel_scale: int,
    accel_hz: float,
    label_spans: list[dict],
) -> tuple[np.ndarray, list[str]]:
    """Eine Session -> (X, y) nur für gelabelte Fenster. Pure, testbar."""
    mag = magnitude_g(accel_i16, accel_scale)
    windows = window_features(mag, accel_hz)
    labels = assign_labels(windows, label_spans)
    keep = [i for i, lbl in enumerate(labels) if lbl is not None]
    X = windows_to_matrix([windows[i] for i in keep])
    y = [labels[i] for i in keep]  # type: ignore[index]
    return X, y


def build_dataset(db, user_id: int | None = None):
    """Aggregiert X, y, groups (session_id) über alle gelabelten Sessions.

    groups ermöglicht session-level Cross-Validation (train.py) — Fenster derselben
    Session dürfen nicht über Train/Test gesplittet werden (Leakage).
    """
    from .. import models, storage

    q = db.query(models.Session)
    if user_id is not None:
        q = q.filter(models.Session.user_id == user_id)

    Xs, ys, groups = [], [], []
    for s in q.all():
        spans = [
            {"t_start_ms": l.t_start_ms, "t_end_ms": l.t_end_ms, "label": l.label}
            for l in s.labels
        ]
        if not spans:
            continue
        accel = storage.load_accel(s.session_uuid)
        if accel.shape[0] == 0:
            continue
        X, y = build_session_dataset(accel, s.accel_scale, float(s.accel_hz), spans)
        if len(y) == 0:
            continue
        Xs.append(X)
        ys.extend(y)
        groups.extend([s.id] * len(y))

    if not Xs:
        return np.empty((0, len(FEATURE_NAMES))), [], []
    return np.vstack(Xs), ys, groups
