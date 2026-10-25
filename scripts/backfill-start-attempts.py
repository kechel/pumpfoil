#!/usr/bin/env python3
"""Startversuche im Bestand nachziehen — NUR das Feld `start_attempts_json`.

Seit 25.10.2026 mit der neuen Zaehlung `analysis/startversuche.py` (startversuche-1, „Ruhe -> schnell -> Ruhe oder
GPS-Abriss" mit Anlauf aus der Beschleunigung). Dieselben Eingaben wie run_analysis: ganze Aufnahme beim Auto-Zuschnitt,
nur das Fenster beim manuellen, ohne aussortierte Fenster und Autofahrten; Laeufe aus segments_json. Nur Sessions mit
is_pumpfoil — alle anderen bekommen [] (Regel seit 12.10.).

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

    # DATABASE_URL MUSS im Env stehen, sonst bricht app.config beim Import ab (Memory
    # `reanalyse-detector-v2-env`): `set -a; . ./.env` exportiert es nicht zuverlaessig.
    if not os.environ.get("DATABASE_URL"):
        for zeile in open(os.path.join(os.path.dirname(__file__), "..", "server", ".env"), encoding="utf-8"):
            if zeile.startswith("DATABASE_URL"):
                os.environ["DATABASE_URL"] = zeile.split("=", 1)[1].strip().strip('"')
    # NIE die URL ausgeben — sie traegt das Passwort (25.10.2026 hier so ins Protokoll geraten). Nur Host/DB.
    print("DB:", os.environ.get("DATABASE_URL", "").rsplit("@", 1)[-1])

    from app.db import SessionLocal
    from app import models, storage
    from app.analysis import analyse_ausschluss, attempt_distances
    from app.analysis.startversuche import fuer_session

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
    mit_accel: list[tuple[int, int, int]] = []
    for s in sessions:
        ar = s.result
        if ar is None:
            continue
        try:
            alt = len(json.loads(ar.start_attempts_json) or []) if ar.start_attempts_json else 0
        except ValueError:
            alt = 0
        gps = storage.load_gps(s.session_uuid)
        if not s.is_pumpfoil:
            neu = []
        elif len(gps) < 3:
            leer += 1
            continue
        else:
            ts0, ts1 = s.trim_start_ms, s.trim_end_ms
            lo = ts0 if ts0 is not None else 0
            hi = ts1 if ts1 is not None else gps[-1][0]
            manuell = (ts0 is not None or ts1 is not None) and s.trim_auto is not True
            voll = [list(r) for r in gps]
            off = 0.0
            if manuell:
                voll = [[r[0] - lo] + list(r[1:]) for r in voll if lo <= r[0] <= hi]
                off = float(lo)
            else:
                for a, b in analyse_ausschluss(s):
                    voll = [r for r in voll if not (a <= r[0] <= b)]
            if manuell:
                for a, b in analyse_ausschluss(s):
                    voll = [r for r in voll if not (a <= r[0] + lo <= b)]
            segs = json.loads(ar.segments_json or "[]")
            laeufe = [((g.get("t_start_ms") or 0) / 1000.0 + (float(lo) - off) / 1000.0, float(g.get("distance_m") or 0.0))
                      for g in segs]
            try:
                neu = fuer_session(s, gps, storage.load_accel(s.session_uuid), voll, off, laeufe)
                if neu is None:     # ohne Accel: alte Zaehlung, wie run_analysis
                    neu = attempt_distances(voll, s.gps_hz)
                else:
                    mit_accel.append((s.id, alt, len(neu)))
            except Exception as ex:
                print(f"  #{s.id}: FEHLER {type(ex).__name__}: {str(ex)[:80]}")
                continue
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
    if mit_accel:
        a_alt = sum(x[1] for x in mit_accel); a_neu = sum(x[2] for x in mit_accel)
        print(f"davon mit Accel (neue Zaehlung): {len(mit_accel)} Sessions, Versuche {a_alt} -> {a_neu} "
              f"({100 * (a_neu - a_alt) / max(a_alt, 1):+.1f} %), aus 0 Versuchen: "
              f"{sum(1 for x in mit_accel if x[1] == 0 and x[2] > 0)}")
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
