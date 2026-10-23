#!/usr/bin/env python3
"""Erkennung v3: Haltungs-Merkmale (analysis/v3/haltung.py) je Datensatz-Session. REIN LESEND.

Referenz = sichere Sekunden von r3 aus dem Zwischenspeicher data/ml/v3/p_r3/ — das sind Teilmodelle,
die den Fahrer NIE gesehen haben (Werkbank), also kein Durchsickern der Labels in die Merkmale.
Schreibt data/ml/v3/ds_h/<id>.npz (t, H) passend zu ds/<id>.npz.

Aufruf (aus server/): DATABASE_URL=... nice -n 15 .venv/bin/python ../scripts/v3/datensatz_haltung.py [--jobs 12]

Neubau r7 (23.10.2026), nur ueber Schalter: --ds DIR --p-ref DIR --aus DIR --baseline B [--p-ref-rechnen]
  --p-ref-rechnen  fehlt p_r3 einer Session, wird es hier gerechnet (Teilmodell r3 OHNE diesen Fahrer,
                   wie die Werkbank; Fahrer, die r3 nie sah, bekommen das Gesamtmodell) und unter --p-ref
                   abgelegt. Dafuer V3_MODELL=r3 setzen (stufe_a liest danach seine Pfade).
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
CFG = {"ds": ML / "v3" / "ds", "p_ref": ML / "v3" / "p_r3", "aus": AUS, "rechnen": False}


def _init(cfg):
    CFG.update(cfg)


def eine(s):
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import haltung, merkmale as M
    sid = s["id"]
    ds, pf = pathlib.Path(CFG["ds"]) / f"{sid}.npz", pathlib.Path(CFG["p_ref"]) / f"{sid}.npz"
    if not ds.exists() or (not pf.exists() and not CFG["rechnen"]):
        return None
    try:
        tb = build_timebase_for_session(M.ganze_aufnahme(s))
    except Exception:
        return None
    if not pf.exists():
        from app.analysis.v3 import stufe_a
        p = stufe_a.wahrscheinlichkeit(tb, fahrer=s["user_id"])
        if p is None:
            return None
        v = np.nan_to_num(np.array([g[3] if len(g) > 3 and g[3] is not None else np.nan for g in tb.gps], float))
        pf.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(pf, t=tb.t_gps_ms.astype(float), v=v.astype(np.float32), p=p.astype(np.float32))
    d, pr = np.load(ds), np.load(pf)
    t = d["t"]
    p_ref = np.interp(t, pr["t"], pr["p"])
    v = d["X"][:, 0]
    H = haltung.merkmale(tb, t, v, p_ref)
    np.savez_compressed(pathlib.Path(CFG["aus"]) / f"{sid}.npz", t=t, H=H.astype(np.float32))
    return sid, bool(np.isfinite(H[:, 0]).any())


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--jobs", type=int, default=12)
    ap.add_argument("--ds", default=str(CFG["ds"])); ap.add_argument("--p-ref", dest="p_ref", default=str(CFG["p_ref"]))
    ap.add_argument("--aus", default=str(AUS)); ap.add_argument("--baseline", default="")
    ap.add_argument("--p-ref-rechnen", dest="rechnen", action="store_true")
    a = ap.parse_args()
    cfg = {"ds": a.ds, "p_ref": a.p_ref, "aus": a.aus, "rechnen": a.rechnen}
    CFG.update(cfg)
    pathlib.Path(a.aus).mkdir(parents=True, exist_ok=True)
    b = json.load(gzip.open(a.baseline or sorted(ML.glob("baseline-*.json.gz"))[-1]))
    wahl = [s for s in b if (pathlib.Path(a.ds) / f"{s['id']}.npz").exists()]
    with Pool(a.jobs, initializer=_init, initargs=(cfg,)) as pool:
        res = [r for r in pool.imap_unordered(eine, wahl, chunksize=4) if r]
    print("Sessions:", len(res), "mit Referenz:", sum(1 for r in res if r[1]))


if __name__ == "__main__":
    main()
