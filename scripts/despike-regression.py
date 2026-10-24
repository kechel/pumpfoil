#!/usr/bin/env python3
"""Regressions-Vergleich Despike-Kaskade (24.10.2026) — REIN LESEND, nichts in die DB.

Rechnet die Lauferkennung v2 (`analyze_session_v2`, wie run_analysis: Wind-Schwellen, Brett ohne Modell, Fremdkraft
nur bei Pumpfoil) je Session zweimal im Speicher: heute (`clean_speed_series` wie live) und mit korrigierter Regel 3
(`despike_roh=True`, linker Nachbar roh). Vergleicht Laeufe, Foil-Zeit/-Strecke, Hoechsttempo, Gesamtstrecke.
v3-Nachbearbeitung und Presets laufen NICHT mit (die setzen auf v2 auf; der Unterschied entsteht in v2).

    cd server && DATABASE_URL=... DETECTOR_V2=1 OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/despike-regression.py \
        [--n 1500] [--jobs 4] [--sport wingfoil] [--aus data/despike-regression.jsonl]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import functools
import json
import logging
import multiprocessing as mp
import sys

sys.path.insert(0, ".")


def _init():
    logging.disable(logging.WARNING)


def _kenn(res):
    segs = res.get("segments") or []
    return {"laeufe": len(segs), "foil_s": round(float(res.get("foiling_time_s") or 0), 1),
            "foil_m": round(float(res.get("foiling_distance_m") or 0), 1),
            "vmax_kmh": round(float(res.get("max_speed_mps") or 0) * 3.6, 1),
            "gesamt_m": round(float(res.get("total_distance_m") or 0), 1)}


def eine(sid: int) -> dict:
    from app import models, storage
    from app.analysis import gps as G
    from app.analysis.detect_v2 import analyze_session_v2
    from app.db import SessionLocal
    from app.sportprofil import GRUPPE
    db = SessionLocal()
    alt_fn = G.clean_speed_series
    try:
        s = db.get(models.Session, sid)
        gps = storage.load_gps(s.session_uuid)
        if len(gps) < 30:
            return {"id": sid, "status": "zu_kurz"}
        kw = {}
        if (s.placement or "") == "board":
            kw["use_model"] = False
        if GRUPPE.get(s.sport_class or "pumpfoil") == "wind":
            from app.analysis.windlauf import schwellen, v2_parameter
            kw = v2_parameter(schwellen(gps))
        judge = (s.sport_class or "pumpfoil") == "pumpfoil"
        out = {"id": sid, "sport": s.sport_class, "geraet": (s.device_model or "Garmin").split(" ·")[0]}
        for name, fn in (("heute", alt_fn), ("neu", functools.partial(alt_fn, despike_roh=True))):
            G.clean_speed_series = fn
            try:
                out[name] = _kenn(analyze_session_v2(s, judge_fremdkraft=judge, **kw))
            finally:
                G.clean_speed_series = alt_fn
        out["status"] = "gleich" if out["heute"] == out["neu"] else "anders"
        return out
    except Exception as ex:   # rein lesend: eine kaputte Session soll den Lauf nicht beenden
        return {"id": sid, "status": "fehler", "grund": f"{type(ex).__name__}: {str(ex)[:100]}"}
    finally:
        G.clean_speed_series = alt_fn
        db.rollback(); db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=1500)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--sport", default="")
    ap.add_argument("--aus", default="data/despike-regression.jsonl")
    a = ap.parse_args()
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        q = db.query(models.Session.id).filter(models.Session.status == "analyzed", models.Session.deleted.isnot(True),
                                               models.Session.merged_into.is_(None))
        if a.sport:
            q = q.filter(models.Session.sport_class == a.sport)
        ids = [x[0] for x in q.order_by(models.Session.id.desc()).limit(a.n)]
    finally:
        db.rollback(); db.close()
    erg = []
    with mp.get_context("spawn").Pool(min(a.jobs, 6), initializer=_init) as pool:
        for r in pool.imap_unordered(eine, ids, chunksize=4):
            erg.append(r)
    with open(a.aus, "w") as fh:
        for r in erg:
            fh.write(json.dumps(r) + "\n")
    from collections import Counter, defaultdict
    st = Counter(r["status"] for r in erg)
    print(f"{len(erg)} Sessions: {dict(st)}  -> {a.aus}")
    anders = [r for r in erg if r["status"] == "anders"]
    je = defaultdict(lambda: Counter())
    for r in anders:
        h, n = r["heute"], r["neu"]
        je[r["sport"]]["sessions"] += 1
        je[r["sport"]]["laeufe_diff"] += n["laeufe"] - h["laeufe"]
        je[r["sport"]]["foil_s_diff"] += n["foil_s"] - h["foil_s"]
        je[r["sport"]]["vmax_hoeher"] += n["vmax_kmh"] > h["vmax_kmh"] + 0.5
    for sp_, c in sorted(je.items(), key=lambda x: -x[1]["sessions"]):
        print(f"  {sp_}: {dict(c)}")
    anders.sort(key=lambda r: -abs(r["neu"]["foil_s"] - r["heute"]["foil_s"]) - abs(r["neu"]["vmax_kmh"] - r["heute"]["vmax_kmh"]) * 10)
    for r in anders[:25]:
        print(f"  #{r['id']} {r['sport']} {r['geraet']}: heute {r['heute']} | neu {r['neu']}")
    for r in [r for r in erg if r["status"] == "fehler"][:5]:
        print("  FEHLER", r)


if __name__ == "__main__":
    main()
