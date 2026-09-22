#!/usr/bin/env python3
"""Automatische Zuschnitte zuruecknehmen, die die HEUTIGE Regel nicht mehr setzen wuerde.

    cd server && .venv/bin/python ../scripts/auto-zuschnitt-reparieren.py            # Voranzeige
    cd server && .venv/bin/python ../scripts/auto-zuschnitt-reparieren.py --machen

SCHREIBT mit --machen: nimmt den Zuschnitt zurueck und rechnet die Session neu (`final=True`).

WORUM ES GEHT (Befund 21.09.2026, Jans Freigabe 22.09. „Auto-Zuschnitt trifft 38 Nutzer bitte
machen"): `maybe_auto_trim` setzte den Zuschnitt auf [erster Lauf - 15 s, letzter Lauf + 15 s].
Fand die Pumpfoil-Erkennung nur EINEN kurzen Lauf, schnitt das den Rest der Aufnahme weg — samt
echter Fahrt. Gemessen waren es 81 Sessions von 48 Nutzern mit unter 2 Minuten Fenster aus einer
Aufnahme ueber 10 Minuten, bei 59 davon lagen zusammen 188 Minuten Fahrt (>2 m/s) DRAUSSEN.
Sichtbar wurde es als absurde Gesamtstrecke: #624 stand mit 70 m fuer 100 Minuten Aufnahme da.

DIE URSACHE IST BEHOBEN (c051be25, 21.09.): `AUTO_TRIM_MIN_FENSTER_MS` (2 min) und
`AUTO_TRIM_MIN_ANTEIL` (10 %) verhindern solche Zuschnitte seitdem. Dieses Skript ist der
Nachzug fuer den BESTAND — alles, was vor dem Fix entstanden ist.

NUR AUTOMATISCHE ZUSCHNITTE (`trim_auto`). Ein von Hand gesetzter Zuschnitt ist eine
Entscheidung des Besitzers und wird nie angefasst, auch wenn er schmal ist.

KEINE BENACHRICHTIGUNG: die Sessions sind Wochen bis Monate alt (der Bestand reicht bis
Juli zurueck). Ein „ausgewertet"-Push waere genau der nachtraegliche Push, den die Regel
verbietet — deshalb `run_analysis` direkt statt `_analyze_in_background`.

IST-ZUSTAND WIRD GESICHERT nach `server/data/zuschnitt-vorher-<stamp>.json`, bevor etwas
geschrieben wird. `run_analysis` committet selbst, ein Rollback gibt es nicht.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

HIER = Path(__file__).resolve().parent
SERVER = HIER.parent / "server"
sys.path.insert(0, str(SERVER))

for zeile in (SERVER / ".env").read_text().splitlines():
    m = re.match(r"^([A-Z_][A-Z0-9_]*)=(.*)$", zeile.strip())
    if m and m.group(1) not in os.environ:
        os.environ[m.group(1)] = m.group(2)
if os.environ.get("DETECTOR_V2", "").strip().lower() not in ("1", "true", "yes", "on"):
    sys.exit("DETECTOR_V2 fehlt — sonst schreibt run_analysis stumm v1-Ergebnisse. Abbruch.")

from app import models, storage                                          # noqa: E402
from app.analysis import (AUTO_TRIM_MIN_ANTEIL, AUTO_TRIM_MIN_FENSTER_MS,  # noqa: E402
                          maybe_auto_trim, run_analysis)
from app.db import SessionLocal                                          # noqa: E402


def dauer_ms(s) -> int:
    """Laenge der Aufnahme aus der GPS-Spur — dieselbe Quelle wie in `maybe_auto_trim`."""
    gps = storage.load_gps(s.session_uuid)
    return int(gps[-1][0]) if gps else 0


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--machen", action="store_true", help="wirklich schreiben")
    ap.add_argument("--session", type=int, action="append", help="nur diese ID (mehrfach)")
    args = ap.parse_args()

    db = SessionLocal()
    kand = (db.query(models.Session)
            .filter(models.Session.deleted.is_(False),
                    models.Session.trim_auto.is_(True),
                    models.Session.trim_start_ms.isnot(None))
            .order_by(models.Session.id).all())
    if args.session:
        kand = [s for s in kand if s.id in set(args.session)]

    betroffen, vorher = [], []
    for s in kand:
        fenster = int(s.trim_end_ms or 0) - int(s.trim_start_ms or 0)
        ganz = dauer_ms(s)
        zu_schmal = fenster < AUTO_TRIM_MIN_FENSTER_MS
        zu_wenig = ganz > 0 and fenster < AUTO_TRIM_MIN_ANTEIL * ganz
        if not (zu_schmal or zu_wenig):
            continue
        r = s.result
        betroffen.append((s, fenster, ganz, zu_schmal, zu_wenig))
        vorher.append({"id": s.id, "user_id": s.user_id,
                       "trim_start_ms": s.trim_start_ms, "trim_end_ms": s.trim_end_ms,
                       "trim_auto": s.trim_auto, "dauer_ms": ganz,
                       "total_distance_m": None if r is None else r.total_distance_m,
                       "num_runs": None if r is None else r.num_runs,
                       "pump_count": None if r is None else r.pump_count})

    print(f"{len(kand)} automatische Zuschnitte, davon {len(betroffen)} nach der heutigen Regel "
          f"zu eng (unter {AUTO_TRIM_MIN_FENSTER_MS // 1000} s ODER unter "
          f"{AUTO_TRIM_MIN_ANTEIL:.0%} der Aufnahme)\n")
    for s, fenster, ganz, schmal, wenig in betroffen:
        grund = "+".join([g for g, an in (("zu kurz", schmal), ("zu klein", wenig)) if an])
        print(f"  #{s.id:5d} N{s.user_id:4d} {s.started_at:%d.%m.%y}  Fenster {fenster/1000:6.0f} s "
              f"von {ganz/1000:7.0f} s ({fenster/max(ganz,1):5.1%})  {grund}")

    if not args.machen:
        print("\n(Voranzeige — nichts geschrieben. Mit --machen ausfuehren.)")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sicherung = SERVER / "data" / f"zuschnitt-vorher-{stamp}.json"
    sicherung.write_text(json.dumps(vorher, indent=2, ensure_ascii=False))
    print(f"\nIst-Zustand gesichert: {sicherung}")

    for s, fenster, ganz, _s1, _s2 in betroffen:
        alt_m = (s.result.total_distance_m or 0) if s.result else 0
        s.trim_start_ms = None
        s.trim_end_ms = None
        s.trim_auto = False
        db.commit()
        try:
            run_analysis(db, s, final=True)
            # Die HEUTIGE Regel noch einmal anwenden: wo ein Zuschnitt zulaessig waere, soll er
            # auch gesetzt werden — zurueckgenommen wird nur der zu enge, nicht der Mechanismus.
            if maybe_auto_trim(db, s):
                run_analysis(db, s, final=True)
        except Exception as e:                                  # noqa: BLE001
            print(f"  #{s.id}: FEHLER {e!r}")
            db.rollback()
            continue
        neu_m = (s.result.total_distance_m or 0) if s.result else 0
        print(f"  #{s.id}: {alt_m:.0f} m -> {neu_m:.0f} m, Zuschnitt "
              f"{'neu gesetzt' if s.trim_start_ms is not None else 'entfaellt'}")
    print("\nFertig. KEINE Push-Benachrichtigung verschickt.")


if __name__ == "__main__":
    main()
