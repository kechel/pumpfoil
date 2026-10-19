#!/usr/bin/env python3
"""Wenden/Halsen fuer alle Wind-Sessions einmal rechnen und cachen (data/manoever/), damit der Verlauf
(GET /api/sessions/manoever-verlauf) Daten hat. Liest nur DB und Wind-Cache, schreibt nur Dateien.

    cd server && OMP_NUM_THREADS=1 .venv/bin/python ../scripts/manoever-nachholen.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from app import models, sportprofil  # noqa: E402
from app.api.sessions import manoever_gecacht  # noqa: E402
from app.db import SessionLocal  # noqa: E402


def main():
    wind = [k for k, g in sportprofil.GRUPPE.items() if g == "wind"]
    db = SessionLocal()
    try:
        rows = (db.query(models.Session).filter(models.Session.sport_class.in_(wind),
                                                models.Session.deleted.isnot(True),
                                                models.Session.place_lat.isnot(None)).all())
        mit = 0
        for i, s in enumerate(rows, 1):
            e = manoever_gecacht(db, s)
            mit += int(bool(e and e.get("zahlen")))
            if i % 200 == 0:
                print(f"{i}/{len(rows)}: {mit} mit Manoevern", flush=True)
        print(f"fertig: {len(rows)} Sessions, {mit} mit Manoevern")
    finally:
        db.close()


if __name__ == "__main__":
    main()
