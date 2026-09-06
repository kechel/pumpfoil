#!/usr/bin/env python3
"""Taeglicher Sync aller verknuepften Konten: Polar, Suunto, COROS.

    cd server && .venv/bin/python ../scripts/verknuepfte-konten-syncen.py
    cd server && .venv/bin/python ../scripts/verknuepfte-konten-syncen.py --trocken
    cd server && .venv/bin/python ../scripts/verknuepfte-konten-syncen.py --mindestabstand 20

SCHREIBT: importiert gefundene Trainings als Sessions (idempotent — ein zweiter Lauf legt
nichts doppelt an). Laeuft ueber `foil-account-sync.timer` einmal taeglich.

WARUM ES DAS GIBT (Jan, 06.09.2026)
Bis hierher gab es KEINEN automatischen Sync. `sync()` haengt in `LinkedAccounts.tsx`
ausschliesslich am Knopf — wer sein Konto verknuepft und danach nie wieder auf die Seite geht,
bekommt seine Trainings nie. Aufgefallen ist es, als bei Peter ein Training an einem inzwischen
behobenen Parser-Fehler gescheitert war: es haette ewig gefehlt, ohne dass jemand etwas merkt.

KOSTET DAS KONTINGENT?
Praktisch nicht. Alle drei Schnittstellen fragen ab dem letzten Sync-Zeitpunkt
(`link.last_sync_at`) — kam seither nichts dazu, ist die Liste leer und es wird keine einzige
Datei geladen. COROS erlaubt 50 FIT-Dateien je Konto und Tag, wir holen hoechstens 25 je Lauf
(`MAX_FITS_JE_SYNC`); bei einem Lauf pro Tag ist das nicht zu erreichen. Wer frisch verknuepft,
holt beim ersten Mal 90 Tage nach — das ist gewollt.

`--mindestabstand N`: Konten ueberspringen, die vor weniger als N Stunden synchronisiert wurden
(Vorgabe 20). So stoert ein zusaetzlicher Lauf von Hand den taeglichen Rhythmus nicht, und ein
Nutzer, der gerade selbst auf den Knopf gedrueckt hat, wird nicht doppelt abgefragt.
"""
import argparse
import os
import pathlib
import re
import sys
import traceback
from datetime import datetime, timedelta, timezone

# (Anzeigename, Modellname, Modul, Funktionsname)
ANBIETER = [
    ("Polar",  "PolarLink",    "app.api.polar",     "sync"),
    ("Suunto", "SuuntoLink",   "app.api.suunto",    "sync"),
    ("COROS",  "CorosMcpLink", "app.api.coros_mcp", "sync"),
]


def env_laden() -> None:
    for zeile in pathlib.Path(".env").read_text().splitlines():
        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", zeile.strip())
        if m:
            os.environ.setdefault(m.group(1), m.group(2).strip().strip('"').strip("'"))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--trocken", action="store_true",
                    help="nur zeigen, wer synchronisiert wuerde")
    ap.add_argument("--mindestabstand", type=int, default=20,
                    help="Stunden seit dem letzten Sync, ab denen erneut geholt wird")
    args = ap.parse_args()

    if not pathlib.Path(".env").exists():
        print("Bitte aus dem Ordner server/ starten.", file=sys.stderr)
        return 2
    env_laden()
    sys.path.insert(0, ".")

    import importlib

    from app import models
    from app.db import SessionLocal

    grenze = datetime.now(timezone.utc) - timedelta(hours=args.mindestabstand)
    gesamt_neu = gesamt_fehler = 0
    for name, modell, modul, funk in ANBIETER:
        Link = getattr(models, modell, None)
        if Link is None:
            print(f"{name}: Modell {modell} gibt es nicht — uebersprungen")
            continue
        db = SessionLocal()
        try:
            links = db.query(Link).all()
        finally:
            db.close()
        faellig = []
        for l in links:
            zeit = l.last_sync_at
            if zeit is not None and zeit.tzinfo is None:
                zeit = zeit.replace(tzinfo=timezone.utc)
            if zeit is None or zeit < grenze:
                faellig.append(l.user_id)
        print(f"{name}: {len(links)} verknuepft, {len(faellig)} faellig -> {faellig}")
        if args.trocken:
            continue
        sync = getattr(importlib.import_module(modul), funk)
        for uid in faellig:
            db = SessionLocal()
            try:
                nutzer = db.get(models.User, uid)
                if nutzer is None:
                    continue
                erg = sync(user=nutzer, db=db)
                neu = int((erg or {}).get("imported") or 0)
                gesamt_neu += neu
                print(f"   {name} user {uid}: {erg}")
            except Exception as exc:  # noqa: BLE001 — ein Konto stoppt die anderen nicht
                gesamt_fehler += 1
                print(f"   {name} user {uid}: FEHLER {type(exc).__name__}: {exc}")
                if os.environ.get("SYNC_TRACEBACK"):
                    traceback.print_exc()
            finally:
                db.close()
    print(f"\nneu importiert: {gesamt_neu} · Konten mit Fehler: {gesamt_fehler}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
