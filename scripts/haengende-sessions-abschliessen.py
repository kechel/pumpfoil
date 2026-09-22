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

    from datetime import timedelta

    from sqlalchemy import func

    from app import models, storage
    from app.analysis import maybe_auto_trim, run_analysis
    from app.api.ingest import _analyze_in_background, haenger_faellig
    from app.clockmap import gesamt_pause_ms
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

        # --- Zweiter Fall: NIE ein /complete bekommen -----------------------------------------
        # Jan, 22.09.2026: „Automatik fuer haengende Aufnahmen ja bitte machen … ist ja
        # ungefaehrlich weil weitere daten problemlos nachtraeglich trotzdem dazu koennen."
        # Genau so ist es gebaut: der Abschluss sagt der UHR nichts, `/status` meldet ihr
        # weiterhin erst „complete", wenn alle Chunks da sind. Kommt spaeter doch noch etwas,
        # wird ergaenzt und neu gerechnet.
        #
        # KEINE BENACHRICHTIGUNG, anders als oben: diese Aufnahmen sind mindestens 12 Stunden
        # alt, im Bestand waren einzelne sechs Wochen. „Deine Session ist ausgewertet" waere
        # genau der nachtraegliche Push, den Jans Regel verbietet. Deshalb `run_analysis`
        # direkt statt `_analyze_in_background`.
        liegen = (db.query(models.Session)
                  .filter(models.Session.status.in_(("live", "recording")),
                          models.Session.deleted.is_(False))
                  .order_by(models.Session.id).all())
        reif = []
        for s in liegen:
            letzter = (db.query(func.max(models.IngestChunk.received_at))
                       .filter_by(session_id=s.id).scalar())
            if not haenger_faellig(s, letzter_chunk=letzter):
                continue
            d = storage.session_dir(s.session_uuid) / "gps"
            if not (d.is_dir() and any(d.iterdir())):
                print(f"   #{s.id}: keine GPS-Rohdaten — uebersprungen")
                continue
            reif.append(s)
        print(f"{len(liegen)} auf 'live'/'recording', davon {len(reif)} faellig")
        for s in reif:
            if args.trocken:
                print(f"   #{s.id} (user {s.user_id}, {s.started_at:%d.%m. %H:%M}): "
                      f"wuerde abgeschlossen und final analysiert")
                continue
            sid, uid, alt_status = s.id, s.user_id, s.status
            # Endzeit wie in `/complete`: letzter GPS-Zeitstempel plus die Pausendauer.
            if s.ended_at is None and s.started_at is not None:
                lm = storage.gps_last_ms(s.session_uuid)
                if lm:
                    s.ended_at = s.started_at + timedelta(milliseconds=lm + gesamt_pause_ms(s))
                    db.commit()
            try:
                run_analysis(db, s, final=True)
                if maybe_auto_trim(db, s):
                    run_analysis(db, s, final=True)
            except Exception as e:                                  # noqa: BLE001
                print(f"   #{sid}: FEHLER {e!r}")
                db.rollback()
                continue
            try:
                from app.api.sessions import _geocode_place
                _geocode_place(sid)
            except Exception:                                       # noqa: BLE001
                pass
            print(f"   #{sid} (user {uid}): {alt_status} -> {s.status} (ohne Benachrichtigung)")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
