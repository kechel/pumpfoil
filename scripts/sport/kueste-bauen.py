#!/usr/bin/env python3
"""Kuestenlinie fuer die Sportart-Regel vorbereiten (einmalig je Server; Ergebnis gitignored).

1. Natural Earth 10m Coastline (Public Domain) nach server/data/geo/ne_10m_coastline.geojson legen:
   https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_coastline.geojson
2. Aus server/: .venv/bin/python ../scripts/sport/kueste-bauen.py
   -> server/data/geo/kueste_xyz.npy (~15 MB), das laedt app/analysis/sportregel.py.
Fehlt die Datei, sagt die Regel nie „Welle"; sonst aendert sich nichts.
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
from app.analysis import sportregel as S

n = S.kueste_bauen()
print(f"{n} Punkte -> {S.KUESTE_NPY} ({S.KUESTE_NPY.stat().st_size / 1e6:.1f} MB)")
