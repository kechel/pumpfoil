#!/usr/bin/env python3
"""Accel-Einheit je QUELLE aus allen Sessions bestimmen (13.11.2026, app/analysis/skala.py). REIN LESEND gegen DB/Rohdaten.

Je Session schaetzt `skala.schaetzen()` die Einheit (nur wenn Median des Betrags UND Schwerkraft-Vektor uebereinstimmen),
je Quelle (Weg|Plattform|Modell) entscheidet die Mehrheit. Eine Quelle kommt in die Tabelle, wenn mindestens MIN_N
Sessions eine Schaetzung haben und ANTEIL davon dieselbe Einheit sagen; sonst bleibt sie draussen (dann schaetzt jede
Session selbst). Schreibt server/app/data/einheiten.json (im Repo) (neu, ersetzt die alte Datei) und zeigt die Uneinigen.

Aufruf (aus server/): DATABASE_URL=... nice -n 10 .venv/bin/python ../scripts/einheiten-bestimmen.py [--jobs 10] [--trocken]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import collections
import json
import pathlib
import sys
from datetime import datetime, timezone
from multiprocessing import Pool

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "server"))

MIN_N, ANTEIL = 3, 0.9
MIN_WERTE_TABELLE = 3000   # kurze Sessions (1-3 min, 10 Hz) mit wilder Bewegung schaetzen daneben (B2691, 13.11.)


def eine(z):
    uuid, hz, gemeldet, q = z
    from app import storage
    from app.analysis import skala
    try:
        a = storage.load_accel(uuid)
        return q, gemeldet, skala.schaetzen(a, hz) if len(a) >= MIN_WERTE_TABELLE else "kurz"
    except Exception:  # noqa: BLE001
        return q, gemeldet, "fehler"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=10)
    ap.add_argument("--trocken", action="store_true")
    a = ap.parse_args()
    from sqlalchemy import text
    from app.db import SessionLocal, engine
    from app.analysis import skala
    db = SessionLocal()
    rows = db.execute(text(
        "select s.session_uuid, s.accel_hz, s.accel_scale, d.platform, coalesce(d.part_number, s.device_model) "
        "from sessions s left join device_tokens d on d.id = s.device_id "
        "where coalesce(s.accel_hz,0) > 0 and not coalesce(s.deleted,false)")).all()
    db.close(); engine.dispose()
    # merge/split: ueber ihre Teile (skala.quelle fragt die DB) — sonst wie die Spalten sagen
    arbeit = [(u, hz, sc, skala.quelle(u) if u.startswith(("merge-", "split-")) else skala.quelle_aus(u, p, m))
              for u, hz, sc, p, m in rows]
    print(len(arbeit), "Sessions mit Accel", flush=True)
    je = collections.defaultdict(collections.Counter)
    gem = collections.defaultdict(collections.Counter)
    with Pool(a.jobs) as pool:
        for q, g, e in pool.imap_unordered(eine, arbeit, chunksize=8):
            weg, plattform, _ = q.split("|", 2)
            # Rueckfall-Ebenen: Weg+Plattform und Weg allein (z. B. „alle Garmin-Connect-Dateien"), s. skala.eintrag()
            for k in (q, f"{weg}|{plattform}|*", f"{weg}|*|*"):
                je[k][e] += 1; gem[k][g] += 1
    tab, offen = {}, []
    for q, c in sorted(je.items(), key=lambda x: -sum(x[1].values())):
        sch = {k: v for k, v in c.items() if isinstance(k, float)}
        n = sum(sch.values())
        if n >= MIN_N:
            e, k = max(sch.items(), key=lambda x: x[1])
            if k / n >= ANTEIL:
                tab[q] = {"einheit": e, "n": n, "einig": round(k / n, 3), "gemeldet": dict(gem[q]),
                          "ohne_schaetzung": sum(v for kk, v in c.items() if not isinstance(kk, float))}
                continue
        offen.append((q, dict(c)))
    for q, v in tab.items():
        print(f"  {q:45s} -> {v['einheit']:6.0f}  n={v['n']:5d} einig {v['einig']:.1%} gemeldet {v['gemeldet']}")
    print("Ohne Tabelleneintrag (zu wenig / uneinig):", len(offen))
    for q, c in offen[:40]:
        print("   ", q, c)
    if not a.trocken:
        skala.TABELLE.parent.mkdir(parents=True, exist_ok=True)
        tmp = skala.TABELLE.with_suffix(".json.neu")
        tmp.write_text(json.dumps({"version": skala.VERSION, "stand": datetime.now(timezone.utc).isoformat(),
                                   "regel": f"Mehrheit >= {ANTEIL:.0%} bei >= {MIN_N} geschaetzten Sessions",
                                   "quellen": tab}, indent=1, sort_keys=True))
        tmp.replace(skala.TABELLE)
        print("geschrieben:", skala.TABELLE)


if __name__ == "__main__":
    main()
