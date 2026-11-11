#!/usr/bin/env python3
"""Auswertungen (analysis_results) einzelner Sessions aus einer JSONL-Sicherung zurueckholen und festhalten.

    cd server && .venv/bin/python ../scripts/auswertung-zurueckholen.py <sicherungs-ordner> <id,id,…> --notiz "…" [--echt]

Anlass 11.11.2026: die Neuauswertung (Empfindlichkeit) lief auch ueber 8 Sessions, deren Roh-Daten fehlen — dort blieb
„keine Position" uebrig. Die Sicherung (analysis_results.jsonl/sessions.jsonl) entstand direkt davor. Setzt alle Spalten
der Auswertung zurueck, dazu is_pumpfoil der Session, und haelt die Session fest (auswertung_fest). SCHREIBT nur mit --echt.
"""
import argparse, datetime, json, os, pathlib, sys


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("ordner"); ap.add_argument("ids"); ap.add_argument("--notiz", required=True); ap.add_argument("--echt", action="store_true")
    a = ap.parse_args()
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")
    from sqlalchemy import Date, DateTime
    from app import models as m
    from app.db import SessionLocal
    ids = {int(x) for x in a.ids.split(",") if x.strip()}
    db = SessionLocal()
    ordner = pathlib.Path(a.ordner)
    for fn, mod, key in (("analysis_results.jsonl", m.AnalysisResult, "session_id"), ("sessions.jsonl", m.Session, "id")):
        for line in open(ordner / fn):
            if not any(f'"{key}": {i},' in line for i in ids):
                continue
            d = json.loads(line)
            if d[key] not in ids:
                continue
            obj = db.query(mod).filter(getattr(mod, key) == d[key]).one()
            spalten = [c for c in mod.__table__.columns if c.name != "id"] if mod is m.AnalysisResult else \
                      [c for c in mod.__table__.columns if c.name == "is_pumpfoil"]
            for c in spalten:
                v = d.get(c.name)
                if v is not None and isinstance(c.type, (DateTime, Date)):
                    v = datetime.datetime.fromisoformat(v)
                setattr(obj, c.key, v)
            print(f"{fn[:-6]} {d[key]}: zurueckgesetzt ({len(spalten)} Spalten)")
    for sid in ids:
        s = db.get(m.Session, sid)
        s.auswertung_fest, s.auswertung_fest_notiz = True, a.notiz
    if a.echt:
        db.commit(); print("Geschrieben.")
    else:
        db.rollback(); print("TROCKENLAUF — mit --echt schreiben.")


if __name__ == "__main__":
    main()
