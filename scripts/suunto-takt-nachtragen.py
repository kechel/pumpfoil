#!/usr/bin/env python3
"""Takt laut Uhr (uhr_takt.json) fuer bestehende Suunto-Sessions aus der gespeicherten FIT-Datei anlegen (16.11.2026).

Neue Datei je Session (data/<uuid>/uhr_takt.json), nichts wird ueberschrieben, keine DB-Aenderung. Nur Sessions, deren
Datei Takt-Werte > 0 enthaelt (SuuntoPlus-Apps, die `cadence` schreiben). Standard: Probelauf.

    cd server && DATABASE_URL="$(sed -n 's/^DATABASE_URL=//p' .env)" .venv/bin/python ../scripts/suunto-takt-nachtragen.py [--echt]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))

from app import models, storage  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.fitimport import parse_fit_bytes  # noqa: E402


def _eine(arg):
    uuid, uid = arg
    d = storage.session_dir(uuid)
    if ((d / "uhr_takt.json").exists() and not NEU) or not (d / "original.bin").exists():
        return None
    try:
        takt = parse_fit_bytes((d / "original.bin").read_bytes()).get("uhr_takt") or []
    except Exception:  # noqa: BLE001
        return None
    if not takt:
        return None
    if ECHT:
        try:
            (d / "uhr_takt.json").write_text(json.dumps(takt))   # nur die neue Datei, kein mkdir von Unterordnern
        except OSError:
            return -uid                                          # Rechte fehlen -> gezaehlt, nicht abgebrochen
    return uid


ECHT = "--echt" in sys.argv
NEU = "--neu" in sys.argv      # vorhandene uhr_takt.json neu schreiben (16.11.: erste Fassung las das falsche Feld)


def main() -> None:
    from multiprocessing import Pool
    db = SessionLocal()
    S = models.Session
    zeilen = db.query(S.session_uuid, S.user_id).filter(S.session_uuid.like("suunto-%"), S.deleted.isnot(True)).all()
    db.close()
    treffer, fehler, nutzer = 0, 0, set()
    with Pool(int(next((a.split("=")[1] for a in sys.argv if a.startswith("--prozesse=")), "3"))) as pool:
        for n, uid in enumerate(pool.imap_unordered(_eine, [tuple(z) for z in zeilen], chunksize=20), 1):
            if uid is not None and uid < 0:
                fehler += 1
            elif uid is not None:
                treffer += 1
                nutzer.add(uid)
            if n % 500 == 0:
                print(f"  {n}/{len(zeilen)} gelesen, mit Takt {treffer}", flush=True)
    print(f"{len(zeilen)} Suunto-Sessions; mit Takt: {treffer} (Nutzer: {len(nutzer)}), ohne Schreibrecht: {fehler}{' — geschrieben' if ECHT else ' — Probelauf'}")
    print("Nutzer:", sorted(nutzer))


if __name__ == "__main__":
    main()
