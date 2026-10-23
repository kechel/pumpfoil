#!/usr/bin/env python3
"""pg-1 aus dem Server-Paket (app/analysis/pumpgleit) ueber den Bestand: „genauer hinschauen" zaehlen und die
Vorschau-Zahlen (Pumps, Gleitphasen, laengste Gleitphase) gegen heute stellen. REIN LESEND.

Aufruf (aus server/): DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/vorschau_bestand.py --jobs 8
Ausgabe: server/data/ml/pumpgleit/vorschau_bestand.jsonl + Bericht auf stdout.
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import multiprocessing as mp
import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G


def eine(sid):
    import logging
    logging.disable(logging.WARNING)
    from app import models
    from app.analysis import pumpgleit as PG
    db = G.db_lesend()
    try:
        s = db.get(models.Session, sid)
        if s is None or not PG.zustaendig(s, s.result):
            return {"id": sid, "zustaendig": False}
        segs = json.loads(s.result.segments_json or "[]")
        n = len((json.loads(s.result.track_geojson or "{}").get("geometry") or {}).get("coordinates") or [])
        e = PG.segmente_ueberlagern(s, segs, n)
        if e is None:
            return {"id": sid, "zustaendig": True, "ergebnis": False}
        return {"id": sid, "zustaendig": True, "ergebnis": True, "user": s.user_id, "sport_class": s.sport_class,
                "hin": e["hinschauen"], "best_neu": e["best_glide_s"], "best_alt": s.result.best_glide_s,
                "p_neu": e["pump_count"], "p_alt": s.result.pump_count,
                "gl_neu": sum(g.get("num_glides") or 0 for g in e["segments"]),
                "gl_alt": sum(len(g.get("glides_vorher") or []) for g in e["segments"])}
    except Exception as ex:  # pragma: no cover
        return {"id": sid, "fehler": repr(ex)[:200]}
    finally:
        db.rollback(); db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--bericht", action="store_true")
    a = ap.parse_args()
    aus = G.AUS / "vorschau_bestand.jsonl"
    if not a.bericht:
        from korpus import ids
        alle = ids()
        with mp.get_context("spawn").Pool(min(a.jobs, 8)) as pool, open(aus, "w") as f:
            for k, r in enumerate(pool.imap_unordered(eine, alle, chunksize=4)):
                f.write(json.dumps(r) + "\n")
                if k % 500 == 0:
                    print(k, flush=True)
    Z = [json.loads(z) for z in aus.read_text().splitlines()]
    ok = [z for z in Z if z.get("ergebnis")]
    hin = [(z, h) for z in ok for h in z["hin"]]
    print(f"Sessions {len(Z)}, zustaendig {sum(1 for z in Z if z.get('zustaendig'))}, mit Ergebnis {len(ok)}, "
          f"Fehler {sum(1 for z in Z if 'fehler' in z)}")
    print(f"„genauer hinschauen\": {len(hin)} Stellen in {len({z['id'] for z, _ in hin})} Sessions "
          f"(pumpfoil {sum(1 for z, _ in hin if (z['sport_class'] or 'pumpfoil') == 'pumpfoil')})")
    print("Beispiele:", [(z["id"], f"u{z['user']}", z["sport_class"], h["dauer_s"]) for z, h in sorted(hin, key=lambda x: -x[1]["dauer_s"])[:10]])
    print(f"Pumps {sum(z['p_alt'] or 0 for z in ok)} -> {sum(z['p_neu'] for z in ok)}, Gleitphasen "
          f"{sum(z['gl_alt'] for z in ok)} -> {sum(z['gl_neu'] for z in ok)}, best_glide Median "
          f"{np.median([z['best_alt'] or 0 for z in ok]):.1f} -> {np.median([z['best_neu'] for z in ok]):.1f}")


if __name__ == "__main__":
    main()
