#!/usr/bin/env python3
"""Merkmale der Sportart-Regel fuer den Bestand nachtragen (metrics_json.sportregel).

Neue Analysen schreiben das Feld selbst (analysis/__init__.py). Dieses Skript fuellt es fuer
bestehende Sessions, OHNE neu zu analysieren: es liest Laeufe + GPS und schreibt nur den einen
Schluessel. Aendert keine Einordnung. Sessions, die schon ein Feld haben, bleiben (ausser --alle).
Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/sport/sportregel-nachtragen.py
"""
import argparse, json, logging, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
logging.disable(logging.WARNING)
from app import models, storage
from app.analysis import sportregel as R
from app.db import SessionLocal

ap = argparse.ArgumentParser(); ap.add_argument("--alle", action="store_true"); a = ap.parse_args()
db = SessionLocal()
ids = [i for (i,) in db.query(models.AnalysisResult.id).order_by(models.AnalysisResult.id)]
n = neu = fehler = 0
for rid in ids:
    r = db.get(models.AnalysisResult, rid)
    try:
        m = json.loads(r.metrics_json or "{}")
        if "sportregel" in m and not a.alle:
            continue
        s = db.get(models.Session, r.session_id)
        if s is None or s.deleted:
            continue
        segs = json.loads(r.segments_json or "[]")
        dauer = (s.ended_at - s.started_at).total_seconds() if s.ended_at and s.started_at else 0
        m["sportregel"] = R.merkmale(segs, storage.load_gps(s.session_uuid), dauer)
        r.metrics_json = json.dumps(m)
        db.commit(); neu += 1
    except Exception as e:  # eine kaputte Session haelt den Lauf nicht an, wird aber gezaehlt
        db.rollback(); fehler += 1
        print("Fehler", rid, repr(e)[:150], flush=True)
    finally:
        db.expunge_all()
    n += 1
    if n % 1000 == 0:
        print(n, "von", len(ids), flush=True)
print(f"fertig: {neu} nachgetragen, {fehler} Fehler, {len(ids)} Analysen")
