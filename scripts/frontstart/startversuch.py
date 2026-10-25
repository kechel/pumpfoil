#!/usr/bin/env python3
"""Startversuche „Ruhe -> schnell -> Ruhe/GPS-Abriss" aus GPS + Beschleunigung (Prototyp, 25.10.2026) — REIN LESEND.

Jan: „alle starts sind irgendwie ruhe-schnell-ruhe oder ruhe-schnell-gps-abriss". Zwei Wege zu einem Versuch:
  A  GPS-Sprint: ein Rohpunkt >= SPRINT_KMH, davor RUHE_S lang langsam (Median < RUHE_KMH); bestaetigt durch einen
     Anlauf in der Beschleunigung (anlauf.py) kurz davor ODER >= 2 Punkte ueber SPRINT_KMH (gegen Einzel-Ausreisser).
  C  Anlauf + GPS-Spitze nur >= ANLAUF_KMH (6), sonst wie A — der Anlauf ersetzt die fehlenden km/h (Front-Start: kurz
     anschieben, aufknien, die 1-Hz-Spur sieht davon oft nur 6-8 km/h).
  B  Anlauf + GPS-Abriss: Anlauf, danach >= ABRISS_S keine GPS-Punkte, und der Anlauf liegt am Steg (<= STEG_M vom
     Median der A-Versuche; braucht mind. STEG_MIN A-Versuche in der Session).
Versuche, aus denen ein erkannter Lauf wurde (Lauf-Start in -3..+8 s), zaehlen als gelungen.

    cd server && DATABASE_URL=... .venv/bin/python ../scripts/frontstart/startversuch.py 12734 3419
    cd server && DATABASE_URL=... .venv/bin/python ../scripts/frontstart/startversuch.py --uid 2 --n 40
"""
import argparse
import json
import logging
import os
import sys

import numpy as np

sys.path.insert(0, ".")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from anlauf import anlaeufe  # noqa: E402

SPRINT_KMH = 8.0
ANLAUF_KMH = 6.0
MAX_KMH = 40.0
RUHE_KMH = 4.0
RUHE_S = (2.0, 8.0)     # Fenster vor dem Sprint-Punkt
MERGE_S = 6.0
ANLAUF_VOR_S = (-8.0, 2.0)
ABRISS_S = 5.0
STEG_M = 15.0
STEG_MIN = 3


def startversuche(gps: np.ndarray, mag: np.ndarray, hz: float) -> list[dict]:
    """gps: (N, >=4) [t_ms, lat, lon, v_mps]; mag: Betrag je Sample (beliebige Einheit), hz: Accel-Rate."""
    t = gps[:, 0] / 1000.0
    v = gps[:, 3] * 3.6
    lat0, lon0 = float(np.median(gps[:, 1])), float(np.median(gps[:, 2]))
    x = (gps[:, 2] - lon0) * 111320.0 * np.cos(np.radians(lat0))
    y = (gps[:, 1] - lat0) * 111320.0
    al = anlaeufe(mag, hz) if mag is not None and mag.size else []
    ab = np.array([b for _, b, *_ in al]) if al else np.empty(0)
    out = []
    for i in np.where((v >= ANLAUF_KMH) & (v < MAX_KMH))[0]:
        if out and t[i] - out[-1]["t_letzt"] <= MERGE_S:
            out[-1]["t_letzt"] = t[i]; out[-1]["punkte"] += v[i] >= SPRINT_KMH; out[-1]["vmax"] = max(out[-1]["vmax"], v[i])
            continue
        m = (t >= t[i] - RUHE_S[1]) & (t <= t[i] - RUHE_S[0])
        if m.sum() and float(np.median(v[m])) >= RUHE_KMH:
            continue     # kein Start aus der Ruhe (Lauf geht weiter / Wiederanfahrt im Lauf)
        k0 = int(np.searchsorted(t, t[i] - RUHE_S[0])) - 1
        k0 = max(k0, 0)
        out.append({"t": float(t[i]), "t_letzt": float(t[i]), "punkte": int(v[i] >= SPRINT_KMH), "vmax": float(v[i]), "weg": "A",
                    "x": float(x[k0]), "y": float(y[k0]),
                    "anlauf": bool(ab.size and np.any((ab - t[i] > ANLAUF_VOR_S[0]) & (ab - t[i] < ANLAUF_VOR_S[1])))})
    for e in out:
        e["weg"] = "A" if e["punkte"] >= 1 else "C"
    a_ok = [e for e in out if (e["punkte"] >= 1 and e["anlauf"]) or e["punkte"] >= 2 or (e["punkte"] == 0 and e["anlauf"])]
    # B: Anlauf + Abriss am Steg
    if len(a_ok) >= STEG_MIN:
        cx, cy = np.median([e["x"] for e in a_ok]), np.median([e["y"] for e in a_ok])
        for a, b, *_ in al:
            if any(abs(e["t"] - b) < 10 for e in out):
                continue
            nach = t[t > b - 1]
            if nach.size and nach[0] - (b - 1) < ABRISS_S:
                continue
            vor = np.where((t <= a) & (t >= a - 30))[0]
            if not vor.size:
                continue
            k = vor[-1]
            if np.hypot(x[k] - cx, y[k] - cy) <= STEG_M:
                a_ok.append({"t": float(b), "t_letzt": float(b), "punkte": 0, "vmax": float("nan"), "weg": "B",
                             "x": float(x[k]), "y": float(y[k]), "anlauf": True})
    return sorted(a_ok, key=lambda e: e["t"])


