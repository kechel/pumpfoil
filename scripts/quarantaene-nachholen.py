#!/usr/bin/env python3
"""Nicht lesbare Import-Dateien erneut einlesen — Trockenlauf per Vorgabe.

    cd server && .venv/bin/python ../scripts/quarantaene-nachholen.py
    cd server && .venv/bin/python ../scripts/quarantaene-nachholen.py --schreiben

WOZU
Scheitert `parse_fit_bytes` an einer Datei, legt der Import sie seit dem 06.09.2026 unter
`server/data/_nicht-lesbar/` ab (`storage.quarantaene_ablegen`) statt sie wegzuwerfen. Vorher
war sie verloren: die Originaldatei wird erst NACH erfolgreichem Parsen gesichert, und ein
Anbieter ist nicht immer erreichbar — als Peters COROS-Training scheiterte, antwortete COROS
stundenlang mit 504, die Datei war also nirgends mehr zu holen.

Dieses Skript nimmt jede abgelegte Datei, laesst den HEUTIGEN Parser darauf los und sagt,
welche davon inzwischen lesbar sind. Mit `--schreiben` importiert es die lesbaren fuer den
Nutzer, dem sie gehoeren (steht im Beipackzettel `<hash>.json`), und raeumt sie weg.

Nach jeder Verbesserung am FIT-Import einmal laufen lassen — erst ohne, dann mit `--schreiben`.

WAS ES NICHT TUT
- Nichts loeschen ohne `--schreiben`. Ohne die Vorgabe wird ausschliesslich gelesen.
- Keine Datei doppelt importieren: `import_parsed_session` erkennt Doppel ueber den
  Inhalts-Hash bzw. die Startzeit und gibt die vorhandene Session zurueck.
- Dateien, die weiterhin nicht lesbar sind, bleiben unangetastet liegen.
"""
import argparse
import json
import os
import pathlib
import re
import sys


def env_laden() -> None:
    """`.env` von Hand lesen — `set -a; . ./.env` exportiert DATABASE_URL nicht zuverlaessig,
    und ohne sie bricht der Import von app.config sofort ab (s. CLAUDE.md)."""
    for zeile in pathlib.Path(".env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schreiben", action="store_true",
                    help="lesbare Dateien wirklich importieren und aus der Ablage nehmen")
    args = ap.parse_args()

    if not pathlib.Path(".env").exists():
        print("Bitte aus dem Ordner server/ starten.", file=sys.stderr)
        return 2
    env_laden()
    sys.path.insert(0, ".")

    from app import models, storage
    from app.db import SessionLocal
    from app.fitimport import parse_fit_bytes

    ordner = storage.settings.data_dir / storage.QUARANTAENE
    dateien = sorted(ordner.glob("*.bin")) if ordner.exists() else []
    if not dateien:
        print(f"{ordner}: nichts abgelegt — nichts zu tun.")
        return 0

    print(f"{len(dateien)} abgelegte Datei(en) in {ordner}\n")
    db = SessionLocal()
    lesbar = weiterhin_kaputt = importiert = 0
    try:
        for pfad in dateien:
            zettel = pfad.with_suffix(".json")
            info = json.loads(zettel.read_text()) if zettel.exists() else {}
            uid = info.get("user_id")
            quelle = info.get("quelle") or "?"
            roh = pfad.read_bytes()
            try:
                parsed = parse_fit_bytes(roh)
            except Exception as exc:  # noqa: BLE001
                weiterhin_kaputt += 1
                print(f"  weiterhin nicht lesbar  {pfad.name}  ({quelle}, user {uid})")
                print(f"      frueher: {info.get('grund')}")
                print(f"      heute:   {type(exc).__name__}: {exc}")
                continue

            punkte = len(parsed.get("gps_samples") or [])
            lesbar += 1
            print(f"  LESBAR                  {pfad.name}  ({quelle}, user {uid})  "
                  f"{punkte} Punkte, sport={parsed.get('sport')}"
                  + (f", nur teilweise: {parsed['abbruch']}" if parsed.get("abbruch") else ""))
            if not args.schreiben:
                continue

            nutzer = db.get(models.User, uid) if uid else None
            if nutzer is None:
                print("      -> uebersprungen: Nutzer unbekannt, Zuordnung waere geraten")
                continue
            if not punkte or parsed.get("started_at") is None:
                print("      -> uebersprungen: keine GPS-Punkte (z. B. Indoor)")
                continue
            from app.api.sessions import import_parsed_session
            s = import_parsed_session(db, nutzer, roh, parsed,
                                      src_label=f"{quelle}-import",
                                      uuid_prefix=f"{quelle.split('-')[0]}-",
                                      filename=info.get("filename"))
            if s is None:
                print("      -> nicht angelegt (war bewusst geloescht)")
            else:
                print(f"      -> Session {s.id}")
                importiert += 1
            pfad.unlink(missing_ok=True)
            zettel.unlink(missing_ok=True)
    finally:
        db.close()

    print(f"\nlesbar: {lesbar} · weiterhin nicht lesbar: {weiterhin_kaputt}"
          + (f" · importiert: {importiert}" if args.schreiben else ""))
    if lesbar and not args.schreiben:
        print("Zum Uebernehmen erneut mit --schreiben starten.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
