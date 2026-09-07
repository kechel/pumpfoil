#!/usr/bin/env python3
"""Uebernimmt die bisher im PWA-Code stehende Changelog-Liste EINMALIG in die Datenbank.

    cd server && .venv/bin/python ../scripts/changelog-uebernehmen.py --datei <entries.json> [--echt]

SCHREIBT (nur mit --echt). Ohne --echt ein Trockenlauf mit Bilanz.

Die Quelle ist das per Node ausgewertete `ENTRIES`-Array aus `web/src/pages/Changelog.tsx`
(ein Regex-Parser waere hier falsch: die Texte enthalten Anfuehrungszeichen, Gedankenstriche
und ein Objekt mit Bild). Reihenfolge bleibt erhalten: `pos` zaehlt innerhalb eines Tages.

Bewusst NICHT gesetzt wird `versionen` — fuer die historischen Punkte laesst sich nicht mehr
sauber sagen, mit welcher App-Version sie herauskamen, und geraten waere schlimmer als leer.
"""
import argparse
import json
import os
import pathlib
import sys
from datetime import datetime


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--datei", required=True)
    ap.add_argument("--echt", action="store_true", help="wirklich schreiben")
    args = ap.parse_args()

    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten.")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")

    from app.db import SessionLocal, engine
    from app import models

    eintraege = json.loads(pathlib.Path(args.datei).read_text())
    models.ChangelogItem.__table__.create(bind=engine, checkfirst=True)
    db = SessionLocal()

    schon = db.query(models.ChangelogItem).count()
    if schon:
        sys.exit(f"ABBRUCH: es stehen schon {schon} Punkte in der Tabelle — dieses Skript ist "
                 f"fuer die EINMALIGE Uebernahme gedacht und wuerde doppeln.")

    zeilen, tage = [], 0
    for e in eintraege:
        tag = datetime.strptime(e["date"], "%B %d, %Y").date()
        tage += 1
        for pos, it in enumerate(e["items"]):
            if isinstance(it, str):
                zeilen.append(models.ChangelogItem(tag=tag, pos=pos, text=it))
            else:
                zeilen.append(models.ChangelogItem(
                    tag=tag, pos=pos, text=it["text"],
                    img=it.get("img"), img_alt=it.get("imgAlt")))

    print(f"{tage} Tage, {len(zeilen)} Punkte, {sum(1 for z in zeilen if z.img)} mit Bild")
    print(f"neuester Tag {max(z.tag for z in zeilen)}, aeltester {min(z.tag for z in zeilen)}")
    if not args.echt:
        print("TROCKENLAUF — nichts geschrieben. Mit --echt wiederholen.")
        return

    db.add_all(zeilen)
    db.commit()
    n = db.query(models.ChangelogItem).count()
    print(f"geschrieben: {n} Zeilen in changelog_items")

    # Gegenprobe: jeder Quelltext muss genau einmal in der DB stehen
    aus_db = [(str(z.tag), z.pos, z.text) for z in
              db.query(models.ChangelogItem).order_by(models.ChangelogItem.id).all()]
    soll = [(str(z.tag), z.pos, z.text) for z in zeilen]
    print("Reihenfolge und Texte identisch:", aus_db == soll)


if __name__ == "__main__":
    main()
