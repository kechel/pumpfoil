"""Geo-Hilfsfunktionen."""
from __future__ import annotations

import numpy as np

EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lat1, lon1, lat2, lon2):
    """Distanz in Metern zwischen aufeinanderfolgenden Punkten (vektorisiert)."""
    lat1, lon1, lat2, lon2 = map(np.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0)))


def step_distances_m(lat: np.ndarray, lon: np.ndarray) -> np.ndarray:
    """Distanz pro Schritt; gleiche Länge wie Eingabe (erstes Element 0)."""
    if lat.size < 2:
        return np.zeros_like(lat, dtype=float)
    d = haversine_m(lat[:-1], lon[:-1], lat[1:], lon[1:])
    return np.concatenate([[0.0], d])
