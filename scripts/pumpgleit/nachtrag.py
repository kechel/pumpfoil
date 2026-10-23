#!/usr/bin/env python3
"""Nachtrag pg-1 (Weg B, Jans Entscheidung 23.10.2026): fuer alle zustaendigen Sessions NUR die pg-Felder schreiben.

Schreibt je Session in EINER kurzen Transaktion (Zeile mit FOR UPDATE gesperrt, damit eine gleichzeitige Analyse
nicht ueberschrieben wird): analysis_results.pg_version/pg_pump_count/pg_avg_cadence_hz/pg_best_glide_s/
pg_best_glide_idx, je Lauf `pg_*` in segments_json, metrics_json.pumpgleit — ueber analysis/pumpgleit.stufe,
dieselbe Funktion wie die Live-Pipeline. Alle bisherigen Felder bleiben unveraendert. Kein run_analysis.
Wiederholbar: Sessions mit derselben pg_version werden uebersprungen (ausser --neu).

`sessions.updated_at` bleibt standardmaessig unberuehrt: das ETag der Detailantwort enthaelt den Anzeige-Schalter
(app/pumpgleit_anzeige.etag_teil), beim Einschalten werden also alle Clients ohnehin frisch. Nur wenn der Schalter
SCHON AN ist und nachgetragen wird, --stempel setzen (dann steigt updated_at je geschriebener Session).

Aufruf (aus server/):
  Sicherung:  DATABASE_URL=... .venv/bin/python ../scripts/pumpgleit/nachtrag.py --sicherung
  Trocken:    DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/nachtrag.py --trocken --jobs 6
  Echt:       DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/nachtrag.py --jobs 6
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import datetime
import json
import multiprocessing as mp
import pathlib
import subprocess
import sys
import time

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
TROCKEN = False
NEU = False
STEMPEL = False


def _init(trocken, neu, stempel):
    global TROCKEN, NEU, STEMPEL
    import logging
    logging.disable(logging.WARNING)
    TROCKEN, NEU, STEMPEL = trocken, neu, stempel


def eine(sid: int) -> dict:
    from app import models
    from app.db import SessionLocal
    from app.analysis import pumpgleit as PG
    db = SessionLocal()
    try:
        r = (db.query(models.AnalysisResult).filter(models.AnalysisResult.session_id == sid)
             .with_for_update().first())
        s = db.get(models.Session, sid)
        if r is None or s is None:
            return {"id": sid, "status": "kein_ergebnis"}
        zust = PG.zustaendig(s, r)
        if not zust and r.pg_version is None:
            return {"id": sid, "status": "nicht_zustaendig"}
        if zust and r.pg_version == PG.VERSION and not NEU:
            return {"id": sid, "status": "schon_da"}
        alt = (r.segments_json, r.pump_count, r.best_glide_s)
        PG.stufe(s, r, rechnen=True)
        # Sicherheitsnetz: die bisherigen Felder muessen gleich bleiben (je Lauf alle Nicht-pg-Schluessel)
        a = json.loads(alt[0] or "[]"); n = json.loads(r.segments_json or "[]")
        gleich = len(a) == len(n) and all({k: v for k, v in x.items() if not k.startswith("pg_")} ==
                                          {k: v for k, v in y.items() if not k.startswith("pg_")} for x, y in zip(a, n))
        if not gleich or (r.pump_count, r.best_glide_s) != alt[1:]:
            db.rollback()
            return {"id": sid, "status": "fehler", "grund": "bisherige Felder veraendert"}
        erg = {"id": sid, "status": "geschrieben" if r.pg_version else "geleert", "pg_pumps": r.pg_pump_count,
               "alt_pumps": r.pump_count, "pg_best": r.pg_best_glide_s, "alt_best": r.best_glide_s}
        if TROCKEN:
            db.rollback()
        else:
            if STEMPEL:
                s.updated_at = datetime.datetime.now(datetime.timezone.utc)
            db.commit()
        return erg
    except Exception as e:  # pragma: no cover
        db.rollback()
        return {"id": sid, "status": "fehler", "grund": repr(e)[:200]}
    finally:
        db.close()


def sicherung() -> pathlib.Path:
    ziel = WURZEL / "server" / "data" / "sicherung" / f"vor-pg1-{datetime.date.today():%Y-%m-%d}.dump"
    ziel.parent.mkdir(parents=True, exist_ok=True)
    from urllib.parse import unquote, urlsplit
    u = urlsplit(os.environ["DATABASE_URL"])
    # Zugangsdaten nur ueber die Umgebung an pg_dump (nie in der Kommandozeile: die ist in `ps` sichtbar)
    env = {**os.environ, "PGHOST": u.hostname or "localhost", "PGPORT": str(u.port or 5432),
           "PGUSER": unquote(u.username or ""), "PGPASSWORD": unquote(u.password or ""),
           "PGDATABASE": u.path.lstrip("/").split("?")[0]}
    subprocess.run(["pg_dump", "-Fc", "-t", "analysis_results", "-f", str(ziel)], check=True, env=env)
    print("Sicherung:", ziel, f"{ziel.stat().st_size / 1e6:.1f} MB")
    return ziel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=6)
    ap.add_argument("--trocken", action="store_true")
    ap.add_argument("--neu", action="store_true", help="auch Sessions mit gleicher pg_version neu rechnen")
    ap.add_argument("--stempel", action="store_true", help="updated_at je geschriebener Session setzen")
    ap.add_argument("--sicherung", action="store_true", help="nur pg_dump der Tabelle analysis_results")
    ap.add_argument("--nur", default="", help="Komma-Liste von Session-IDs")
    a = ap.parse_args()
    if a.sicherung:
        sicherung(); return
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        q = (db.query(models.Session.id).join(models.AnalysisResult, models.AnalysisResult.session_id == models.Session.id)
             .filter(models.Session.deleted.isnot(True), models.Session.merged_into.is_(None)).order_by(models.Session.id))
        ids = [int(x) for x in a.nur.split(",") if x] or [x[0] for x in q.all()]
    finally:
        db.rollback(); db.close()
    print(f"{len(ids)} Sessions, {'TROCKEN' if a.trocken else 'ECHT'}, jobs {min(a.jobs, 6)}", flush=True)
    zaehl, t0, fehler = {}, time.time(), []
    with mp.get_context("spawn").Pool(min(a.jobs, 6), initializer=_init, initargs=(a.trocken, a.neu, a.stempel)) as pool:
        for k, r in enumerate(pool.imap_unordered(eine, ids, chunksize=4), 1):
            zaehl[r["status"]] = zaehl.get(r["status"], 0) + 1
            if r["status"] == "fehler":
                fehler.append(r)
            if k % 250 == 0 or k == len(ids):
                print(f"{k}/{len(ids)} {time.time() - t0:.0f} s {zaehl}", flush=True)
    for r in fehler[:20]:
        print("FEHLER", r, flush=True)
    print("fertig:", zaehl)


if __name__ == "__main__":
    main()
