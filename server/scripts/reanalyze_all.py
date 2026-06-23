"""Alle Sessions neu analysieren (z. B. nach Algorithmus-/Feature-Änderungen).

Nutzung:
    .venv/bin/python -m scripts.reanalyze_all
"""
from __future__ import annotations

import sys

from app.db import SessionLocal
from app import models
from app.analysis import maybe_auto_trim, run_analysis


def main() -> None:
    # --auto-trim: zusätzlich Auto-Trim (erster Start..letztes Ende) nachziehen.
    do_trim = "--auto-trim" in sys.argv
    db = SessionLocal()
    try:
        sessions = db.query(models.Session).order_by(models.Session.id).all()
        print(f"{len(sessions)} Sessions zu analysieren … (auto-trim={do_trim})")
        ok = 0
        for s in sessions:
            try:
                run_analysis(db, s)
                if do_trim and maybe_auto_trim(db, s):
                    run_analysis(db, s)
                ok += 1
                print(f"  #{s.id} {s.sport or '?'} -> ok")
            except Exception as e:  # noqa: BLE001
                print(f"  #{s.id} FEHLER: {e}")
        print(f"Fertig: {ok}/{len(sessions)} erfolgreich.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
