#!/usr/bin/env python3
"""Garmin Connect: eigene Aufnahme vs. Garmin-Datei derselben Fahrt mit der HEUTIGEN Kette nachrechnen (13.11.2026). REIN LESEND.

Anlass: seit 05.11. wird die Garmin-Datei primaer, wenn ihre Accel-Rate klar hoeher ist (`garmin_besser`); in 64 Faellen
ging unsere Aufnahme darin auf, die gespeicherte Laufzahl fiel 344 -> 309. Frage: liegt das am Datenweg (Garmin-Daten
schlechter fuer die Erkennung) oder nur daran, dass die alte Auswertung der eigenen Aufnahme von einem aelteren Stand ist?
Beide Seiten laufen durch dieselben Live-Funktionen (v2 mit Empfindlichkeit des Besitzers, v3 laeufe -> _segmente ->
nach_empfindlichkeit, Sportart der Garmin-Session) in einer READ-ONLY-Transaktion; `run_analysis` wird nie aufgerufen.

Aufruf (aus server/):
  DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 nice -n 10 .venv/bin/python ../scripts/v3/regression-garmin-primaer.py --jobs 4 --aus R.jsonl
  .venv/bin/python ../scripts/v3/regression-garmin-primaer.py --bericht R.jsonl
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import pathlib
import sys
from multiprocessing import Pool

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))


def _laeufe(segs):
    return [{"a": int(x["t_start_session_ms"]), "b": int(x["t_end_session_ms"]),
             "s": round((x["t_end_session_ms"] - x["t_start_session_ms"]) / 1000, 1),
             "m": round(float(x.get("distance_m") or 0), 1)} for x in segs]


def kette(db, s, sport_class):
    from app import models
    from app.analysis import analyse_ausschluss
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import nachbearbeitung as N, merkmale as M
    owner = db.get(models.User, s.user_id)
    sens = getattr(owner, "foil_sensitivity", None) or "normal"
    preset = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
    judge = (sport_class or "pumpfoil") == "pumpfoil"
    keep = [(int(i[0]), int(i[1])) for i in (json.loads(s.fremdkraft_keep) if s.fremdkraft_keep else [])]
    v2 = analyze_session_v2(s, judge_fremdkraft=judge, **preset)["segments"]
    segs, v3 = v2, False
    if judge:
        tief = analyze_session_v2(s, judge_fremdkraft=judge, **N.TIEF_KW)["segments"]
        tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                         "accel_scale": s.accel_scale}))
        r = N.laeufe(tb, v2, tief, sens, keep)
        if r is not None:
            v3 = True
            L, ges, _ = r
            L = N.ohne_ausschluss(L, analyse_ausschluss(s))
            off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(s.trim_start_ms or 0)
            segs = N.nach_empfindlichkeit(N._segmente(L, v2, s, off), v2, sens, ges)
            for g in ges:
                if g not in segs:
                    segs.append(g)
    return {"v3": v3, "laeufe": _laeufe(segs)}


SKALA = False


def eine(paar):
    oid, gid = paar
    import logging
    logging.disable(logging.WARNING)
    from sqlalchemy import text
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        o, g = db.get(models.Session, oid), db.get(models.Session, gid)
        sc = g.sport_class or o.sport_class
        out = {"eigene": oid, "garmin": gid, "user": o.user_id, "sport": sc, "geraet": g.device_model,
               "hz_eigene": o.accel_hz, "hz_garmin": g.accel_hz,
               "gespeichert_eigene": o.result.num_runs if o.result else None,
               "gespeichert_garmin": g.result.num_runs if g.result else None,
               "algo_eigene": o.result.algo_version if o.result else None}
        if SKALA:
            # Experiment: Garmin-Datei in die Einheit der eigenen Garmin-App bringen (die liefert milli-g, etikettiert 2048/g)
            g.accel_scale = int(round((g.accel_scale or 2048) * 2048 / 1000))
        for name, s in (("e", o), ("g", g)):
            try:
                out[name] = kette(db, s, sc)
            except Exception as ex:  # noqa: BLE001
                out[name] = {"fehler": f"{type(ex).__name__}: {ex}"}
        return out
    finally:
        db.rollback()
        db.close()


def bericht(pfad):
    z = [json.loads(l) for l in open(pfad)]
    ok = [x for x in z if "laeufe" in x["e"] and "laeufe" in x["g"]]
    print(f"Paare {len(z)}, beide gerechnet {len(ok)}")
    for x in z:
        if x not in ok:
            print("  Fehler", x["eigene"], x["garmin"], x["e"].get("fehler"), x["g"].get("fehler"))
    se = sum(x["gespeichert_eigene"] or 0 for x in ok); sg = sum(x["gespeichert_garmin"] or 0 for x in ok)
    ne = sum(len(x["e"]["laeufe"]) for x in ok); ng = sum(len(x["g"]["laeufe"]) for x in ok)
    print(f"Laeufe gespeichert: eigene {se}, Garmin {sg}")
    print(f"Laeufe heute nachgerechnet: eigene {ne}, Garmin {ng}")
    fe = sum(l["s"] for x in ok for l in x["e"]["laeufe"]); fg = sum(l["s"] for x in ok for l in x["g"]["laeufe"])
    me = sum(l["m"] for x in ok for l in x["e"]["laeufe"]); mg = sum(l["m"] for x in ok for l in x["g"]["laeufe"])
    print(f"Foil-Zeit eigene {fe/60:.1f} min, Garmin {fg/60:.1f} min; Strecke eigene {me/1000:.2f} km, Garmin {mg/1000:.2f} km")
    gleich = sum(1 for x in ok if len(x["e"]["laeufe"]) == len(x["g"]["laeufe"]))
    print(f"gleiche Laufzahl heute: {gleich}/{len(ok)}")
    for x in sorted(ok, key=lambda x: len(x["g"]["laeufe"]) - len(x["e"]["laeufe"])):
        de, dg = len(x["e"]["laeufe"]), len(x["g"]["laeufe"])
        if de != dg or (x["gespeichert_eigene"] or 0) != (x["gespeichert_garmin"] or 0):
            print(f"  #{x['eigene']}->#{x['garmin']} u{x['user']} {x['sport']} {x['geraet']} {x['hz_eigene']}/{x['hz_garmin']} Hz "
                  f"v3 {x['e']['v3']}/{x['g']['v3']}: gespeichert {x['gespeichert_eigene']}->{x['gespeichert_garmin']}, "
                  f"heute {de}->{dg} | Foil {sum(l['s'] for l in x['e']['laeufe'])/60:.1f}->{sum(l['s'] for l in x['g']['laeufe'])/60:.1f} min "
                  f"| alt-algo {x['algo_eigene']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--aus")
    ap.add_argument("--bericht")
    ap.add_argument("--garmin-skala", action="store_true", help="Garmin-Accel wie unsere Garmin-App skalieren (Experiment)")
    a = ap.parse_args()
    SKALA = a.garmin_skala
    if a.bericht:
        bericht(a.bericht); sys.exit(0)
    from sqlalchemy import text
    from app.db import SessionLocal, engine
    db = SessionLocal()
    paare = [tuple(r) for r in db.execute(text(
        "select o.id, g.id from sessions o join sessions g on g.id = o.merged_into "
        "where o.created_at > '2026-11-05' and g.session_uuid like 'garmin-%' and o.session_uuid not like 'garmin-%' "
        "order by o.id")).all()]
    db.close(); engine.dispose()
    print(len(paare), "Paare", flush=True)
    with open(a.aus, "w") as f, Pool(a.jobs, maxtasksperchild=10) as pool:
        for i, r in enumerate(pool.imap_unordered(eine, paare), 1):
            f.write(json.dumps(r) + "\n"); f.flush()
            if i % 10 == 0:
                print(i, flush=True)
