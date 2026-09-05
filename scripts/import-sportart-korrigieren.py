#!/usr/bin/env python3
"""Bestehende Importe nachtraeglich richtig einsortieren — Trockenlauf per Vorgabe.

    cd server && .venv/bin/python ../scripts/import-sportart-korrigieren.py
    cd server && .venv/bin/python ../scripts/import-sportart-korrigieren.py --schreiben

Befund vom 05.09.2026: `fitimport.parse_fit_bytes` las die Sportart nur aus einer eigenen
`sport`-Nachricht. SUUNTO schreibt sie aber ausschliesslich in die `session`-Nachricht — deren
Dateien haben gar keine `sport`-Nachricht. Folge: jede Suunto-Session kam als „pumpfoil"
herein. Belegt an Session 3501, in deren Datei „sailing" steht.

Nachgezaehlt ueber alle 901 Import-Sessions: 260 haben ihre Originaldatei noch (`original.bin`),
242 davon nennen eine ANDERE Sportart als die, unter der sie bei uns stehen. 130 zaehlten als
Pumpfoil — darunter 25 Radfahrten, 20 Laeufe, 4 Fussballspiele.

WAS DIESES SKRIPT AENDERT — und was bewusst NICHT
- Nur Sessions, deren Einstufung NIEMAND angefasst hat (`sport_source = 'default'`). Wo der
  Besitzer selbst entschieden hat (`owner`) oder unsere Sport-Automatik geurteilt hat (`auto`),
  bleibt es, wie es ist.
- Nur Sportarten aus `KEIN_FOILEN` (dieselbe Liste wie im Import, s. `sessions.py`): Laufen,
  Radfahren, Fussball und so weiter. **Wassersport wird NICHT umsortiert** — fuer Pumpfoil gibt
  es auf keiner Uhr einen eigenen Modus, also stellen Leute ihre Uhr auf Surfen, SUP,
  Kitesurfen oder Segeln. Dort zu raten hiesse, echte Pumper auszusortieren.
- `sport` (die Angabe der Datei) wird IMMER nachgetragen, auch bei Wassersport: die Information
  war ja da, wir haben sie nur nicht gelesen. Sichtbar wird sie in der Session-Ansicht.

`sport_source` wird auf `file` gesetzt, damit die Sport-Automatik nicht darueber laeuft und
spaeter erkennbar bleibt, woher die Einstufung stammt.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import sys
from collections import Counter

BASIS = pathlib.Path(__file__).resolve().parent.parent


def main() -> None:
    schreiben = "--schreiben" in sys.argv
    for z in (BASIS / "server/.env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", z.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))
    sys.path.insert(0, str(BASIS / "server"))
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session as OrmSession
    from app import models, storage
    from app.api.sessions import import_parsed_session  # noqa: F401  (laedt KEIN_FOILEN-Kontext)
    from app.fitimport import parse_fit_bytes

    # Dieselbe Liste wie im Import. Bewusst dupliziert statt importiert: sie steht dort mitten
    # in einer Funktion, und ein Umbau nur fuer dieses Einmal-Skript waere die schlechtere Wahl.
    KEIN_FOILEN = {
        "running", "trail_running", "cycling", "e_biking", "mountain_biking", "walking", "hiking",
        "soccer", "american_football", "basketball", "tennis", "golf", "training",
        "fitness_equipment", "floor_climbing", "rock_climbing", "mountaineering",
        "alpine_skiing", "snowboarding", "cross_country_skiing", "snowshoeing", "ice_skating",
        "inline_skating", "horseback_riding", "motorcycling", "driving", "sky_diving",
        "hunting", "fishing", "swimming", "rowing", "kayaking", "paddling",
    }

    eng = create_engine(os.environ["DATABASE_URL"])
    umgestuft, nur_sport, uebersprungen = [], [], Counter()
    with OrmSession(eng) as db:
        alle = (db.query(models.Session)
                .filter(models.Session.deleted.isnot(True), models.Session.device_id.is_(None))
                .all())
        print(f"{len(alle)} Import-Sessions werden geprueft …", file=sys.stderr)
        for i, s in enumerate(alle):
            if i and i % 150 == 0:
                print(f"   {i} …", file=sys.stderr)
            f = storage.session_dir(s.session_uuid) / "original.bin"
            if not f.exists():
                uebersprungen["ohne Originaldatei"] += 1
                continue
            try:
                datei_sport = (parse_fit_bytes(f.read_bytes()).get("sport") or "").lower()
            except Exception:                                    # noqa: BLE001
                uebersprungen["unlesbar"] += 1
                continue
            if not datei_sport or datei_sport == (s.sport or "").lower():
                uebersprungen["schon richtig"] += 1
                continue
            quelle = s.sport_source or "default"
            if datei_sport in KEIN_FOILEN and quelle == "default":
                umgestuft.append((s, datei_sport))
            else:
                nur_sport.append((s, datei_sport))
                if datei_sport in KEIN_FOILEN:
                    uebersprungen[f"nicht angefasst ({quelle} hat entschieden)"] += 1

        print("\n" + "=" * 74)
        print(f"UMSTUFEN auf 'other' — Sportart, die kein Foilen sein kann: {len(umgestuft)}")
        print("=" * 74)
        for art, n in Counter(a for _, a in umgestuft).most_common():
            print(f"   {art:28s} {n}")
        print(f"\nNUR die Sportart nachtragen (Klasse bleibt): {len(nur_sport)}")
        for art, n in Counter(a for _, a in nur_sport).most_common(10):
            print(f"   {art:28s} {n}")
        print("\nUebersprungen:", dict(uebersprungen))

        if not schreiben:
            print("\nTrockenlauf — nichts geschrieben. Mit --schreiben ausfuehren.")
            return

        for s, art in umgestuft:
            s.sport = art
            s.sport_class = "other"
            s.sport_source = "file"
            s.is_pumpfoil = False
        for s, art in nur_sport:
            s.sport = art
        db.commit()
        print(f"\nGESCHRIEBEN: {len(umgestuft)} umgestuft, {len(nur_sport)} Sportart nachgetragen.")


if __name__ == "__main__":
    main()
