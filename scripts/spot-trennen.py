#!/usr/bin/env python3
"""Sessions aus einem Spot in einen eigenen, NEUEN Spot verschieben und das Paar dauerhaft trennen
(models.SpotTrennung — nie wieder automatisch zusammengelegt). Jans Auftrag 23.10.2026 (Roman u244:
zwei Stege 350 m auseinander, durch eine Landzunge getrennt). Ohne --echt nur anzeigen.

    cd server && .venv/bin/python ../scripts/spot-trennen.py --spot 973 --sessions 18868,18869,18870
    cd server && .venv/bin/python ../scripts/spot-trennen.py --spot 973 --sessions 18868,18869,18870 --echt [--name "…"]
"""
import argparse
import os
import pathlib
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--spot", type=int, required=True)
    ap.add_argument("--sessions", required=True, help="Komma-Liste der Session-IDs fuer den NEUEN Spot")
    ap.add_argument("--name", help="Name des neuen Spots (sonst automatisch; der Fahrer kann umbenennen)")
    ap.add_argument("--notiz")
    ap.add_argument("--echt", action="store_true")
    args = ap.parse_args()
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")
    from app import models, spots
    from app.db import SessionLocal

    db = SessionLocal()
    ids = [int(x) for x in args.sessions.split(",") if x.strip()]
    alt = db.get(models.Spot, args.spot)
    print(f"Spot {alt.id} „{alt.name}“: {db.query(models.Session).filter_by(spot_id=alt.id).count()} Sessions")
    neu = spots.trennen(db, args.spot, ids, name=args.name, notiz=args.notiz)
    print(f"  neuer Spot {neu.id} „{neu.name}“ ({neu.name_source}) bei {neu.lat:.5f}, {neu.lon:.5f} mit {len(ids)} Sessions")
    print(f"  Abstand der Stege: {spots.abstand_m(alt.lat, alt.lon, neu.lat, neu.lon):.0f} m")
    if args.echt:
        db.commit()
        print("Geschrieben.")
    else:
        db.rollback()
        print("TROCKENLAUF — mit --echt schreiben.")


if __name__ == "__main__":
    main()
