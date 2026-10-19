#!/usr/bin/env python3
"""Wind am Spot fuer VERGANGENE Wind-Sessions einmalig nachholen (Spot+Tag-Cache, app/sessionwind.py).

Nur Sessions der Wind-Gruppe (Wing/Kite/Parawing) mit Ort — NICHT alle Spots und Tage (Jan,
19.10.2026: „die fuer alle spots jeden tag zu holen ist doch unsinn" … „aber die Windfenster fuer
vergangene sessions koennten wir schon nachholen"). Schreibt nur in den Wind-Cache
(server/data/wind/tage/), nichts in die DB. Bereits gecachte Spot-Tage kosten keinen Abruf.
Gebremst: nach jedem echten Abruf PAUSE_S Pause (Open-Meteo frei: 10 000 Abrufe am Tag).

    cd server && .venv/bin/python ../scripts/wind-nachholen.py [--limit N]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from app import models, sessionwind, sportprofil  # noqa: E402
from app.db import SessionLocal  # noqa: E402

PAUSE_S = 1.0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    wind = [k for k, g in sportprofil.GRUPPE.items() if g == "wind"]
    db = SessionLocal()
    try:
        q = (db.query(models.Session.id, models.Session.place_lat, models.Session.place_lon,
                      models.Session.started_at, models.Session.ended_at)
             .filter(models.Session.sport_class.in_(wind), models.Session.deleted.isnot(True),
                     models.Session.place_lat.isnot(None), models.Session.started_at.isnot(None))
             .order_by(models.Session.started_at.desc()))
        if a.limit:
            q = q.limit(a.limit)
        rows = q.all()
    finally:
        db.close()
    abrufe = [0]
    echt = sessionwind.httpx.get

    def gezaehlt(*args, **kw):
        abrufe[0] += 1
        r = echt(*args, **kw)
        time.sleep(PAUSE_S)
        return r

    sessionwind.httpx.get = gezaehlt
    ok = leer = 0
    for i, (sid, lat, lon, st, en) in enumerate(rows, 1):
        w = sessionwind.session_wind(sid, lat, lon, st, en)
        if w:
            ok += 1
        else:
            leer += 1
        if i % 100 == 0:
            print(f"{i}/{len(rows)}: {ok} mit Wind, {leer} ohne, {abrufe[0]} Abrufe", flush=True)
    print(f"fertig: {len(rows)} Sessions, {ok} mit Wind, {leer} ohne, {abrufe[0]} Abrufe")


if __name__ == "__main__":
    main()
