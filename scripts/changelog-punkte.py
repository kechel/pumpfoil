#!/usr/bin/env python3
"""Neue Punkte in den oeffentlichen Changelog (`changelog_items`) eintragen.

    cd server && .venv/bin/python ../scripts/changelog-punkte.py --datei punkte.json
    cd server && .venv/bin/python ../scripts/changelog-punkte.py --datei punkte.json --echt

SCHREIBT nur mit --echt; ohne das ein Trockenlauf mit Bilanz. Ersetzt die Wegwerf-Skripte, die
dafuer bisher jedes Mal neu entstanden sind (und deren Fehler niemand nachlesen konnte).

Format der JSON-Datei: eine Liste von Objekten.

    [{"tag": "2026-09-11",
      "text": "…",
      "versionen": {"garmin": "1.0.86"},   # optional; leer = gilt ueberall sofort
      "img": null, "img_alt": null,        # optional
      "entwurf": false}]                   # optional; true haelt den Punkt zurueck

`pos` wird NICHT angegeben: das Skript zaehlt je Tag hinter den vorhandenen Punkten weiter, in
der Reihenfolge der Datei. Deutsche Anfuehrungszeichen und Gedankenstriche gehoeren in die
JSON-Datei, nicht in eine Kommandozeile (s. Memory `german-quotes-in-scripts`).
"""
import argparse
import json
import os
import pathlib
import sys
from datetime import date


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--datei", required=True)
    ap.add_argument("--echt", action="store_true", help="wirklich schreiben")
    args = ap.parse_args()

    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")

    from app import models
    from app.db import SessionLocal

    punkte = json.loads(pathlib.Path(args.datei).read_text(encoding="utf-8"))
    if not isinstance(punkte, list) or not punkte:
        sys.exit("Die Datei muss eine nicht-leere Liste enthalten.")

    db = SessionLocal()
    naechste_pos: dict[date, int] = {}
    neu = []
    for p in punkte:
        tag = date.fromisoformat(p["tag"])
        if tag not in naechste_pos:
            vorhanden = (db.query(models.ChangelogItem)
                         .filter(models.ChangelogItem.tag == tag).all())
            naechste_pos[tag] = max((z.pos for z in vorhanden), default=-1) + 1
            print(f"{tag}: {len(vorhanden)} Punkt(e) vorhanden, weiter bei pos {naechste_pos[tag]}")
        # Denselben Text am selben Tag nicht zweimal anlegen — ein zweiter Aufruf derselben
        # Datei soll nichts doppeln (die Punkte stehen oeffentlich).
        schon = (db.query(models.ChangelogItem)
                 .filter(models.ChangelogItem.tag == tag,
                         models.ChangelogItem.text == p["text"]).first())
        if schon is not None:
            print(f"  UEBERSPRUNGEN (steht schon da, id {schon.id}): {p['text'][:60]}")
            continue
        zeile = models.ChangelogItem(
            tag=tag, pos=naechste_pos[tag], text=p["text"],
            img=p.get("img"), img_alt=p.get("img_alt"),
            entwurf=bool(p.get("entwurf", False)),
            versionen=json.dumps(p["versionen"], ensure_ascii=False) if p.get("versionen") else None,
        )
        naechste_pos[tag] += 1
        neu.append(zeile)
        print(f"  pos {zeile.pos}: {p['text'][:70]}")
        if zeile.versionen:
            print(f"        versionen={zeile.versionen}")

    print(f"\n{len(neu)} neue Punkt(e).")
    if not args.echt:
        print("TROCKENLAUF — nichts geschrieben. Mit --echt wirklich eintragen.")
        return
    for z in neu:
        db.add(z)
    db.commit()
    print("Geschrieben.")


if __name__ == "__main__":
    main()
