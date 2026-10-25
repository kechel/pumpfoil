#!/usr/bin/env python3
"""Schritt 2 (Jan, 25.10.2026): aussortierte Sessions mit vielen Startversuchen wieder als Pumpfoil? — REIN LESEND.

Nimmt alle Sessions mit is_pumpfoil = False (Sportart pumpfoil oder leer, nicht geloescht) MIT Beschleunigung und zaehlt
die durch einen Anlauf belegten Startversuche (analysis/startversuche.py, Wege A/B/C). Ausgabe: wie viele Sessions
bei einer Schwelle von N Versuchen wieder Pumpfoil wuerden, je Fahrer, mit Beispielen zum Ansehen.

    cd server && DATABASE_URL=... nice .venv/bin/python ../scripts/frontstart/einordnung.py [--limit 0]
"""
import argparse
import logging
import sys
from collections import Counter, defaultdict

import numpy as np

sys.path.insert(0, ".")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=0); a = ap.parse_args()
    logging.disable(logging.WARNING)
    from sqlalchemy import or_
    from app import models, storage
    from app.analysis import analyse_ausschluss
    from app.analysis import startversuche as SV
    from app.analysis.timebase import _accel_chunk_counts, build_timebase
    from app.db import SessionLocal
    db = SessionLocal(); S = models.Session
    erg = []
    try:
        q = (db.query(S).filter(S.is_pumpfoil.is_(False), S.deleted.isnot(True), S.merged_into.is_(None),
                                or_(S.sport_class.is_(None), S.sport_class == "pumpfoil"))
             .order_by(S.id.desc()))
        if a.limit:
            q = q.limit(a.limit)
        for s in q:
            acc = storage.load_accel(s.session_uuid)
            if acc.shape[0] < 2000:
                continue
            g = storage.load_gps(s.session_uuid)
            if len(g) < 30:
                continue
            tb = build_timebase(g, acc, s.accel_scale, s.accel_hz, chunk_counts=_accel_chunk_counts(s.session_uuid),
                                t0_by_index=storage.load_accel_t0(s.session_uuid),
                                accel_luecken=storage.accel_luecken(s.session_uuid),
                                t1_by_index=storage.load_accel_t1(s.session_uuid))
            if not (tb.has_accel and tb.accel_hz and tb.t_accel_ms.size):
                continue
            hz = float(tb.accel_hz)
            grid = np.arange(int(tb.t_accel_ms[-1] / 1000.0 * hz) + 1) / hz * 1000.0
            pick = np.clip(np.searchsorted(tb.t_accel_ms, grid), 0, tb.t_accel_ms.size - 1)
            x = tb.accel[pick].astype(float)
            al = SV.anlaeufe(np.sqrt((x * x).sum(axis=1)), hz)
            ex = analyse_ausschluss(s)
            gv = [p for p in g if not any(a0 <= p[0] <= b0 for a0, b0 in ex)]
            vs = SV.startversuche(gv, al)
            erg.append({"id": s.id, "uid": s.user_id, "n": len(vs), "weg": dict(Counter(e["weg"] for e in vs)),
                        "anl": len(al), "min": round((g[-1][0] - g[0][0]) / 60000),
                        "geraet": (s.device_model or "Garmin").split(" ·")[0], "placement": s.placement})
    finally:
        db.rollback(); db.close()
    print(f"{len(erg)} aussortierte Sessions mit Accel")
    for schwelle in (1, 3, 5, 8):
        w = [r for r in erg if r["n"] >= schwelle]
        o = [r for r in erg if r["n"] - r["weg"].get("C", 0) >= schwelle]
        print(f"  >= {schwelle} Versuche: {len(w)} Sessions von {len({r['uid'] for r in w})} Fahrern"
              f"  | ohne Weg C: {len(o)} Sessions von {len({r['uid'] for r in o})} Fahrern")
    print("ohne C >= 5:", " ".join(f"#{r['id']}(u{r['uid']},{r['n'] - r['weg'].get('C', 0)})"
                                   for r in erg if r["n"] - r["weg"].get("C", 0) >= 5))
    je = defaultdict(list)
    for r in erg:
        if r["n"] >= 3:
            je[r["uid"]].append(r)
    for uid, rs in sorted(je.items(), key=lambda x: -len(x[1])):
        print(f"  u{uid}: {len(rs)} Sessions  " + "  ".join(f"#{r['id']}({r['n']},{r['min']}min,{r['geraet']})" for r in rs[:6]))


if __name__ == "__main__":
    main()
