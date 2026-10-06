#!/usr/bin/env python3
"""Offline-Ortstabelle fuer die Spot-Benennung vorbereiten (einmalig je Server; Daten gitignored).

1. GeoNames cities1000 (CC BY 4.0) holen und entpacken:
   cd server/data/geo && curl -O https://download.geonames.org/export/dump/cities1000.zip && unzip -o cities1000.zip
2. Aus server/: .venv/bin/python ../scripts/orte-offline-bauen.py   -> server/data/geo/orte.npz
"""
import pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))
from app import orte_offline as O

n = O.bauen()
print(f"{n} Orte -> {O.DATEI} ({O.DATEI.stat().st_size / 1e6:.1f} MB)")
