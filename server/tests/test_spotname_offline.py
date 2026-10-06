"""Spot-Benennung ohne Netz (06.10.2026): Spots auf dem Meer blieben namenlos und damit unsichtbar
auf der Karte. Letzter Rueckfall ist die naechste Ortschaft aus GeoNames (app/orte_offline.py)."""
from __future__ import annotations

import numpy as np


def test_naechster_ort_mit_grenze(monkeypatch):
    from scipy.spatial import cKDTree
    from app import orte_offline as O
    xyz = O._xyz(np.array([45.7832, 45.8]), np.array([-1.1450, -0.9]))   # La Tremblade, „weit weg"
    monkeypatch.setattr(O, "_BAUM", cKDTree(xyz))
    monkeypatch.setattr(O, "_NAMEN", ["La Tremblade", "Saintes"])
    name, km = O.naechster_ort(45.790, -1.216)
    assert name == "La Tremblade" and 5 < km < 7
    assert O.naechster_ort(10.0, 10.0) is None          # weiter als 25 km -> nichts


def test_name_for_faellt_auf_geonames_zurueck(monkeypatch):
    from app import orte_offline as O
    from app import places, spots
    for f in ("lookup_water_name", "lookup_place_name", "lookup_shore_name"):
        monkeypatch.setattr(spots, f, lambda *a, **k: None) if hasattr(spots, f) else None
        monkeypatch.setattr(places, f, lambda *a, **k: None)
    monkeypatch.setattr(places, "lookup_place_nominatim", lambda *a, **k: (None, None))
    monkeypatch.setattr(O, "naechster_ort", lambda lat, lon, max_km=25.0: ("Muizenberg", 1.1))
    assert spots.name_for(-34.088, 18.476) == ("Muizenberg", "geonames", None)


def test_fehlt_die_datei_bleibt_alles_wie_es_war(monkeypatch):
    from app import orte_offline as O
    monkeypatch.setattr(O, "_BAUM", False)
    assert O.naechster_ort(45.79, -1.216) is None
