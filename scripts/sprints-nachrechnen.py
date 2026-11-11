#!/usr/bin/env python3
"""Fliegende Sprints (analysis/sprint.py) fuer schon analysierte Sessions nachrechnen.

    cd server && .venv/bin/python ../scripts/sprints-nachrechnen.py                 # Trockenlauf mit Bilanz
    cd server && .venv/bin/python ../scripts/sprints-nachrechnen.py --echt          # schreiben
    cd server && .venv/bin/python ../scripts/sprints-nachrechnen.py --ab 2026-11-01 --echt
    cd server && .venv/bin/python ../scripts/sprints-nachrechnen.py --event 5 --echt   # nur Zeitfenster+Teilnehmer eines Events

Schreibt NUR die Cache-Spalten `analysis_results.sprint_*` (NULL -> Wert); keine bestehende Zahl aendert sich, keine
Neuanalyse. Neue Sessions bekommen die Werte ohnehin bei der Analyse (run_analysis). Committet blockweise (Memory
`backfill-blockweise-committen`), wiederholbar: ohne `--alle` nur Sessions, deren Spalten noch NULL sind."""
import argparse
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

from app import models  # noqa: E402
from app.analysis import sprint as SP  # noqa: E402
from app.db import SessionLocal  # noqa: E402

BLOCK = 200


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--echt", action="store_true", help="wirklich schreiben")
    ap.add_argument("--ab", help="nur Sessions ab diesem Tag (YYYY-MM-DD)")
    ap.add_argument("--alle", action="store_true", help="auch schon gerechnete neu rechnen")
    ap.add_argument("--ohne-fenster", action="store_true",
                    help="nur Sessions ohne Fensterlage (vor VERSION 3, 11.11.2026); prueft, dass kein Wert sich aendert")
    ap.add_argument("--event", type=int, help="nur Sessions im Zeitfenster dieses Team-Events (und seiner Teilnehmer)")
    args = ap.parse_args()
    db = SessionLocal()
    S, A = models.Session, models.AnalysisResult
    q = (db.query(A.id).join(S, S.id == A.session_id)
         .filter(S.deleted.isnot(True), S.status == "analyzed", A.segments_json.isnot(None)))
    if args.ohne_fenster:
        q = q.filter(A.sprint_json.isnot(None), ~A.sprint_json.contains('"fenster"'))
    elif not args.alle:
        q = q.filter(A.sprint_json.is_(None))
    if args.ab:
        q = q.filter(S.started_at >= datetime.fromisoformat(args.ab).replace(tzinfo=timezone.utc))
    if args.event:
        from app import teams as T
        e = db.get(models.TeamEvent, args.event)
        q = q.filter(S.started_at >= e.start, S.started_at < e.ende)
        teilnehmer = T.event_teilnehmer(db, db.get(models.Team, e.team_id), e)
        if teilnehmer != T.ALLE:
            q = q.filter(S.user_id.in_(teilnehmer or [-1]))
    ids = [i for (i,) in q.order_by(A.id).all()]
    print(f"{len(ids)} Sessions {'werden geschrieben' if args.echt else '(Trockenlauf)'}")
    mit = {kz: 0 for kz in SP.KENNZAHLEN}
    anders = 0
    t0 = time.monotonic()
    for k in range(0, len(ids), BLOCK):
        for r in db.query(A).filter(A.id.in_(ids[k:k + BLOCK])).all():
            s = db.get(S, r.session_id)
            vorher = [getattr(r, kz + "_mps") for kz in SP.KENNZAHLEN]
            try:
                SP.setzen(s, r)
            except Exception as e:  # noqa: BLE001
                print(f"  Session {s.id}: {e}")
                db.expire(r)
                continue
            if args.ohne_fenster and vorher != [getattr(r, kz + "_mps") for kz in SP.KENNZAHLEN]:
                anders += 1
                print(f"  Session {s.id}: Wert geaendert {vorher} -> {[getattr(r, kz + '_mps') for kz in SP.KENNZAHLEN]}")
            for kz in SP.KENNZAHLEN:
                mit[kz] += (getattr(r, kz + "_mps") or 0) > 0
        if args.echt:
            db.commit()
        else:
            db.rollback()
        print(f"  {min(k + BLOCK, len(ids))}/{len(ids)}  {time.monotonic() - t0:.0f} s", flush=True)
    if args.ohne_fenster:
        print(f"Werte geaendert: {anders} (erwartet 0)")
    print("Sessions mit Wert: " + ", ".join(f"{kz} {n}" for kz, n in mit.items()))
    print("Geschrieben." if args.echt else "Nichts geschrieben (ohne --echt).")


if __name__ == "__main__":
    main()
