#!/usr/bin/env python3
"""Sessiondauer je Uhrenmodell — findet Geraete, die systematisch zu kurz aufnehmen.

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" \
        .venv/bin/python ../scripts/uhr-gesundheit.py [--tage 90] [--min 5]

READ-ONLY. Schreibt nichts, weder in die DB noch in Dateien.

WARUM ES DAS GIBT (17.09.2026). Sechs Instinct-2-Nutzer haben ueber 46 Aufnahmen zusammen
0,25 Foil-km zustande gebracht — die App stuerzte ihnen waehrend der Aufnahme ab. KEINER von
ihnen hat sich gemeldet. Ebenso die fenix-5-Fahrer: 72 % ihrer Aufnahmen unter zehn Minuten,
kein einziges Wort. Nutzer melden so etwas nicht; sie halten es fuer normal oder fuer den
eigenen Fehler, und irgendwann hoeren sie auf.

Ein Absturzzaehler haette es auch nicht gezeigt: den gibt es erst ab 1.0.77, und er meldet nur,
wer die App danach nochmal oeffnet. Was es gezeigt hat, war DIESE Tabelle — die Sessiondauer je
Modell. Ein Modell, dessen Median weit unter dem Rest liegt, hat ein Problem.

Kein Tracking: die Daten liegen ohnehin in `sessions`, gezaehlt wird nur, was jemand aufgenommen
hat. Siehe Memory `no-analytics-ever`.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import statistics as st
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))

PARTMAP = os.path.join(os.path.dirname(__file__), "..", "watch", "bin", "partmap.json")
DEVDIR = os.path.expanduser("~/.Garmin/ConnectIQ/Devices")
LITE_GRENZE = 131072      # dieselbe Schwelle wie _gpsChunkTarget/_accelChunkTarget in der Uhr-App


def speichergrenzen() -> dict[str, int]:
    """Geraete-Id -> watchApp-Speicherbudget, aus den SDK-Geraetedateien."""
    out = {}
    for f in glob.glob(f"{DEVDIR}/*/compiler.json"):
        try:
            d = json.load(open(f))
            typen = {x.get("type"): x.get("memoryLimit") for x in d.get("appTypes", [])}
            if typen.get("watchApp"):
                out[os.path.basename(os.path.dirname(f))] = typen["watchApp"]
        except Exception:
            pass
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--tage", type=int, default=90, help="Zeitfenster (Standard 90)")
    ap.add_argument("--min", type=int, default=5, help="Mindestzahl Aufnahmen je Modell")
    args = ap.parse_args()
    if not os.environ.get("DATABASE_URL"):
        sys.exit("DATABASE_URL fehlt (s. Kopf dieser Datei).")

    from app import models
    from app.db import SessionLocal

    db = SessionLocal()
    D, S = models.DeviceToken, models.Session
    partmap = json.load(open(PARTMAP))
    grenze = speichergrenzen()
    seit = datetime.now(timezone.utc) - timedelta(days=args.tage)

    zeilen = []
    for pn, info in partmap.items():
        lim = grenze.get(info["id"])
        if lim is None:
            continue
        ids = [d.id for d in db.query(D).filter(D.part_number == pn)]
        if not ids:
            continue
        dauern = []
        for t0, t1 in db.query(S.started_at, S.ended_at).filter(
                S.device_id.in_(ids), S.deleted.isnot(True),
                S.ended_at.isnot(None), S.started_at >= seit).all():
            m = (t1 - t0).total_seconds() / 60
            if 0 < m < 600:              # ueber 10 h ist keine Session, sondern ein Datenfehler
                dauern.append(m)
        if len(dauern) >= args.min:
            zeilen.append({
                "budget": lim, "name": info["name"], "n": len(dauern),
                "median": st.median(dauern),
                "kurz": 100 * sum(1 for x in dauern if x < 10) / len(dauern),
            })

    if not zeilen:
        print("Keine Modelle mit genug Aufnahmen im Zeitfenster.")
        return

    gesamt = st.median([z["median"] for z in zeilen])
    print(f"Sessiondauer je Uhrenmodell, letzte {args.tage} Tage, ab {args.min} Aufnahmen.")
    print(f"Median ueber alle Modelle: {gesamt:.1f} min\n")
    print(f"{'Budget':>8} {'Uhr':<38} {'Aufn.':>6} {'Median':>9} {'<10 min':>8}  Befund")
    for z in sorted(zeilen, key=lambda x: x["median"]):
        # Auffaellig = Median unter einem Drittel des Gesamtmedians. Bewusst grob: das hier soll
        # HINSCHAUEN ausloesen, nicht urteilen. Die Instinct 2 lag bei 1,0 gegen 51,3 Minuten.
        auf = z["median"] < gesamt / 3
        note = "⚠ AUFFAELLIG" if auf else ""
        if z["budget"] <= LITE_GRENZE:
            note += ("  " if note else "") + "(Lite-Klasse)"
        print(f"{z['budget']:>8} {z['name'][:38]:<38} {z['n']:>6} {z['median']:>8.1f} "
              f"{z['kurz']:>7.0f}%  {note}")

    lite = [z for z in zeilen if z["budget"] <= LITE_GRENZE]
    gross = [z for z in zeilen if z["budget"] > LITE_GRENZE]
    print()
    for name, g in (("Lite-Klasse (<=128 KB)", lite), ("darueber", gross)):
        if g:
            print(f"  {name:<24} {len(g):>2} Modelle, {sum(x['n'] for x in g):>5} Aufnahmen, "
                  f"Median der Mediane {st.median([x['median'] for x in g]):>5.1f} min")
    print("\nEin Modell weit unter dem Rest heisst NICHT automatisch Fehler — kleine Fallzahlen")
    print("schwanken stark, und manche Uhr wird nur zum Ausprobieren getragen. Es heisst:")
    print("nachsehen. Der Weg, der beim Instinct-2-Fall zum Ziel fuehrte, steht in docs/TODO.md.")


if __name__ == "__main__":
    main()
