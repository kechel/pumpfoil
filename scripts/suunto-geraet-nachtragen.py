#!/usr/bin/env python3
"""Geraetenamen bestehender Suunto-Importe aus der gespeicherten FIT-Datei nachtragen (16.11.2026).

Bis dahin las der Import `file_id.product_name` nicht -> `sessions.device_model` blieb leer, die Session zeigte keine Uhr.
Liest data/<uuid>/original.bin, schreibt NUR leere device_model-Felder. Standard: Probelauf (zaehlt nur).

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" .venv/bin/python ../scripts/suunto-geraet-nachtragen.py [--echt]
"""
from __future__ import annotations

import collections
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))

import fitparse  # noqa: E402

from app import models  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.db import SessionLocal  # noqa: E402


def name_aus(pfad: Path) -> str | None:
    try:
        for m in fitparse.FitFile(str(pfad)).get_messages("file_id"):
            pn = m.get_value("product_name")
            return pn.strip()[:60] if isinstance(pn, str) and pn.strip() else None
    except Exception:  # noqa: BLE001
        return None
    return None


def main() -> None:
    echt = "--echt" in sys.argv
    daten = get_settings().data_dir
    db = SessionLocal()
    S = models.Session
    ids = [i for (i,) in db.query(S.id).filter(S.session_uuid.like("suunto-%"), S.device_model.is_(None),
                                                S.deleted.isnot(True)).order_by(S.id).all()]
    namen: collections.Counter = collections.Counter()
    gesetzt = 0
    for n, sid in enumerate(ids, 1):
        s = db.get(S, sid)
        name = name_aus(daten / s.session_uuid / "original.bin")
        namen[name or "—"] += 1
        if name and echt:
            s.device_model = name
            gesetzt += 1
        if echt and n % 200 == 0:
            db.commit()                     # blockweise (Memory backfill-blockweise-committen)
    if echt:
        db.commit()
    print(f"{len(ids)} Sessions ohne Geraet; {'gesetzt' if echt else 'wuerde setzen'}: "
          f"{gesetzt if echt else sum(v for k, v in namen.items() if k != '—')}")
    for k, v in namen.most_common():
        print(f"  {v:6d}  {k}")


if __name__ == "__main__":
    main()
