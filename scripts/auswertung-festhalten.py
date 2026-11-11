#!/usr/bin/env python3
"""Auswertung einer Session festhalten (oder freigeben) — von Hand gesetzter Sonderfall (Jan, 11.11.2026).

    cd server && .venv/bin/python ../scripts/auswertung-festhalten.py 20528 --notiz "Laeufe nach Pruefung zurueckgeholt"
    cd server && .venv/bin/python ../scripts/auswertung-festhalten.py 20528 --notiz "…" --echt
    cd server && .venv/bin/python ../scripts/auswertung-festhalten.py 20528 --aus --echt
    cd server && .venv/bin/python ../scripts/auswertung-festhalten.py --liste

Eine festgehaltene Session rechnet `run_analysis` nicht mehr neu (Empfindlichkeit, Hintergrund-Neuauswertung,
Detektor-Laeufe, Nutzer-Aktionen); nur die Admin-Neuauswertung (`erzwingen`). SCHREIBT nur mit --echt.
"""
import argparse
import os
import pathlib
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("session_ids", nargs="*", type=int)
    ap.add_argument("--notiz", default=None)
    ap.add_argument("--aus", action="store_true", help="wieder freigeben")
    ap.add_argument("--liste", action="store_true")
    ap.add_argument("--echt", action="store_true")
    a = ap.parse_args()
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten.")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    if a.liste:
        for s in db.query(models.Session).filter(models.Session.auswertung_fest.is_(True)).order_by(models.Session.id):
            print(s.id, s.user_id, s.started_at, s.auswertung_fest_notiz or "")
        return
    if not a.session_ids:
        sys.exit("Session-IDs fehlen")
    if not a.aus and not (a.notiz or "").strip():
        sys.exit("--notiz ist Pflicht (warum festgehalten?)")
    for sid in a.session_ids:
        s = db.get(models.Session, sid)
        if s is None:
            print(sid, "gibt es nicht"); continue
        ar = db.query(models.AnalysisResult).filter_by(session_id=sid).first()
        print(f"{sid}: user {s.user_id}, {ar.num_runs if ar else '-'} Laeufe, algo {ar.algo_version if ar else '-'} "
              f"-> {'frei' if a.aus else 'FEST'}")
        s.auswertung_fest = not a.aus
        s.auswertung_fest_notiz = None if a.aus else a.notiz.strip()
    if a.echt:
        db.commit(); print("Geschrieben.")
    else:
        db.rollback(); print("TROCKENLAUF — mit --echt schreiben.")


if __name__ == "__main__":
    main()
