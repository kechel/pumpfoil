#!/usr/bin/env python3
"""Erkennung v3: Haltungs-Merkmale (analysis/v3/haltung.py) je Datensatz-Session. REIN LESEND.

Referenz = sichere Sekunden von r3 aus dem Zwischenspeicher data/ml/v3/p_r3/ — das sind Teilmodelle,
die den Fahrer NIE gesehen haben (Werkbank), also kein Durchsickern der Labels in die Merkmale.
Schreibt data/ml/v3/ds_h/<id>.npz (t, H) passend zu ds/<id>.npz.

Aufruf (aus server/): DATABASE_URL=... nice -n 15 .venv/bin/python ../scripts/v3/datensatz_haltung.py [--jobs 12]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import gzip
import json
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"
AUS = ML / "v3" / "ds_h"


def eine(s):
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import haltung, merkmale as M
    sid = s["id"]
    ds, pf = ML / "v3" / "ds" / f"{sid}.npz", ML / "v3" / "p_r3" / f"{sid}.npz"
    if not ds.exists() or not pf.exists():
        return None
    d, pr = np.load(ds), np.load(pf)
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
    except Exception:
        return None
    t = d["t"]
    p_ref = np.interp(t, pr["t"], pr["p"])
    v = d["X"][:, 0]
    H = haltung.merkmale(tb, t, v, p_ref)
    np.savez_compressed(AUS / f"{sid}.npz", t=t, H=H.astype(np.float32))
    return sid, bool(np.isfinite(H[:, 0]).any())


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--jobs", type=int, default=12)
    a = ap.parse_args()
    AUS.mkdir(parents=True, exist_ok=True)
    b = json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))
    wahl = [s for s in b if (ML / "v3" / "ds" / f"{s['id']}.npz").exists()]
    with Pool(a.jobs) as pool:
        res = [r for r in pool.imap_unordered(eine, wahl, chunksize=4) if r]
    print("Sessions:", len(res), "mit Referenz:", sum(1 for r in res if r[1]))


if __name__ == "__main__":
    main()
