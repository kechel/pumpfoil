#!/usr/bin/env python3
"""4 Varianten Einheit x Modell im Live-Weg vergleichen (13.11.2026). REIN LESEND (READ-ONLY-Transaktion, kein Speichern).

  heute     ACCEL_NORM aus, Modell r4 (live)
  norm      ACCEL_NORM an,  Modell r4
  r8b       ACCEL_NORM an,  Modell r8b (auf echtem g trainiert, data/ml/v3/stufe_a_r8b.pkl)
  r8b_roh   ACCEL_NORM aus, Modell r8b (Gegenprobe: falsche Einheit fuers neue Modell)
Datensaetze: label (FIT mit foil_status je GPS-Punkt), brett (Uhr gegen Handy am Brett, paare-2026-10-24.json),
garmin300 (300 aktuelle Garmin-App-Sessions, nur Zaehlung).

Aufruf (aus server/): DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 nice -n 15 .venv/bin/python ../scripts/v3/vergleich-einheiten.py --aus V.jsonl [--jobs 12]
                      .venv/bin/python ../scripts/v3/vergleich-einheiten.py --bericht V.jsonl
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import argparse
import importlib.util as iu
import json
import pathlib
import sys
from multiprocessing import Pool

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
VARIANTEN = {"heute": ("", "r4"), "norm": ("1", "r4"), "r8b": ("1", "r8b"), "r8b_roh": ("", "r8b")}
R8B = WURZEL / "server" / "data" / "ml" / "v3" / "stufe_a_r8b.pkl"


def _kette():
    sp = iu.spec_from_file_location("rgp", WURZEL / "scripts" / "v3" / "regression-garmin-primaer.py")
    m = iu.module_from_spec(sp); sp.loader.exec_module(m)
    return m.kette


def wahr_laeufe(gps, fs, min_s=3):
    out, a = [], None
    for i, v in enumerate(fs):
        t = int(gps[i][0])
        if v and a is None: a = t
        if not v and a is not None:
            if t - a >= min_s * 1000: out.append((a, t))
            a = None
    if a is not None and int(gps[-1][0]) - a >= min_s * 1000: out.append((a, int(gps[-1][0])))
    return out


def eine(job):
    art, sid, extra = job
    import logging; logging.disable(logging.WARNING)
    from sqlalchemy import text
    from app.db import SessionLocal
    from app import models, storage
    from app.analysis.v3 import nachbearbeitung as N
    kette = _kette()
    r4 = N.MODELLE / "stufe_a_r4.pkl"      # fest, NICHT N.MODELL lesen: ein Auftrag davor im selben Prozess hat es verstellt
    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        s = db.get(models.Session, sid)
        out = {"art": art, "id": sid, "user": s.user_id, **(extra or {})}
        if art == "label":
            gps = storage.load_gps(s.session_uuid); fs = storage.load_foil_status(s.session_uuid)
            if not fs or len(fs) != len(gps):
                return {**out, "fehler": "laenge"}
            out["wahr"] = wahr_laeufe(gps, [1 if v else 0 for v in fs])
        for name, (norm, mod) in VARIANTEN.items():
            os.environ["ACCEL_NORM"] = norm
            N.MODELL = R8B if mod == "r8b" else r4
            try:
                out[name] = [(l["a"], l["b"]) for l in kette(db, s, s.sport_class or "pumpfoil")["laeufe"]]
            except Exception as e:  # noqa: BLE001
                out[name] = None; out["fehler_" + name] = f"{type(e).__name__}: {e}"
        return out
    finally:
        os.environ["ACCEL_NORM"] = ""
        N.MODELL = r4
        db.rollback(); db.close()


def bericht(pfad):
    z = [json.loads(l) for l in open(pfad)]
    ov = lambda a, b: min(a[1], b[1]) - max(a[0], b[0])  # noqa: E731
    def schnitt(A, B): return sum(max(0, ov(a, b)) for a in A for b in B)
    print("== label (foil_status je GPS-Punkt)")
    L = [x for x in z if x["art"] == "label" and "wahr" in x and all(x.get(v) is not None for v in VARIANTEN)]
    print(f"   {len(L)} Sessions, {len({x['user'] for x in L})} Fahrer, {sum(len(x['wahr']) for x in L)} echte Laeufe")
    for v in VARIANTEN:
        tp = fn = fp = 0; inter = wz = pz = 0
        for x in L:
            W = [tuple(w) for w in x["wahr"]]; P = [tuple(p) for p in x[v]]
            t = sum(1 for w in W if any(ov(w, p) > 0 for p in P)); tp += t; fn += len(W) - t
            fp += sum(1 for p in P if not any(ov(w, p) > 0 for w in W))
            inter += schnitt(W, P); wz += sum(b - a for a, b in W); pz += sum(b - a for a, b in P)
        pr, rc = inter / pz, inter / wz
        print(f"   {v:8s} gefunden {tp} ({tp/(tp+fn):.1%}) falsch {fp} | Sek. Praez. {pr:.1%} Treffer {rc:.1%} F1 {2*pr*rc/(pr+rc):.3f}")
    print("== brett (Uhr gegen Handy am Brett)")
    B = [x for x in z if x["art"] == "brett" and all(x.get(v) is not None for v in VARIANTEN)]
    print(f"   {len(B)} Paare")
    for v in VARIANTEN:
        tp = fn = fp = 0; inter = wz = pz = 0
        for x in B:
            W = [tuple(w) for w in x["brett_laeufe"]]; d = x["versatz_ms"]
            P = [(a + d, b + d) for a, b in x[v]]
            t = sum(1 for w in W if any(ov(w, p) > 0 for p in P)); tp += t; fn += len(W) - t
            fp += sum(1 for p in P if not any(ov(w, p) > 0 for w in W))
            inter += schnitt(W, P); wz += sum(b - a for a, b in W); pz += sum(b - a for a, b in P)
        pr, rc = (inter / pz if pz else 0), inter / wz
        print(f"   {v:8s} gefunden {tp}/{tp+fn} falsch {fp} | Sek. Praez. {pr:.1%} Treffer {rc:.1%}")
    print("== garmin300 (nur Zaehlung)")
    G = [x for x in z if x["art"] == "garmin300" and all(x.get(v) is not None for v in VARIANTEN)]
    for v in VARIANTEN:
        print(f"   {v:8s} Laeufe {sum(len(x[v]) for x in G)}  Foil-Zeit {sum(b-a for x in G for a, b in x[v])/60000:.0f} min")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aus"); ap.add_argument("--bericht"); ap.add_argument("--jobs", type=int, default=12)
    a = ap.parse_args()
    if a.bericht:
        bericht(a.bericht); return
    from sqlalchemy import text
    from app.db import SessionLocal, engine
    from app import storage, models
    db = SessionLocal()
    jobs = []
    for sid, u in db.execute(text("select id, session_uuid from sessions where session_uuid like 'fit-%' and not coalesce(deleted,false) "
                                  "and coalesce(sport_class,'pumpfoil')='pumpfoil' order by id")).all():
        if (storage.session_dir(u) / "foil_status.json").exists():
            jobs.append(("label", sid, None))
    for p in json.load(open(WURZEL / "server/data/ml/v3/paare-2026-10-24.json")):
        if p.get("versatz_ms") is None or (p.get("streuung_ms") or 9e9) > 400:
            continue
        b = db.get(models.Session, p["brett"])
        if b and b.result and b.result.segments_json:
            W = [(g["t_start_session_ms"], g["t_end_session_ms"]) for g in json.loads(b.result.segments_json)]
            jobs.append(("brett", p["uhr"], {"brett": p["brett"], "versatz_ms": p["versatz_ms"], "brett_laeufe": W,
                                              "uhr_modell": p.get("uhr_modell")}))
    for (sid,) in db.execute(text(
            "select s.id from sessions s join analysis_results r on r.session_id=s.id join device_tokens d on d.id=s.device_id "
            "where d.platform='garmin' and s.session_uuid ~ '^[0-9]' and s.accel_hz>0 and coalesce(s.sport_class,'pumpfoil')='pumpfoil' "
            "and not coalesce(s.deleted,false) and s.merged_into is null and s.status='analyzed' "
            "and r.metrics_json like '%\"v3\"%' order by s.id desc limit 300")).all():
        jobs.append(("garmin300", sid, None))
    db.close(); engine.dispose()
    print(len(jobs), "Auftraege", flush=True)
    with open(a.aus, "w") as f, Pool(a.jobs, maxtasksperchild=10) as pool:
        for i, r in enumerate(pool.imap_unordered(eine, jobs), 1):
            f.write(json.dumps(r) + "\n"); f.flush()
            if i % 50 == 0:
                print(i, flush=True)


if __name__ == "__main__":
    main()
