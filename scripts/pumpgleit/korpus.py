#!/usr/bin/env python3
"""Schritt 5: was das neue Modell ueber den Bestand ausgeben wuerde — gegen heute. REIN LESEND.

Alle Sessions mit analysis_results.detection == 'model' (Accel nutzbar). Heute = die GESPEICHERTEN Werte
je Lauf (pumps, longest_glide_s, glides = Anzeige-Regel); neu = Modell (modell_gesamt.pkl) auf den
gespeicherten Laeufen + Puffer, Ableitung wie merkmale.ableiten. Laeufe ohne Accel (pumps None) bleiben None.
Laufgrenzen und Rekordfelder ausser best_glide_s werden NICHT veraendert.

Aufruf (aus server/):
  DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 nice .venv/bin/python ../scripts/pumpgleit/korpus.py --jobs 8
  ... --bericht       (liest korpus.jsonl + DB nur lesend fuer Rekord-Filter)
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import pathlib
import pickle
import sys
import multiprocessing as mp

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G
import merkmale as M

MOD = None


def _init():
    global MOD
    import logging
    logging.disable(logging.WARNING)
    with open(G.AUS / "modell_gesamt.pkl", "rb") as f:
        MOD = pickle.load(f)


def eine(sid: int) -> dict:
    db = G.db_lesend()
    try:
        U = G.uhr_daten(db, sid)
        if U is None:
            return {"id": sid, "fehler": "keine Daten"}
        segs = [g for g in U["segs"] if "t_start_session_ms" in g]
        laeufe = G.gespeicherte_laeufe(U)
        out = {"id": sid, "user": U["user"], "fs": U["fs"], "gyro": U["gyro"] is not None,
               "device_model": U["device_model"], "sport_class": U["sport_class"], "laeufe": []}
        if not laeufe:
            return out
        S = M.signale(U)
        tw, X, li, puf = M.merkmale(S, laeufe, MOD["puffer_s"])
        p = MOD["clf"].predict_proba(X[:, MOD["sp"]]) if X.shape[0] else np.zeros((0, 3))
        abl = M.ableiten(tw, p, S, laeufe, MOD["puffer_s"], theta=MOD["theta"])
        for g, a in zip(segs, abl):
            heute_gl = [x[2] for x in (g.get("glides") or [])]
            leer = g.get("pumps") is None
            out["laeufe"].append({
                "dauer": round(float(g.get("duration_s") or 0), 1),
                "p_h": g.get("pumps"), "p_n": None if leer else len(a["pump_ms"]),
                "gn_h": len(heute_gl), "gn_n": None if leer else len(a["gleit"]),
                "gs_h": round(sum(heute_gl), 1), "gs_n": None if leer else round(sum((y - x) / 1000 for x, y in a["gleit"]), 1),
                "lg_h": g.get("longest_glide_s"), "lg_n": None if leer else a["longest"],
                "ende_verl": round((a["ende"] - float(g["t_end_session_ms"])) / 1000.0, 2)})
        return out
    except Exception as e:  # pragma: no cover
        return {"id": sid, "fehler": repr(e)[:200]}
    finally:
        db.rollback(); db.close()


def ids():
    db = G.db_lesend()
    try:
        from app import models
        S, R = models.Session, models.AnalysisResult
        q = (db.query(S.id).join(R, R.session_id == S.id)
             .filter(R.detection == "model", S.deleted.isnot(True), S.merged_into.is_(None)).order_by(S.id))
        return [x[0] for x in q.all()]
    finally:
        db.rollback(); db.close()


def rechnen(jobs, aus, nur):
    alle = nur or ids()
    fertig = set()
    if aus.exists() and not nur:
        for z in aus.read_text().splitlines():
            try:
                fertig.add(json.loads(z)["id"])
            except ValueError:
                pass
    rest = [i for i in alle if i not in fertig]
    print(f"{len(alle)} Sessions, offen {len(rest)}", flush=True)
    ctx = mp.get_context("spawn")       # kein fork: OpenMP + fork haengt (messen_r7.py)
    with ctx.Pool(jobs, initializer=_init) as pool, open(aus, "a") as f:
        for k, r in enumerate(pool.imap_unordered(eine, rest, chunksize=4)):
            f.write(json.dumps(r) + "\n")
            if k % 200 == 0:
                print(k, flush=True); f.flush()


def bericht(aus):
    from collections import defaultdict
    Z = [json.loads(z) for z in aus.read_text().splitlines()]
    ok = [z for z in Z if "fehler" not in z]
    print(f"Sessions {len(Z)}, ohne Fehler {len(ok)}, Fehler {len(Z) - len(ok)}; mit Kreisel {sum(z['gyro'] for z in ok)}")
    L = [(z, l) for z in ok for l in z["laeufe"] if l["p_h"] is not None and l["p_n"] is not None]
    s = lambda k: sum(l[k] or 0 for _, l in L)
    print(f"Laeufe mit Accel {len(L)}")
    print(f"Pumps     heute {s('p_h'):9} neu {s('p_n'):9} ({100 * (s('p_n') / max(s('p_h'), 1) - 1):+.1f} %)")
    print(f"Gleit-Anz heute {s('gn_h'):9} neu {s('gn_n'):9}")
    print(f"Gleit-s   heute {s('gs_h'):9.0f} neu {s('gs_n'):9.0f}")
    rel = np.array([(l["p_n"] - l["p_h"]) / max(l["p_h"], 1) for _, l in L if l["p_h"] >= 10])
    print("Pumps je Lauf (>= 10 Pumps heute), relative Aenderung P10/P25/P50/P75/P90:",
          np.round(np.percentile(rel, [10, 25, 50, 75, 90]), 3))
    lgh = np.array([l["lg_h"] or 0 for _, l in L]); lgn = np.array([l["lg_n"] or 0 for _, l in L])
    print(f"Laengste Gleitphase je Lauf: heute Median {np.median(lgh):.1f} s (P90 {np.percentile(lgh, 90):.1f}), "
          f"neu Median {np.median(lgn):.1f} s (P90 {np.percentile(lgn, 90):.1f}); Laeufe mit Gleiten heute "
          f"{np.mean(np.array([l['gn_h'] for _, l in L]) > 0):.2%}, neu {np.mean(np.array([l['gn_n'] for _, l in L]) > 0):.2%}")
    ev = np.array([l["ende_verl"] for _, l in L])
    print(f"Ende der Pump/Gleit-Stufe gegen Laufende: Median {np.median(ev):+.2f} s, Anteil > 0: {np.mean(ev > 0):.1%}")
    # best_glide je Session
    bg = {}
    for z in ok:
        ls = [l for l in z["laeufe"] if l["lg_n"] is not None]
        bg[z["id"]] = (max([l["lg_h"] or 0 for l in ls], default=0.0), max([l["lg_n"] for l in ls], default=0.0))
    dif = np.array([n - h for h, n in bg.values()])
    print(f"best_glide_s je Session: heute Median {np.median([h for h, _ in bg.values()]):.1f}, neu "
          f"{np.median([n for _, n in bg.values()]):.1f}; Aenderung P10/P50/P90 {np.round(np.percentile(dif, [10, 50, 90]), 2)}")
    # je Fahrer
    F = defaultdict(lambda: [0, 0, 0.0, 0.0, 0])
    for z, l in L:
        f = F[z["user"]]
        f[0] += l["p_h"]; f[1] += l["p_n"]; f[2] += l["gs_h"]; f[3] += l["gs_n"]; f[4] += 1
    top = sorted(F.items(), key=lambda x: -abs(x[1][1] - x[1][0]) / max(x[1][0], 1) if x[1][0] > 300 else 0)[:10]
    print("Fahrer mit der groessten relativen Pump-Aenderung (>= 300 Pumps):")
    for u, f in top:
        print(f"  u{u}: Laeufe {f[4]}, Pumps {f[0]} -> {f[1]} ({100 * (f[1] / max(f[0], 1) - 1):+.1f} %), Gleit-s {f[2]:.0f} -> {f[3]:.0f}")
    # Beispiele: groesste Aenderungen
    gr = sorted(ok, key=lambda z: -abs(sum((l["p_n"] or 0) - (l["p_h"] or 0) for l in z["laeufe"])))[:8]
    print("Groesste Pump-Aenderung je Session:", [(z["id"], f"u{z['user']}", sum(l['p_h'] or 0 for l in z['laeufe']),
                                                  sum(l['p_n'] or 0 for l in z['laeufe'])) for z in gr])
    gb = sorted(bg.items(), key=lambda x: -abs(x[1][1] - x[1][0]))[:8]
    print("Groesste best_glide-Aenderung:", [(i, h, n) for i, (h, n) in gb])
    # Rekord „laengste Gleitphase" (Community, alle Zeit): Filter wie api/community._community, rein lesend
    db = G.db_lesend()
    try:
        from sqlalchemy import or_
        from app import models
        S, R, Us = models.Session, models.AnalysisResult, models.User
        q = (db.query(S.id, S.user_id, R.best_glide_s).select_from(R).join(S, R.session_id == S.id)
             .join(Us, S.user_id == Us.id)
             .filter(S.deleted.isnot(True), S.flagged.isnot(True), Us.blocked.isnot(True), Us.hidden.isnot(True),
                     S.status.notin_(("recording", "live")), S.is_pumpfoil.is_(True),
                     S.needs_classification.isnot(True),
                     or_(S.sport_class.is_(None), S.sport_class == "pumpfoil"),
                     or_(S.data_quality.is_(None), S.data_quality == "ok"), R.detection == "model"))
        rows = q.all()
    finally:
        db.rollback(); db.close()
    heute = sorted(rows, key=lambda r: -(r[2] or 0))[:5]
    neu = sorted([(r[0], r[1], bg.get(r[0], (None, 0.0))[1]) for r in rows], key=lambda r: -(r[2] or 0))[:5]
    print("Rekord laengste Gleitphase (alle Zeit, pumpfoil, model) HEUTE:", [(r[0], f"u{r[1]}", r[2]) for r in heute])
    print("                                                         NEU:", [(r[0], f"u{r[1]}", r[2]) for r in neu])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus", default=str(G.AUS / "korpus.jsonl"))
    ap.add_argument("--nur", default="")
    ap.add_argument("--bericht", action="store_true")
    a = ap.parse_args()
    aus = pathlib.Path(a.aus)
    if a.bericht:
        bericht(aus); return
    nur = [int(x) for x in a.nur.split(",") if x]
    rechnen(min(a.jobs, 8), aus, nur)


if __name__ == "__main__":
    main()