def _laden(db, s):
    from app import models, storage
    from app.analysis.foil_model import magnitude_g
    g = np.array(storage.load_gps(s.session_uuid), float)
    acc = storage.load_accel(s.session_uuid); t0 = storage.load_accel_t0(s.session_uuid)
    mag, hz = None, 0.0
    if len(acc) > 2000 and t0:
        hz = len(acc) / (max(t0.values()) / 1000.0); mag = magnitude_g(acc, s.accel_scale)
    r = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
    segs = json.loads(r.segments_json or "[]") if r else []
    trim = (s.trim_start_ms or 0) / 1000.0
    st = np.array([x["t_start_ms"] / 1000.0 + trim for x in segs if x.get("t_start_ms") is not None])
    return g, mag, hz, st


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("ids", nargs="*", type=int)
    ap.add_argument("--uid", type=int); ap.add_argument("--n", type=int, default=40); ap.add_argument("-v", action="store_true")
    a = ap.parse_args()
    logging.disable(logging.WARNING)
    from app import models
    from app.db import SessionLocal
    db = SessionLocal(); S = models.Session
    try:
        if a.uid:
            ss = (db.query(S).filter(S.user_id == a.uid, S.sport_class == "pumpfoil", S.status == "analyzed",
                                     S.deleted.isnot(True), S.merged_into.is_(None), S.placement.is_(None))
                  .order_by(S.id.desc()).limit(a.n).all())
        else:
            ss = [db.get(S, i) for i in a.ids]
        tot = dict(laeufe=0, laeufe_mit_versuch=0, versuche=0, gelungen=0, B=0, ohne_accel=0)
        for s in ss:
            g, mag, hz, st = _laden(db, s)
            if len(g) < 30:
                continue
            vs = startversuche(g, mag, hz)
            gel = [e for e in vs if st.size and np.any((st - e["t"] > -8) & (st - e["t"] < 3))]
            mit = sum(1 for x in st if any(-3 < e["t"] - x < 8 for e in vs))
            r = json.loads((db.query(models.AnalysisResult).filter_by(session_id=s.id).first().start_attempts_json) or "[]")
            tot["laeufe"] += len(st); tot["laeufe_mit_versuch"] += mit; tot["versuche"] += len(vs); tot["gelungen"] += len(gel)
            tot["B"] += sum(e["weg"] == "B" for e in vs); tot["C"] = tot.get("C", 0) + sum(e["weg"] == "C" for e in vs); tot["ohne_accel"] += mag is None
            print(f"  #{s.id} {hz:4.0f} Hz  Laeufe {len(st):3}  Versuche neu {len(vs):3} (gelungen {len(gel):2}, "
                  f"B {sum(e['weg'] == 'B' for e in vs)}, C {sum(e['weg'] == 'C' for e in vs)})  Versuche heute {len(r)}")
            if a.v:
                for e in vs:
                    print(f"      {e['t']:7.1f}s {e['weg']} Punkte>=8 {e['punkte']} vmax {e['vmax']:4.1f} Anlauf {e['anlauf']}")
        print(tot)
    finally:
        db.rollback(); db.close()


if __name__ == "__main__":
    main()
