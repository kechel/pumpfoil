#!/usr/bin/env python3
"""Uhr-Bezeichnung aus der ersten Aufnahme nachtragen (einmalig, fuer den Bestand).

Beim Pairing kennt der Server das Uhrmodell nicht: Apple und Wear melden dort nichts, und das
Label kommt vom pairenden Client — der schickte bis 11.09.2026 in BEIDEN Apps fest "Garmin".
In den Aufnahmen steht das Modell aber (`sessions.device_model`, seit iOS 1.1.30 auch bei Apple).
Seit 12.09. zieht `api/ingest.py` das Label bei jeder neuen Aufnahme nach; dieses Skript holt
den Bestand einmalig auf denselben Stand.

TROCKENLAUF ist der Standard. Schreiben nur mit --echt.

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" \
        .venv/bin/python ../scripts/geraete-label-nachziehen.py [--echt]
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))

from sqlalchemy import func  # noqa: E402

from app import models  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.naming import ist_gattung, modell_aus_session  # noqa: E402

ECHT = "--echt" in sys.argv


def main() -> int:
    db = SessionLocal()
    # Aelteste Aufnahme je Geraet, die ueberhaupt ein Modell mitgebracht hat.
    unter = (db.query(models.Session.device_id.label("did"),
                      func.min(models.Session.id).label("sid"))
             .filter(models.Session.device_id.isnot(None),
                     models.Session.device_model.isnot(None))
             .group_by(models.Session.device_id).subquery())
    rows = (db.query(models.DeviceToken, models.Session.device_model)
            .join(unter, unter.c.did == models.DeviceToken.id)
            .join(models.Session, models.Session.id == unter.c.sid)
            .order_by(models.DeviceToken.id).all())

    aendern: list[tuple[models.DeviceToken, str]] = []
    for dev, modell_roh in rows:
        if not ist_gattung(dev.label):
            continue          # echter Modellname steht schon drin
        modell = modell_aus_session(modell_roh)
        if not modell or modell == dev.label:
            continue
        aendern.append((dev, modell))

    print(f"{len(rows)} Geraete mit Modell-Angabe in ihren Aufnahmen, "
          f"{len(aendern)} davon tragen noch eine Gattung:\n")
    for dev, modell in aendern:
        print(f"  Token {dev.id:4} (Nutzer {dev.user_id:4}, {dev.platform or '?':7}) "
              f"{dev.label!r:16} -> {modell!r}")

    if not aendern:
        print("\nNichts zu tun.")
    elif ECHT:
        for dev, modell in aendern:
            dev.label = modell[:120]
        db.commit()
        print(f"\n{len(aendern)} Labels geschrieben.")
    else:
        print("\nTROCKENLAUF — nichts geschrieben. Mit --echt ausfuehren.")
    db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
