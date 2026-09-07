#!/usr/bin/env python3
"""COROS-Sync serverseitig fuer einen Nutzer ausloesen (statt auf dessen Knopfdruck zu warten).

    cd server && .venv/bin/python ../scripts/coros-sync-fuer.py 277
    cd server && .venv/bin/python ../scripts/coros-sync-fuer.py 277 --warten 60

SCHREIBT: importiert die gefundenen Trainings als Sessions (idempotent ueber `content_hash`
bzw. Startzeit — ein zweiter Lauf legt nichts doppelt an).

Hintergrund (06.09.2026): es gibt KEINEN periodischen Sync. Weder COROS noch Suunto, Polar oder
Strava laufen von allein — `sync()` haengt in `LinkedAccounts.tsx` ausschliesslich am Knopf. Wenn
also etwas nachzuholen ist (hier: ein Training, das an einem inzwischen behobenen Parser-Fehler
gescheitert war), muss es entweder der Nutzer anstossen oder eben dieses Skript.

`--warten N`: alle N Sekunden erneut versuchen, solange der COROS-MCP-Server nicht antwortet.
Deren Dienst war am 06.09. stundenlang auf 504; ohne Wiederholung trifft man das Zeitfenster nicht.
"""
import argparse
import os
import pathlib
import re
import sys
import time


def env_laden() -> None:
    for zeile in pathlib.Path(".env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("user_id", type=int)
    ap.add_argument("--warten", type=int, default=0,
                    help="Sekunden zwischen Wiederholungen, solange COROS nicht antwortet")
    ap.add_argument("--versuche", type=int, default=1)
    ap.add_argument("--tage", type=int, default=0,
                    help="Zeitfenster ausdruecklich weiten (statt ab dem letzten Sync). "
                         "Kostet kein zusaetzliches Kontingent: was wir schon haben, wird an "
                         "der Startzeit erkannt und nicht geladen.")
    args = ap.parse_args()

    if not pathlib.Path(".env").exists():
        print("Bitte aus dem Ordner server/ starten.", file=sys.stderr)
        return 2
    env_laden()
    sys.path.insert(0, ".")

    from app import models
    from app.api.coros_mcp import sync as coros_sync
    from app.db import SessionLocal

    versuche = max(args.versuche, 1 if not args.warten else 10 ** 6)
    for n in range(1, versuche + 1):
        fehler = None
        db = SessionLocal()
        try:
            nutzer = db.get(models.User, args.user_id)
            if nutzer is None:
                print(f"Nutzer {args.user_id} gibt es nicht.", file=sys.stderr)
                return 2
            link = db.query(models.CorosMcpLink).filter_by(user_id=args.user_id).first()
            if link is None:
                print(f"Nutzer {args.user_id} hat COROS nicht verknuepft.", file=sys.stderr)
                return 2
            ergebnis = coros_sync(tage=args.tage, user=nutzer, db=db)
            print(f"Versuch {n}: {ergebnis}", flush=True)
            return 0
        except Exception as exc:  # noqa: BLE001
            fehler = exc
        finally:
            # WICHTIG: die DB-Sitzung wird VOR dem Warten geschlossen. Anders herum haelt das
            # Skript zwischen zwei Versuchen minutenlang eine offene Transaktion — und
            # `init_db()` beim Serverstart fuehrt `ALTER TABLE … ADD COLUMN` aus, was ACCESS
            # EXCLUSIVE braucht. Eine einzige haengende Transaktion blockiert damit den
            # kompletten Start des Servers. Genau das ist am 06.09.2026 passiert (75 Sekunden
            # Ausfall), weil `time.sleep` im `except` INNERHALB des `try/finally` stand.
            db.close()
        print(f"Versuch {n}: {type(fehler).__name__}: {fehler}", flush=True)
        if not args.warten or n >= versuche:
            return 1
        time.sleep(args.warten)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
