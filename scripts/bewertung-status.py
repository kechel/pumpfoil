#!/usr/bin/env python3
"""Bearbeitungsstand einer Bewertung („Rate this analysis") setzen — fuer Claude, wenn ein gemeldetes
Problem gefixt ist (erledigt) oder an den Fahrer zurueckgegeben wurde mit Bitte um Kontrolle und
Neubewertung (rueckfrage). Jans Auftrag 22.10.2026. Bewertet der Fahrer neu, springt es von selbst
auf offen. Ohne --echt nur anzeigen.

    cd server && .venv/bin/python ../scripts/bewertung-status.py                       # offene zeigen
    cd server && .venv/bin/python ../scripts/bewertung-status.py --id 3 --status erledigt --notiz "Fix 1.0.97" --echt
"""
import argparse
import json
import os
import pathlib
import sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", type=int)
    ap.add_argument("--status", choices=("offen", "rueckfrage", "erledigt"))
    ap.add_argument("--notiz")
    ap.add_argument("--echt", action="store_true")
    args = ap.parse_args()
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")
    from app import models
    from app.api.bewertung import status_setzen
    from app.db import SessionLocal

    db = SessionLocal()
    if args.id is None:
        for b in db.query(models.SessionBewertung).filter(models.SessionBewertung.status != "erledigt") \
                .order_by(models.SessionBewertung.updated_at.desc()):
            print(f"  id {b.id:4}  #{b.session_id}  u{b.user_id}  {b.status:10} {b.antworten_json}  "
                  f"{json.dumps(b.kommentar or '', ensure_ascii=False)[:80]}")
        return
    if not args.status:
        sys.exit("--status fehlt")
    b = status_setzen(db, args.id, args.status, args.notiz)
    print(f"  id {b.id} #{b.session_id} -> {b.status} ({b.status_notiz or '-'})")
    if args.echt:
        db.commit()
        print("Geschrieben.")
    else:
        db.rollback()
        print("TROCKENLAUF — mit --echt schreiben.")


if __name__ == "__main__":
    main()
