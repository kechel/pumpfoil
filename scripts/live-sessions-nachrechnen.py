#!/usr/bin/env python3
"""Noch laufende Sessions nachrechnen, deren Upload zur Ruhe gekommen ist.

    cd server && .venv/bin/python ../scripts/live-sessions-nachrechnen.py
    cd server && .venv/bin/python ../scripts/live-sessions-nachrechnen.py --trocken

SCHREIBT: rechnet die Analyse neu (`final=False`) — der Status bleibt `live`, die Uhr darf ihre
Daten also weiter behalten. Laeuft ueber `foil-live-analyse.timer` alle 5 Minuten.

WARUM ES DAS GIBT (Jan, 06.09.2026): „auswerten und anzeigen was schon da ist … und immer wenn
zusaetzliche Daten ankamen, nochmal neu die ganze Analyse."

Der Chunk-Empfang stoesst das selbst an — aber nur, solange Chunks kommen. Genau der wichtigste
Fall bricht das: eine Aufnahme, deren Upload mittendrin aufhoert (leerer Akku, App geschlossen,
Netz weg). Dann kommt kein Chunk mehr, der die Ruhezeit pruefen koennte, und der letzte Stand
bleibt fuer immer stehen. Belegt an einer Apple Watch: 4 statt 13 Laeufe, monatelang unbemerkt.
Deshalb dieser Durchlauf von aussen.

Die Faelligkeit entscheidet `ingest._nachrechnen_faellig` — dieselbe Regel wie beim Chunk-Empfang
und beim Oeffnen der Detailseite, damit es nur EINE Definition davon gibt.
"""
import argparse
import os
import pathlib
import re
import sys


def env_laden() -> None:
    for zeile in pathlib.Path(".env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trocken", action="store_true", help="nur zeigen, was faellig waere")
    args = ap.parse_args()

    if not pathlib.Path(".env").exists():
        print("Bitte aus dem Ordner server/ starten.", file=sys.stderr)
        return 2
    env_laden()
    sys.path.insert(0, ".")

    from app import models, storage
    from app.analysis import run_analysis
    from app.api.ingest import _nachrechnen_faellig
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        offen = (db.query(models.Session)
                 .filter(models.Session.status.in_(("recording", "live")),
                         models.Session.deleted.is_(False))
                 .order_by(models.Session.id).all())
        print(f"{len(offen)} noch laufende Session(s)")
        gerechnet = 0
        for s in offen:
            if not _nachrechnen_faellig(db, s):
                continue
            # Sperre wie in `reanalyse-alle.py`: ohne GPS-Rohdaten NIE rechnen — das Ergebnis
            # waere zwangslaeufig leer und wuerde einen gueltigen Stand ueberschreiben.
            d = storage.session_dir(s.session_uuid) / "gps"
            if not (d.is_dir() and any(d.iterdir())):
                print(f"   #{s.id}: faellig, aber keine GPS-Rohdaten — uebersprungen")
                continue
            vorher = s.result.num_runs if s.result else None
            if args.trocken:
                print(f"   #{s.id} (user {s.user_id}): faellig, bisher {vorher} Laeufe")
                continue
            res = run_analysis(db, s, final=False)
            db.commit()
            gerechnet += 1
            print(f"   #{s.id} (user {s.user_id}): {vorher} -> {res.num_runs} Laeufe, "
                  f"{res.total_distance_m} m")
        print(f"nachgerechnet: {gerechnet}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
