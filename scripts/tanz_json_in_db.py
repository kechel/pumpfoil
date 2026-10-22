"""Einmalig: data/<uuid>/tanz.json -> Tabellen tanz_sessions/tanz_abschnitte/tanz_fenster/tanz_orte
(Jan, 22.10.2026: „da kommen viele daten, mit json zu hantieren macht keinen sinn"). Die Dateien bleiben
als Sicherung liegen. Ohne --echt ein Trockenlauf; Sessions, die schon in der DB stehen, werden
uebersprungen (nochmal laufen lassen ist harmlos).

  cd server && DATABASE_URL=... .venv/bin/python ../scripts/tanz_json_in_db.py [--echt]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from app import models, tanz  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402


def main():
    echt = "--echt" in sys.argv
    db = SessionLocal()
    data = Path(get_settings().data_dir)
    n = 0
    for p in sorted(data.glob("*/tanz.json")):
        uuid = p.parent.name
        s = db.query(models.Session).filter_by(session_uuid=uuid).one_or_none()
        if s is None:
            print(f"  {uuid}: keine Session in der DB — uebersprungen")
            continue
        if db.get(models.TanzSession, s.id) is not None:
            print(f"  #{s.id}: steht schon in der DB — uebersprungen")
            continue
        d = json.loads(p.read_text())          # unlesbar = Abbruch, lieber laut als halb
        ab, uhr = d.get("abschnitte") or [], d.get("uhr")
        print(f"  #{s.id} {uuid}: {len(ab)} Zeilen, Uhr {len(uhr or [])}, Fenster {len(d.get('fenster_uhr') or [])}, "
              f"Orte {len(d.get('orte') or [])}, quelle {d.get('quelle')}")
        if echt:
            tanz.speichern(db, s.id, ab, d.get("quelle") or "uhr", d.get("fenster_uhr"), d.get("orte"),
                           uhr=uhr if uhr is not None else (ab if d.get("quelle") == "uhr" else None))
            db.get(models.TanzSession, s.id).notiz = d.get("uhr_rekonstruiert")
            db.commit()
        n += 1
    print(f"\n{n} Session(s) {'uebernommen' if echt else 'zu uebernehmen (Trockenlauf, --echt schreibt)'}.")


if __name__ == "__main__":
    main()
