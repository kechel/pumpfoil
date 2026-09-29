"""Erkennung v3, Stufe A anwenden: On-Foil-Maske je GPS-Sample aus dem trainierten Modell.

Gleiche Schnittstelle wie `detect_v2.model_mask_on_timebase(tb)` (bool-Array, Laenge = GPS-Samples),
damit Segmentierung, Pumps und Fremdkraft unveraendert bleiben. NICHT live: das Modell liegt unter
server/data/ml/v3/ (nicht im Repo) und wird nur von scripts/v3/ geladen.
"""
from __future__ import annotations

import pickle
from functools import lru_cache
from pathlib import Path

import numpy as np

from . import merkmale as M

STANDARD = Path(__file__).resolve().parents[3] / "data" / "ml" / "v3" / "stufe_a.pkl"


@lru_cache(maxsize=2)
def _modell(pfad: str):
    with open(pfad, "rb") as f:
        return pickle.load(f)


def wahrscheinlichkeit(tb, pfad: Path = STANDARD) -> np.ndarray | None:
    if not tb.has_accel or len(tb.gps) == 0:
        return None
    m = _modell(str(pfad))
    _, X = M.merkmale(tb)
    return m["clf"].predict_proba(M.mit_kontext(X))[:, 1]


def maske(tb, schwelle: float = 0.5, pfad: Path = STANDARD) -> np.ndarray | None:
    p = wahrscheinlichkeit(tb, pfad)
    return None if p is None else (p >= schwelle)
