#!/usr/bin/env python3
"""Startversuche im Bestand nachziehen — NUR das Feld `start_attempts_json`.

Hintergrund (02.09.2026): die Startversuche wurden bis heute auf den GETRIMMTEN GPS-Punkten
gezaehlt. `maybe_auto_trim` schneidet aber automatisch auf „erster Lauf − 15 s" — womit genau die
Fehlversuche vor dem ersten geglueckten Start wegfielen. Die Start-Erfolgsquote war dadurch
systematisch zu gut (gemessen: +7 % Versuche, Extremfall 1/1 statt 1/44). Die Pipeline rechnet
jetzt ueber die ganze Aufnahme; dieses Skript zieht die schon gespeicherten Sessions nach.

BEWUSST KEINE Reanalyse: es wird ausschliesslich `start_attempts_json` neu geschrieben.
Laeufe, Distanzen, Pumps, Rekorde und die Community bleiben unberuehrt — die Zahl ist reine
Anzeige (s. `attempt_distances`).

    cd server && .venv/bin/python ../scripts/backfill-start-attempts.py            # Trockenlauf
    cd server && .venv/bin/python ../scripts/backfill-start-attempts.py --scharf   # schreibt

Ohne `--scharf` wird NICHTS geschrieben.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../server")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--scharf", action="store_true", help="wirklich schreiben")
    ap.add_argument("--limit", type=int, default=0, help="nur die N neuesten (zum Ausprobieren)")
    args = ap.parse_args()

    # DATABASE_URL MUSS im Env stehen, sonst faellt app.db auf SQLite zurueck (Memory
    # `reanalyse-detector-v2-env`): `set -a; . ./.env` exportiert es nicht zuverlaessig.
    if not os.environ.get("DATABASE_URL"):
        for zeile in open(os.path.join(os.path.dirname(__file__), "..", "server", ".env"), encoding="utf-8"):
            if zeile.startswith("DATABASE_URL"):
                os.environ["DATABASE_URL"] = zeile.split("=", 1)[1].strip().strip('"')
    print("DB:", os.environ.get("DATABASE_URL", "")[:40], "…")

    from app.db import SessionLocal
    from app import models, storage
    from app.analysis import attempt_distances, excluded_windows

    db = SessionLocal()
    q = (db.query(models.Session)
         .join(models.AnalysisResult)
         .filter(models.Session.deleted.isnot(True))
         .order_by(models.Session.started_at.desc()))
    if args.limit:
        q = q.limit(args.limit)
    sessions = q.all()
    print(f"{len(sessions)} Sessions mit Analyse\n")

    gleich = geaendert = leer = 0
    summe_alt = summe_neu = 0
    groesste: list[tuple[int, int, int]] = []
    for s in sessions:
        ar = s.result
        if ar is None:
            continue
        try:
            alt = len(json.loads(ar.start_attempts_json) or []) if ar.start_attempts_json else 0
        except ValueError:
            alt = 0
        gps = storage.load_gps(s.session_uuid)
        if len(gps) < 3:
            leer += 1
            continue
        voll = [list(r) for r in gps]
        for a, b in excluded_windows(s):
            voll = [r for r in voll if not (a <= r[0] <= b)]
        neu = attempt_distances(voll, s.gps_hz)
        summe_alt += alt
        summe_neu += len(neu)
        if len(neu) == alt:
            gleich += 1
            continue
        geaendert += 1
        groesste.append((s.id, alt, len(neu)))
        if args.scharf:
            ar.start_attempts_json = json.dumps(neu)

    if args.scharf:
        db.commit()

    groesste.sort(key=lambda x: -(x[2] - x[1]))
    print(f"unveraendert: {gleich} · geaendert: {geaendert} · ohne GPS: {leer}")
    print(f"Versuche gesamt: {summe_alt} -> {summe_neu} "
          f"({summe_neu - summe_alt:+d} = {100 * (summe_neu - summe_alt) / max(summe_alt, 1):+.1f} %)")
    print("\ngroesste Zuwaechse:")
    for sid, a, b in groesste[:12]:
        print(f"  #{sid}: {a} -> {b}")
    rueck = [x for x in groesste if x[2] < x[1]]
    if rueck:
        print("\nRUECKGANG (unerwartet — bitte ansehen):")
        for sid, a, b in rueck[:12]:
            print(f"  #{sid}: {a} -> {b}")
    print("\nGESCHRIEBEN." if args.scharf else "\nTrockenlauf — nichts geschrieben (--scharf zum Schreiben).")
    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
