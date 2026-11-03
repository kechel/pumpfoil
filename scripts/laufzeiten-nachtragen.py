#!/usr/bin/env python3
"""Lauf-Zeitpunkte (analysis_results.lauf_start_at/lauf_ende_at, app/laufzeiten.py) fuer den Bestand nachtragen.

Neue Analysen setzen sie selbst (run_analysis). Ohne --echt nur zaehlen. Schreibt blockweise (je 500 Zeilen ein
Commit), damit keine lange Schreib-Transaktion einen Server-Neustart blockiert. Wiederholbar: setzt nur, was fehlt
oder abweicht.

    cd server && .venv/bin/python ../scripts/laufzeiten-nachtragen.py
    cd server && .venv/bin/python ../scripts/laufzeiten-nachtragen.py --echt
"""
import argparse
import os
import pathlib
import sys

BLOCK = 500


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--echt", action="store_true")
    args = ap.parse_args()
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")
    from app import models
    from app.db import SessionLocal
    from app.laufzeiten import setzen

    db = SessionLocal()
    AR, S = models.AnalysisResult, models.Session
    ids = [i for (i,) in db.query(AR.id).order_by(AR.id).all()]
    geaendert = gesamt = 0
    for n in range(0, len(ids), BLOCK):
        for ar, s in (db.query(AR, S).join(S, S.id == AR.session_id).filter(AR.id.in_(ids[n:n + BLOCK])).all()):
            gesamt += 1
            if setzen(s, ar):
                geaendert += 1
        if args.echt:
            db.commit()
        else:
            db.rollback()
        print(f"  {min(n + BLOCK, len(ids))}/{len(ids)} gelesen, {geaendert} zu setzen", flush=True)
    print(f"{gesamt} Analysen, {geaendert} {'gesetzt' if args.echt else 'wuerden gesetzt (TROCKENLAUF, mit --echt schreiben)'}")


if __name__ == "__main__":
    main()
