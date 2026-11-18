#!/usr/bin/env python3
"""Trockenlauf GPS-Buendel (18.11.2026) — REIN LESEND, nichts in die DB.

Befund: manche Wear-Uhren (v. a. OnePlus OWWE251/OPWWE251) liefern nach einer GPS-Stille alle zurueckgehaltenen
Positionen auf einmal, und Health Services stempelt sie mit der Zustellzeit statt der Messzeit. Dann liegen z. B.
19 Positionen innerhalb von 25 ms, ein Lauf hat „140 m in 0:00". Idee: ein Buendel (>= MIN_N Punkte, Abstand je
<= MAX_DT_MS) nach einer Luecke rueckwaerts gleichmaessig in die Luecke verteilen (Abstand <= 1 s, letzter Punkt
behaelt seine Zeit).

Rechnet je betroffene Session die Lauferkennung v2 (`analyze_session_v2`, wie despike-regression.py: Wind-Schwellen,
Brett ohne Modell, Fremdkraft nur bei Pumpfoil) und die Sprints (V7) zweimal im Speicher: heute und mit verteilten
Buendeln. v3-Nachbearbeitung und Presets laufen NICHT mit.

    cd server && DATABASE_URL=... DETECTOR_V2=1 OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/gps-buendel-trocken.py \
        [--jobs 4] [--aus data/gps-buendel-trocken.jsonl]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import json
import logging
import multiprocessing as mp
import sys

sys.path.insert(0, ".")

MIN_N = 4          # Punkte im Buendel (inkl. erstem nach der Luecke)
MAX_DT_MS = 50     # Abstand innerhalb des Buendels
SCHRITT_MS = 1000  # hoechstens 1 Punkt je Sekunde zurueckverteilen


def buendel(t: list) -> list[tuple[int, int]]:
    """[(i, j)] je Buendel: Indizes erster..letzter Punkt (inklusive)."""
    out, i, n = [], 1, len(t)
    while i < n:
        j = i
        while j + 1 < n and t[j + 1] - t[j] <= MAX_DT_MS:
            j += 1
        if j - i + 1 >= MIN_N:
            out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def verteilen(gps: list) -> tuple[list, int]:
    """Kopie von gps mit verteilten Buendeln; zweiter Wert = Anzahl Buendel."""
    t = [float(p[0]) for p in gps]
    neu = [list(p) for p in gps]
    bs = buendel(t)
    for i, j in bs:
        n = j - i + 1
        vor = t[i - 1]
        schritt = min(SCHRITT_MS, (t[j] - vor) / n)
        for k in range(n):
            neu[i + k][0] = t[j] - (n - 1 - k) * schritt
    return neu, len(bs)


def _init():
    logging.disable(logging.WARNING)


def _kenn(res, gps, s):
    from app.analysis import sprint as SP
    segs = res.get("segments") or []
    k = {"laeufe": len(segs), "foil_s": round(float(res.get("foiling_time_s") or 0), 1),
         "foil_m": round(float(res.get("foiling_distance_m") or 0), 1),
         "vmax_kmh": round(float(res.get("max_speed_mps") or 0) * 3.6, 1),
         "null_s": sum(1 for x in segs if float(x.get("duration_s") or 0) < 1.0)}
    try:
        sp = SP.session_sprints(gps, segs, trim_start_ms=int(s.trim_start_ms or 0), version=7)
        b = sp.get("best") or {}
        k["s100"] = round(b["sprint_100m"] * 3.6, 2) if b.get("sprint_100m") else None
        k["s60"] = round(b["sprint_60s"] * 3.6, 2) if b.get("sprint_60s") else None
    except Exception as ex:
        k["sprint_fehler"] = f"{type(ex).__name__}: {str(ex)[:60]}"
    return k


def eine(sid: int) -> dict:
    from app import models, storage
    from app.analysis.detect_v2 import analyze_session_v2
    from app.db import SessionLocal
    from app.sportprofil import GRUPPE
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        gps = storage.load_gps(s.session_uuid)
        if len(gps) < 30:
            return {"id": sid, "status": "zu_kurz"}
        gps2, nb = verteilen(gps)
        if not nb:
            return {"id": sid, "status": "ohne_buendel"}
        kw = {}
        if (s.placement or "") == "board":
            kw["use_model"] = False
        if GRUPPE.get(s.sport_class or "pumpfoil") == "wind":
            from app.analysis.windlauf import schwellen, v2_parameter
            kw = v2_parameter(schwellen(gps))
            kw2 = v2_parameter(schwellen(gps2))
        else:
            kw2 = kw
        judge = (s.sport_class or "pumpfoil") == "pumpfoil"
        out = {"id": sid, "sport": s.sport_class, "geraet": (s.device_model or "").split(" ·")[0], "buendel": nb,
               "datum": s.started_at.date().isoformat()}
        out["heute"] = _kenn(analyze_session_v2(s, gps=gps, judge_fremdkraft=judge, **kw), gps, s)
        out["neu"] = _kenn(analyze_session_v2(s, gps=gps2, judge_fremdkraft=judge, **kw2), gps2, s)
        out["status"] = "gleich" if out["heute"] == out["neu"] else "anders"
        return out
    except Exception as ex:   # rein lesend: eine kaputte Session soll den Lauf nicht beenden
        return {"id": sid, "status": "fehler", "grund": f"{type(ex).__name__}: {str(ex)[:100]}"}
    finally:
        db.rollback(); db.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--aus", default="data/gps-buendel-trocken.jsonl")
    a = ap.parse_args()
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        ids = [x[0] for x in db.query(models.Session.id).filter(
            models.Session.status == "analyzed", models.Session.deleted.isnot(True),
            models.Session.merged_into.is_(None), models.Session.device_model.like("%Wear OS%")
        ).order_by(models.Session.id.desc())]
    finally:
        db.rollback(); db.close()
    erg = []
    with mp.get_context("spawn").Pool(min(a.jobs, 6), initializer=_init) as pool:
        for r in pool.imap_unordered(eine, ids, chunksize=4):
            erg.append(r)
    with open(a.aus, "w") as fh:
        for r in erg:
            fh.write(json.dumps(r) + "\n")
    from collections import Counter
    print(f"{len(erg)} Wear-Sessions: {dict(Counter(r['status'] for r in erg))}  -> {a.aus}")
    for r in sorted([r for r in erg if r["status"] in ("anders", "gleich")], key=lambda r: -r["buendel"]):
        print(f"  {r['id']} {r['datum']} {r['sport']} {r['geraet']} Buendel {r['buendel']}: heute {r['heute']} | neu {r['neu']}")
    for r in [r for r in erg if r["status"] == "fehler"][:5]:
        print("  FEHLER", r)


if __name__ == "__main__":
    main()
