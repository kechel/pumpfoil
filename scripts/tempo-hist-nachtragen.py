#!/usr/bin/env python3
"""Tempo-Verteilung (analysis_results.tempo_hist_json, analysis/tempo_hist.py) fuer den Bestand nachtragen.

Ein reiner Cache: run_analysis setzt ihn zurueck, die Abrufe rechnen Fehlendes selbst nach (hoechstens 300 je Aufruf).
Dieses Skript fuellt den Bestand vorab, damit der erste Abruf der Foil-Kurve nicht unvollstaendig ist. Ohne --echt nur
zaehlen. Blockweise (je 200 Zeilen ein Commit, kurze Pause), damit Prod unter der CPU-Grenze bleibt und kein Neustart
blockiert. Wiederholbar: rechnet nur, was fehlt oder eine alte Fassung hat.

    cd server && .venv/bin/python ../scripts/tempo-hist-nachtragen.py
    cd server && .venv/bin/python ../scripts/tempo-hist-nachtragen.py --echt
"""
import argparse
import os
import pathlib
import sys
import time

BLOCK = 200


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--echt", action="store_true")
    ap.add_argument("--pause", type=float, default=0.5, help="Sekunden Pause je Block")
    args = ap.parse_args()
    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten (server/.env wird gelesen).")
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")
    from app import models
    from app.analysis import tempo_hist as TH
    from app.db import SessionLocal

    db = SessionLocal()
    AR = models.AnalysisResult
    ids = [i for (i, js) in db.query(AR.id, AR.tempo_hist_json).order_by(AR.id).all() if TH.lies(js) is None]
    print(f"{len(ids)} Analysen ohne Tempo-Verteilung", flush=True)
    if not args.echt:
        print("TROCKENLAUF, mit --echt schreiben")
        return
    t0 = time.time()
    for n in range(0, len(ids), BLOCK):
        TH.fuellen(db, ids[n:n + BLOCK], grenze=BLOCK)   # committet selbst
        print(f"  {min(n + BLOCK, len(ids))}/{len(ids)} ({time.time() - t0:.0f} s)", flush=True)
        time.sleep(args.pause)


if __name__ == "__main__":
    main()
