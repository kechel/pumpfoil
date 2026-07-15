#!/usr/bin/env python3
"""Entry-Point für den täglichen Rekord-Snapshot (via systemd-Timer foil-records.timer).

Aus dem server/-Verzeichnis mit dem venv starten:
    .venv/bin/python record_snapshot.py

Parst ./.env manuell VOR dem app-Import (set -a; . ./.env exportiert DATABASE_URL nicht zuverlässig
-> liefe sonst gegen die SQLite-Default-DB). Siehe CLAUDE.md.
"""
import os
import re

for _l in open(os.path.join(os.path.dirname(__file__), ".env")):
    _m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)", _l)
    if _m:
        os.environ.setdefault(_m.group(1), _m.group(2).strip().strip('"').strip("'"))

from app.db import SessionLocal  # noqa: E402  (nach dem .env-Parse importieren)
from app.records import run_record_snapshot  # noqa: E402

if __name__ == "__main__":
    db = SessionLocal()
    try:
        n = run_record_snapshot(db)
        print(f"record snapshot ok: {n} neue Events")
    finally:
        db.close()
