#!/usr/bin/env python3
"""Regressionstest: kurz eingefrorenes GPS reparieren (`gps.eingefroren_reparieren`, 13.11.2026). REIN LESEND.

Ground Truth #21487 (Handy-GPS 5 s eingefroren: Doppler 0, danach Aufholsprung -> Lauf geteilt, Min-Tempo 0). Die
Reparatur verteilt die Positionen zwischen letztem guten Fix und Aufholfix gleichmaessig und setzt das Tempo auf die
Luftlinie (Indizes bleiben). Dieser Test zeigt, was sich im Bestand aendert.

Schritt 1 (`--suchen`): alle Sessions mit GPS auf der Platte, je Session die Zahl reparierter Abschnitte -> JSONL.
Schritt 2 (`--rechnen`): fuer die betroffenen die Kette ohne / mit Reparatur — v2 (Empfindlichkeit des Besitzers) und,
wenn die Session v3 traegt, v3 (laeufe -> _segmente -> nach_empfindlichkeit), alles mit den Live-Funktionen in einer
READ-ONLY-Transaktion; `run_analysis` wird nie aufgerufen. Vergleich: Laufzahl, Dauer, Strecke, Min-Tempo je Lauf.

Aufruf (aus server/):
  DATABASE_URL=... nice -n 10 .venv/bin/python ../scripts/v3/regression-eingefroren.py --suchen --jobs 8 --aus S.jsonl
  DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 nice -n 10 .venv/bin/python ../scripts/v3/regression-eingefroren.py --rechnen S.jsonl --jobs 8 --aus R.jsonl
  DATABASE_URL=... .venv/bin/python ../scripts/v3/regression-eingefroren.py --bericht R.jsonl
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


def suchen_eine(z):
    sid, uuid = z
    from app import storage
    from app.analysis.gps import eingefroren_reparieren
    try:
        _, n = eingefroren_reparieren(storage.load_gps(uuid))
        return {"id": sid, "n": n}
    except Exception as e:  # noqa: BLE001
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}"}


def _laeufe(segs):
    return [{"a": int(x["t_start_session_ms"]), "b": int(x["t_end_session_ms"]),
             "s": round((x["t_end_session_ms"] - x["t_start_session_ms"]) / 1000, 1),
             "m": round(float(x.get("distance_m") or 0), 1),
             "vmin": x.get("min_speed_mps"), "vmin5": x.get("min_5s")} for x in segs]


def rechnen_eine(sid: int) -> dict:
    import logging
    logging.disable(logging.WARNING)
    from sqlalchemy import text
    from app.db import SessionLocal
    from app import models
    from app.analysis import gps as G, analyse_ausschluss
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import nachbearbeitung as N, merkmale as M
    echt = G.eingefroren_reparieren
    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
        s = db.get(models.Session, sid)
        owner = db.get(models.User, s.user_id)
        sens = getattr(owner, "foil_sensitivity", None) or "normal"
        preset = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
        judge = (s.sport_class or "pumpfoil") == "pumpfoil"
        mit_v3 = bool(s.result and s.result.metrics_json and '"v3"' in s.result.metrics_json)
        keep = [(int(i[0]), int(i[1])) for i in (json.loads(s.fremdkraft_keep) if s.fremdkraft_keep else [])]
        out = {"id": sid, "user": s.user_id, "gespeichert": s.result.num_runs if s.result else None, "v3": mit_v3}
        tb = None
        for name, rep in (("heute", False), ("neu", True)):
            G.eingefroren_reparieren = echt if rep else (lambda smp: (smp, 0))
            v2 = analyze_session_v2(s, judge_fremdkraft=judge, **preset)["segments"]
            segs = v2
            if mit_v3:
                tief = analyze_session_v2(s, judge_fremdkraft=judge, **N.TIEF_KW)["segments"]
                if tb is None:
                    tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                                     "accel_scale": s.accel_scale}))
                r = N.laeufe(tb, v2, tief, sens, keep)
                if r is not None:
                    L, ges, _ = r
                    L = N.ohne_ausschluss(L, analyse_ausschluss(s))
                    off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(s.trim_start_ms or 0)
                    segs = N.nach_empfindlichkeit(N._segmente(L, v2, s, off), v2, sens, ges)
                    for g in ges:
                        if g not in segs:
                            segs.append(g)
            out[name] = _laeufe(segs)
        G.eingefroren_reparieren = echt
        return out
    except Exception as e:  # noqa: BLE001
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}"}
    finally:
        db.rollback()
        db.close()


def bericht(pfad):
    z = [json.loads(l) for l in open(pfad)]
    ok = [x for x in z if "fehler" not in x and x.get("heute") is not None]
    print(f"Sessions: {len(z)}, gerechnet {len(ok)}, Fehler {len(z) - len(ok)}")
    tr = sum(1 for x in ok if x["gespeichert"] == len(x["heute"]))
    print(f"Nachbau trifft gespeicherte Laufzahl: {tr}/{len(ok)}")
    lh = sum(len(x["heute"]) for x in ok); ln = sum(len(x["neu"]) for x in ok)
    print(f"Laeufe: {lh} -> {ln} ({ln - lh:+d}); Laufzahl geaendert in {sum(1 for x in ok if len(x['neu']) != len(x['heute']))} Sessions")
    fh = sum(l["s"] for x in ok for l in x["heute"]); fn = sum(l["s"] for x in ok for l in x["neu"])
    mh = sum(l["m"] for x in ok for l in x["heute"]); mn = sum(l["m"] for x in ok for l in x["neu"])
    print(f"Foil-Zeit {fh / 60:.1f} -> {fn / 60:.1f} min, Foil-Strecke {mh / 1000:.2f} -> {mn / 1000:.2f} km")
    for x in ok:
        if x["heute"] != x["neu"]:
            print(f"  #{x['id']} u{x['user']} v3={x['v3']}: {len(x['heute'])} -> {len(x['neu'])} Laeufe")
            for a in x["heute"]:
                n = next((b for b in x["neu"] if abs(b["a"] - a["a"]) <= 3000), None)
                if n is None:
                    print(f"     weg: {a['a'] / 1000:.0f}–{a['b'] / 1000:.0f} s ({a['s']} s)")
                elif n != a:
                    print(f"     {a['a'] / 1000:.0f} s: {a['s']} s/{a['m']} m vmin {a['vmin']} -> {n['s']} s/{n['m']} m vmin {n['vmin']}")
            for b in x["neu"]:
                if not any(abs(b["a"] - a["a"]) <= 3000 for a in x["heute"]):
                    print(f"     neu: {b['a'] / 1000:.0f}–{b['b'] / 1000:.0f} s ({b['s']} s)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--suchen", action="store_true")
    ap.add_argument("--rechnen")
    ap.add_argument("--bericht")
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus")
    a = ap.parse_args()
    if a.bericht:
        bericht(a.bericht)
        sys.exit(0)
    from app.db import SessionLocal, engine
    from sqlalchemy import text
    if a.suchen:
        db = SessionLocal()
        ids = db.execute(text("select id, session_uuid from sessions where not coalesce(deleted,false) "
                              "and merged_into is null order by id")).all()
        db.close(); engine.dispose()
        with open(a.aus, "w") as f, Pool(a.jobs, maxtasksperchild=200) as pool:
            for i, r in enumerate(pool.imap_unordered(suchen_eine, [tuple(x) for x in ids], chunksize=16), 1):
                f.write(json.dumps(r) + "\n")
                if i % 2000 == 0:
                    print(i, flush=True)
    elif a.rechnen:
        ids = [x["id"] for x in map(json.loads, open(a.rechnen)) if x.get("n")]
        print(len(ids), "betroffene Sessions", flush=True)
        engine.dispose()
        with open(a.aus, "w") as f, Pool(a.jobs, maxtasksperchild=50) as pool:
            for r in pool.imap_unordered(rechnen_eine, ids, chunksize=2):
                f.write(json.dumps(r) + "\n")
