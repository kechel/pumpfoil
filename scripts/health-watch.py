#!/usr/bin/env python3
"""Systemzustand pruefen und bei Warnungen die Admins per Push benachrichtigen.

Warum es dieses Skript gibt: der Admin-Bildschirm (`/admin?tab=system`) misst nur, wenn jemand
hinschaut. Eine Warnung ist aber gerade dann wertvoll, wenn niemand hinschaut — also laeuft
dieselbe Messung samt Bewertung hier im Zeitgeber (`deploy/foil-health.timer`, alle 5 Minuten).

Zwei Nebenwirkungen, beide gewollt:
  * Der Verlauf im Bildschirm wird echt. Jeder Lauf schreibt einen Messpunkt (`system_samples`),
    also gibt es Linien fuer die letzten 14 Tage statt nur fuer die Zeit, in der jemand zuschaut.
  * Die Buchfuehrung in `health_alerts` entscheidet ueber Wiederholungen — dieses Skript kann
    also beliebig oft laufen, ohne zur Plage zu werden.

Aufruf (aus dem server/-Verzeichnis, mit dessen venv):
    .venv/bin/python ../scripts/health-watch.py [--still]

`--still` unterdrueckt die Ausgabe (fuer den Zeitgeber; Fehler gehen weiter ins Journal).

Die DATABASE_URL kommt aus server/.env — mit einem eigenen Parser, weil `set -a; . ./.env` sie
NICHT zuverlaessig exportiert und wir sonst gegen die alte SQLite-Datei laufen (bekannte Falle,
s. CLAUDE.md).
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

WURZEL = Path(__file__).resolve().parent.parent
SERVER = WURZEL / "server"


def env_laden() -> None:
    datei = SERVER / ".env"
    if not datei.exists():
        return
    for zeile in datei.read_text(encoding="utf-8").splitlines():
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)=(.*)$', zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def main() -> int:
    still = "--still" in sys.argv
    env_laden()
    sys.path.insert(0, str(SERVER))
    from app.api.health import melde, sammle          # noqa: PLC0415 — erst nach dem Pfad-Setup
    from app.db import SessionLocal                   # noqa: PLC0415

    db = SessionLocal()
    try:
        d = sammle(db)
        n = melde(db, d["warnungen"])
    finally:
        db.close()

    if not still:
        for w in d["warnungen"]:
            print(f"[{w['stufe']}] {w['schluessel']}: {w['text']}")
        if not d["warnungen"]:
            print("keine Warnungen")
        print(f"{n} Push-Zustellung(en)")
    elif d["warnungen"]:
        # Im stillen Modus nur Warnungen ins Journal — dort sind sie spaeter nachvollziehbar.
        for w in d["warnungen"]:
            print(f"[{w['stufe']}] {w['schluessel']}: {w['text']}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
