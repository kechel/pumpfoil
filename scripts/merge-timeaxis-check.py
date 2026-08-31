#!/usr/bin/env python3
"""Prüft REIN LESEND, wie weit die Zeitachse zusammengeführter Sessions von der Wanduhr abweicht.

    cd server && .venv/bin/python ../scripts/merge-timeaxis-check.py
    cd server && .venv/bin/python ../scripts/merge-timeaxis-check.py 3159   # nur eine Session

Hintergrund (docs/TODO.md, 31.08.2026): `merge.py` hängt die Teile mit
`off_ms += Länge(voriger Teil) + GAP_MS` aneinander und rebased jeden Teil vorher auf 0, gibt der
neuen Session aber `started_at` des ERSTEN Teils. Damit fallen der weggetrimmte Kopf jedes Teils
und die echte Pause zwischen den Aufnahmen aus der Achse — `started_at + Session-ms` ist dann
NICHT die Uhrzeit. Der Fehler ist je Teil verschieden, wächst also im Lauf der Session.

Dieses Skript schreibt nichts. Es rechnet für jede zusammengeführte Session aus, wo Merge-ms 0
und jeder Nahtpunkt in Wirklichkeit liegen, und zeigt den Fehler je Teil.
"""
import json
import os
import sys
from datetime import timedelta

GAP_MS = 20_000   # muss mit merge.GAP_MS übereinstimmen


def _env():
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')


def main() -> int:
    _env()
    from sqlalchemy import create_engine, text
    eng = create_engine(os.environ["DATABASE_URL"])
    nur = int(sys.argv[1]) if len(sys.argv) > 1 else None

    with eng.connect() as c:
        wo = "AND m.id = :nur" if nur else ""
        ids = [r[0] for r in c.execute(text(
            f"SELECT m.id FROM sessions m WHERE m.session_uuid LIKE 'merge-%%' "
            f"AND m.deleted IS NOT TRUE {wo} ORDER BY m.id"), {"nur": nur} if nur else {})]
        if not ids:
            print("Keine zusammengeführten Sessions gefunden.")
            return 0

        print(f"{len(ids)} zusammengeführte Session(s).\n")
        gesamt_max = 0.0
        for sid in ids:
            teile = c.execute(text(
                "SELECT id, started_at, trim_start_ms, trim_end_ms FROM sessions "
                "WHERE merged_into = :s ORDER BY started_at"), {"s": sid}).fetchall()
            if not teile:
                print(f"  s{sid}: keine Quell-Sessions mehr auffindbar — übersprungen")
                continue
            start = c.execute(text("SELECT started_at FROM sessions WHERE id = :s"),
                              {"s": sid}).scalar()
            erster = teile[0][1]
            off = 0
            zeilen, groesster = [], 0.0
            for tid, tstart, ta, tb in teile:
                ta = ta or 0
                laenge = (tb - ta) if tb else 0
                # Wo liegt Merge-ms `off` wirklich? Am Trim-Start dieses Teils.
                echt = tstart + timedelta(milliseconds=ta)
                angezeigt = start + timedelta(milliseconds=off)
                fehler = (echt - angezeigt).total_seconds()
                groesster = max(groesster, abs(fehler))
                zeilen.append(f"      Teil s{tid}: Merge-ms {off:>9} = angezeigt "
                              f"{angezeigt:%H:%M:%S}, echt {echt:%H:%M:%S}  → {fehler:+.0f} s")
                off += laenge + GAP_MS
            gesamt_max = max(gesamt_max, groesster)
            marke = "  ⚠" if groesster >= 60 else ""
            print(f"  s{sid}: {len(teile)} Teile, größter Zeitfehler {groesster/60:5.1f} min{marke}")
            for z in zeilen:
                print(z)
        print(f"\nGrößter Zeitfehler über alle: {gesamt_max/60:.1f} min")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
