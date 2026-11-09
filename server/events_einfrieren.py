#!/usr/bin/env python3
"""Faellige Team-Events einfrieren (systemd-Timer foil-events-einfrieren.timer, alle 5 min).

Jan, 09.11.2026: „passiert das einfrieren nicht besser per cronjob oder so automatisch?" — bis dahin fror der erste
Abruf nach `ende + EINFRIEREN_NACH` ein (oder nachts 03:15 record_snapshot.py). Eine Session, die zwischen der Frist
und dem ersten Abruf hochgeladen, geloescht oder neu analysiert wurde, haette den Endstand noch verschoben. Jetzt steht
der Endstand spaetestens 5 min nach der Frist fest; die Abruf-Pfade frieren weiterhin zusaetzlich ein.

    cd server && .venv/bin/python events_einfrieren.py
"""
import os
import re

for _l in open(os.path.join(os.path.dirname(__file__), ".env")):
    _m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)", _l)
    if _m:
        os.environ.setdefault(_m.group(1), _m.group(2).strip().strip('"').strip("'"))

from app.db import SessionLocal  # noqa: E402
from app.teams import events_einfrieren  # noqa: E402

if __name__ == "__main__":
    db = SessionLocal()
    try:
        n = events_einfrieren(db)
        if n:
            print(f"{n} Event(s) eingefroren")
    finally:
        db.close()
