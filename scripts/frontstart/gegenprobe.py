#!/usr/bin/env python3
"""Gegenprobe Anlauf-Prototyp an einem Fahrer mit gut erkannten Laeufen (25.10.2026) — REIN LESEND.

Jan: „alle starts sind irgendwie ruhe-schnell-ruhe oder ruhe-schnell-gps-abriss". Je Session: wie viele erkannte
Laeufe haben einen Anlauf am Start (Trefferquote), und was liegt an Anlaeufen OHNE Lauf (Fehlversuch? anderes?),
mit der GPS-Spitze 0-6 s danach.

    cd server && DATABASE_URL=... .venv/bin/python ../scripts/frontstart/gegenprobe.py --uid 2 [--n 40]
"""
import os
import argparse
import json
import logging
import sys

import numpy as np

sys.path.insert(0, ".")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--uid", type=int, required=True); ap.add_argument("--n", type=int, default=40)
    ap.add_argument("--placement", default="wrist")
    a = ap.parse_args()
    logging.disable(logging.WARNING)
    from anlauf import anlaeufe
    from app import models, storage
    from app.analysis.foil_model import magnitude_g
    from app.db import SessionLocal
    db = SessionLocal(); S = models.Session
    tot = dict(laeufe=0, mit=0, anl=0, an_lauf=0); ohne_v = []
    try:
        q = db.query(S).filter(S.user_id == a.uid, S.sport_class == "pumpfoil", S.status == "analyzed",
                               S.deleted.isnot(True), S.merged_into.is_(None))
        q = q.filter(S.placement.is_(None)) if a.placement == "wrist" else q.filter(S.placement == a.placement)
        for s in q.order_by(S.id.desc()).limit(a.n):
            acc = storage.load_accel(s.session_uuid); t0 = storage.load_accel_t0(s.session_uuid)
            if len(acc) < 2000 or not t0:
                continue
            hz = len(acc) / (max(t0.values()) / 1000.0)
            al = anlaeufe(magnitude_g(acc, s.accel_scale), hz)
            r = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
            segs = json.loads(r.segments_json or "[]") if r else []
            trim = (s.trim_start_ms or 0) / 1000.0
            st = np.array([g["t_start_ms"] / 1000.0 + trim for g in segs if g.get("t_start_ms") is not None])
            g = np.array(storage.load_gps(s.session_uuid), float)
            tg, v = g[:, 0] / 1000, g[:, 3] * 3.6
            mit = sum(1 for x in st if any(-3 < x - b < 8 for _, b, *_ in al))
            an_lauf = 0
            for aa, b, *_ in al:
                if st.size and np.any((st - b > -3) & (st - b < 8)):
                    an_lauf += 1
                else:
                    m = (tg >= aa - 1) & (tg <= b + 6) & (v < 40)
                    ohne_v.append(float(v[m].max()) if m.any() else -1.0)
            tot["laeufe"] += len(st); tot["mit"] += mit; tot["anl"] += len(al); tot["an_lauf"] += an_lauf
            print(f"  #{s.id} {(s.device_model or 'Garmin').split(' ·')[0]:10} {hz:4.0f} Hz  Laeufe {len(st):3}  mit Anlauf "
                  f"{mit:3}  Anlaeufe {len(al):3}  davon an Lauf {an_lauf:3}")
    finally:
        db.rollback(); db.close()
    print(tot)
    ov = np.array(ohne_v)
    if ov.size:
        print(f"Anlaeufe ohne Lauf: {ov.size}; GPS-Spitze danach: keine GPS {np.mean(ov < 0) * 100:.0f} %, "
              f"<6 km/h {np.mean((ov >= 0) & (ov < 6)) * 100:.0f} %, 6-8 {np.mean((ov >= 6) & (ov < 8)) * 100:.0f} %, "
              f">=8 {np.mean(ov >= 8) * 100:.0f} %")


if __name__ == "__main__":
    main()
