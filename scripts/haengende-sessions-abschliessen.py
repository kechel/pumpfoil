#!/usr/bin/env python3
"""Sessions aufsammeln, die auf `complete` haengengeblieben sind.

    cd server && .venv/bin/python ../scripts/haengende-sessions-abschliessen.py --trocken
    cd server && .venv/bin/python ../scripts/haengende-sessions-abschliessen.py

SCHREIBT: fuehrt die FINALE Analyse aus (`final=True`) — Status `complete` -> `analyzed`,
inklusive Auto-Zuschnitt, Ort/Spot und der einmaligen „ausgewertet"-Benachrichtigung.
Laeuft ueber `foil-haenger.timer` alle 3 Stunden.

WARUM ES DAS GIBT (15.09.2026, Jans Ansage „mach einen regelmaessigen Aufraeum-Lauf"):
`complete` heisst, die Uhr hat `/complete` geschickt und eine Quittung bekommen — sie darf ihre
Kopie also loeschen. Fertig ist die Session damit noch nicht: die finale Analyse laeuft
HINTERHER. Stirbt sie, bleibt die Aufnahme fuer immer in diesem Zwischenzustand stehen: in der
Liste als „wird verarbeitet", ohne Benachrichtigung, ohne Auto-Zuschnitt, und aus der Community
ausgeblendet. Genau so passiert an #8517 und #8504 (beide 15.09.), als zwei Analysen gleichzeitig
die Ergebniszeile anlegen wollten.

Die URSACHE ist behoben (run_analysis reserviert die Zeile jetzt atomar), und es gibt zwei
Rueckwege: beim Ansehen der Session und beim naechsten Upload desselben Geraets. Beide brauchen
aber, dass jemand etwas TUT. Eine Aufnahme, die niemand oeffnet und deren Uhr nie wieder etwas
hochlaedt, kaeme ohne diesen Lauf nicht zurueck — und der naechste unbekannte Fehler an dieser
Stelle wuerde wieder eine Aufnahme kosten.

BEWUSST NUR `complete`: `live`/`recording` bleiben unberuehrt. Dort kann die Uhr noch Daten
halten, und ein verfruehter Abschluss wuerde ihr sagen, sie duerfe sie wegwerfen. Diese Faelle
raeumt `_altlasten_abschliessen` auf, wenn dasselbe Geraet die naechste Aufnahme anmeldet.
"""
import argparse
import os
import pathlib
import re
import sys

# Die Faelligkeit entscheidet `ingest.haenger_faellig` — dieselbe Regel, eine Definition,
# und pruefbar (s. tests/test_haenger_aufraeumen.py).


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
    from app.api.ingest import _analyze_in_background, haenger_faellig
    from app.db import SessionLocal

    db = SessionLocal()
    try:
        offen = (db.query(models.Session)
                 .filter(models.Session.status == "complete",
                         models.Session.deleted.is_(False))
                 .order_by(models.Session.id).all())
        faellig = []
        for s in offen:
            if not haenger_faellig(s):
                print(f"   #{s.id}: erst vor kurzem angefasst — in Ruhe gelassen")
                continue
            # Dieselbe Sperre wie im Live-Lauf: ohne GPS-Rohdaten NIE rechnen, das Ergebnis
            # waere zwangslaeufig leer und wuerde einen gueltigen Stand ueberschreiben.
            d = storage.session_dir(s.session_uuid) / "gps"
            if not (d.is_dir() and any(d.iterdir())):
                print(f"   #{s.id}: keine GPS-Rohdaten — uebersprungen")
                continue
            faellig.append(s)
        print(f"{len(offen)} auf 'complete', davon {len(faellig)} faellig")
        for s in faellig:
            if args.trocken:
                print(f"   #{s.id} (user {s.user_id}, {s.started_at:%d.%m. %H:%M}): wuerde final analysiert")
                continue
            sid, uid = s.id, s.user_id
            # Ueber _analyze_in_background, damit WIRKLICH dasselbe passiert wie nach einem
            # gelungenen /complete: finale Analyse, Auto-Zuschnitt, Ort/Spot, Benachrichtigung.
            # Die ist ueber `analyzed_notified` einmalig, kommt hier also hoechstens drei
            # Stunden zu spaet statt gar nicht.
            _analyze_in_background(sid, True)
            frisch = db.query(models.Session.status).filter_by(id=sid).scalar()
            print(f"   #{sid} (user {uid}): complete -> {frisch}")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
