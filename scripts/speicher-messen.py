#!/usr/bin/env python3
"""Misst den Platzbedarf des Projekts und schreibt EINE Zeile je Tag.

    cd server && .venv/bin/python ../scripts/speicher-messen.py [--neu]

Laeuft taeglich per `foil-speicher.timer`. Ohne `--neu` wird ein bereits vorhandener Eintrag des
Tages nicht angefasst — der Zeitgeber darf also mehrfach laufen, ohne zu doppeln.

Gemessen wird, was WIR belegen, nicht die Platte:
  * die Datenbank (`pg_database_size`) samt der groessten Tabellen,
  * `server/data` — GPS-Haeppchen, Accel-Rohdaten, Original-Uploads (FIT/GPX/TCX),
  * `server/media` — Fotos und Avatare.
Die Plattenwerte kommen dazu, weil „2,2 GB" ohne „von 323 GB" keine Aussage ist.

`data/` sind rund 620.000 Dateien; die Summe dauert ~2 s. Genau deshalb steht das hier und nicht
im Request der Admin-Seite.
"""
import argparse
import json
import os
import pathlib
import shutil
import sys
from datetime import date


def verzeichnis(pfad: str) -> tuple[int, int]:
    """(Bytes, Dateien). Fehlende Dateien werden uebersprungen statt den Lauf zu kosten —
    zwischen `walk` und `getsize` kann ein Upload aufgeraeumt worden sein."""
    summe = anzahl = 0
    for wurzel, _, dateien in os.walk(pfad):
        for name in dateien:
            try:
                summe += os.path.getsize(os.path.join(wurzel, name))
                anzahl += 1
            except OSError:
                pass
    return summe, anzahl


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--neu", action="store_true", help="heutigen Eintrag ueberschreiben")
    args = ap.parse_args()

    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten.")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")

    from sqlalchemy import text
    from app.db import SessionLocal, engine
    from app import models

    models.SpeicherStand.__table__.create(bind=engine, checkfirst=True)
    db = SessionLocal()
    heute = date.today()
    vorhanden = db.query(models.SpeicherStand).filter_by(tag=heute).first()
    if vorhanden is not None and not args.neu:
        print(f"{heute}: Eintrag existiert schon (id {vorhanden.id}) — nichts zu tun.")
        return

    db_bytes = int(db.execute(text("select pg_database_size(current_database())")).scalar() or 0)
    tabellen = [[n, int(g)] for n, g in db.execute(text(
        "select relname, pg_total_relation_size(c.oid) from pg_class c "
        "join pg_namespace n on n.oid = c.relnamespace "
        "where n.nspname = 'public' and c.relkind = 'r' "
        "order by 2 desc limit 10"))]
    data_b, data_n = verzeichnis("data")
    media_b, media_n = verzeichnis("media")
    platte = shutil.disk_usage(".")

    zeile = vorhanden or models.SpeicherStand(tag=heute)
    zeile.db_bytes = db_bytes
    zeile.db_tabellen_json = json.dumps(tabellen)
    zeile.data_bytes, zeile.data_dateien = data_b, data_n
    zeile.media_bytes, zeile.media_dateien = media_b, media_n
    zeile.platte_belegt, zeile.platte_gesamt = platte.used, platte.total
    if vorhanden is None:
        db.add(zeile)
    db.commit()

    gb = lambda n: f"{n / 1e9:.2f} GB"  # noqa: E731
    print(f"{heute}: DB {gb(db_bytes)} · data {gb(data_b)} ({data_n} Dateien) · "
          f"media {gb(media_b)} ({media_n}) · Projekt {gb(db_bytes + data_b + media_b)} · "
          f"Platte {gb(platte.used)} von {gb(platte.total)}")


if __name__ == "__main__":
    main()
