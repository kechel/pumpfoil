#!/usr/bin/env python3
"""Reanalysiert alle nicht geloeschten Sessions und protokolliert Vorher/Nachher.

    cd server && .venv/bin/python ../scripts/reanalyse-alle.py [--dry] [--limit N]

SCHREIBT in die DB (ausser mit --dry). Vorher `analysis_results` sichern:
    pg_dump -t analysis_results -Fc -f <datei>

Sequenziell und mit kleiner Pause, damit die live laufende Seite nicht leidet.
Je Session eine Zeile JSON nach <log>.jsonl, damit die Verschiebungen danach
auswertbar sind (und ein Abbruch nichts verliert).
"""
import argparse
import json
import os
import sys
import time

LOG = "/home/jan/foil-analysis-backups/reanalyse-2026-08-10.jsonl"


def kennzahlen(metrics: dict, segs: list) -> dict:
    return {
        "tb": metrics.get("time_base"),
        "axis": metrics.get("accel_axis"),
        "hz": metrics.get("accel_hz_effective"),
        "runs": len(segs),
        "pumps": sum(g.get("pumps") or 0 for g in segs),
        "glide": round(max([g.get("longest_glide_s") or 0 for g in segs], default=0.0), 2),
        "dist": metrics.get("foiling_distance_m"),
        "pf": metrics.get("is_pumpfoil"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true", help="nichts schreiben")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--pause", type=float, default=0.05)
    args = ap.parse_args()

    if not os.path.exists(".env"):
        sys.exit("Bitte aus server/ starten.")
    env = dict(l.split("=", 1) for l in open(".env") if "=" in l and not l.startswith("#"))
    for k, v in env.items():
        os.environ.setdefault(k.strip(), v.strip().strip('"'))
    os.environ["DATABASE_URL"] = env["DATABASE_URL"].strip().strip('"')
    sys.path.insert(0, ".")

    from sqlalchemy import create_engine, text
    from sqlalchemy.orm import Session as OrmSession
    from app import models
    from app.analysis import run_analysis

    eng = create_engine(os.environ["DATABASE_URL"])
    with eng.connect() as c:
        ids = [r[0] for r in c.execute(text(
            "select id from sessions where deleted = false order by id"))]
        vorher = {}
        for sid, mj, sj in c.execute(text(
                "select a.session_id, a.metrics_json, a.segments_json from analysis_results a "
                "join sessions s on s.id = a.session_id where s.deleted = false")):
            vorher[sid] = kennzahlen(json.loads(mj), json.loads(sj))
    if args.limit:
        ids = ids[: args.limit]

    print(f"{len(ids)} Sessions, {len(vorher)} mit gespeichertem Stand"
          f"{'  [TROCKENLAUF]' if args.dry else ''}", flush=True)
    t0 = time.time()
    log = open(LOG, "a")
    geaendert = fehler = 0
    for i, sid in enumerate(ids, 1):
        try:
            with OrmSession(eng) as db:
                s = db.get(models.Session, sid)
                if s is None:
                    continue
                res = run_analysis(db, s, final=True)
                neu = kennzahlen(json.loads(res.metrics_json or "{}"),
                                 json.loads(res.segments_json or "[]"))
                if args.dry:
                    db.rollback()
                else:
                    db.commit()
        except Exception as ex:                       # eine kaputte Session stoppt den Lauf nicht
            fehler += 1
            log.write(json.dumps({"id": sid, "fehler": f"{type(ex).__name__}: {ex}"}) + "\n")
            log.flush()
            continue
        a = vorher.get(sid)
        anders = bool(a) and (a["runs"] != neu["runs"] or a["pumps"] != neu["pumps"]
                              or abs((a["glide"] or 0) - (neu["glide"] or 0)) >= 0.01
                              or a["pf"] != neu["pf"])
        if anders:
            geaendert += 1
        log.write(json.dumps({"id": sid, "alt": a, "neu": neu, "anders": anders}) + "\n")
        log.flush()
        if i % 25 == 0 or i == len(ids):
            v = i / max(time.time() - t0, 1e-9)
            print(f"  {i}/{len(ids)}  geaendert {geaendert}  Fehler {fehler}"
                  f"  {v:.1f}/s  rest ~{(len(ids)-i)/max(v,1e-9)/60:.0f} min", flush=True)
        time.sleep(args.pause)
    log.close()
    print(f"FERTIG: {len(ids)} Sessions, {geaendert} geaendert, {fehler} Fehler,"
          f" {(time.time()-t0)/60:.1f} min. Protokoll: {LOG}", flush=True)


if __name__ == "__main__":
    main()
