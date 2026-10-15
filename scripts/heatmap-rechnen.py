#!/usr/bin/env python3
"""Heatmap der Spot-Karte vorrechnen (app/heatmap.py). Laeuft einmal taeglich (Timer foil-heatmap).

    cd server && .venv/bin/python ../scripts/heatmap-rechnen.py

Liest nur aus der Datenbank; schreibt data/heatmap/zellen.pkl und data/heatmap/heatmap.npz.
"""
import os
import pathlib
import sys

if not os.path.exists(".env"):
    sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
for zeile in pathlib.Path(".env").read_text().splitlines():
    if zeile.startswith("DATABASE_URL=") and not os.environ.get("DATABASE_URL"):
        os.environ["DATABASE_URL"] = zeile.split("=", 1)[1].strip().strip('"').strip("'")
sys.path.insert(0, ".")

from app.db import SessionLocal  # noqa: E402
from app.heatmap import rechnen  # noqa: E402

db = SessionLocal()
try:
    rechnen(db)
finally:
    db.close()
