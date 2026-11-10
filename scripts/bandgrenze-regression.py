#!/usr/bin/env python3
"""Regressionstest: Tempo-Grenzen der Lauferkennung fuer Pumpfoil/Foil Scoot lockern. REIN LESEND.

Anlass (Jan, 10.11.2026, Sprint-Event „Flying Sprint Weekend"): Bandgrenze 25 km/h (geglaettetes Tempo, Sekunden
darueber fliegen aus dem Lauf) und Lauf-Spitze 32 km/h (Lauf verworfen) koennten schnelle echte Laeufe abschneiden —
die schnellste fliegende Minute aller Modell-Sessions lag mit 24,9 km/h genau an der Grenze. Messung der Stellen:
scripts/bandgrenze-messen.py.

Je Session zwei Rechnungen mit den LIVE-Funktionen (wie run_analysis: analyze_session_v2 mit dem Preset der
Empfindlichkeit des Besitzers, dann v3.nachbearbeitung.anwenden) — run_analysis selbst wird NIE aufgerufen (committet):
  heute  gps.grenzen_fuer unveraendert
  neu    gps.grenzen_fuer liefert fuer pumpfoil/foil_scoot (--band km/h, --spitze km/h); alle anderen Sportarten bleiben
Danach je Rechnung die Sprints (analysis/sprint.session_sprints, rohes Uhr-Tempo) wie live.
`heute` muss die gespeicherte Laufzahl treffen — das belegt, dass der Test misst, was live laeuft.

Aufruf (aus server/):
  nice -n 10 .venv/bin/python ../scripts/bandgrenze-regression.py --jobs 8 --aus X.jsonl [--band 30 --spitze 40]
  .venv/bin/python ../scripts/bandgrenze-regression.py --bericht X.jsonl
Liest server/.env selbst.
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

SERVER = pathlib.Path(__file__).resolve().parents[1] / "server"
sys.path.insert(0, str(SERVER))
for _z in (SERVER / ".env").read_text().splitlines():
    if "=" in _z and not _z.lstrip().startswith("#"):
        _k, _v = _z.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

SPORTARTEN = ("pumpfoil", "foil_scoot")
NEU = {"band": 30.0, "spitze": 40.0}


def _rechnen(s, judge, sens, preset, v3_an):
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.v3 import nachbearbeitung as N
    res = analyze_session_v2(s, judge_fremdkraft=judge, **preset)
    if v3_an:
        res = N.anwenden(res, s, judge, sens)
    return res


def eine(sid: int) -> dict:
    import logging
    logging.disable(logging.WARNING)
    from app.db import SessionLocal
    from app import models, storage
    from app.analysis import gps as v1, sprint
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.v3.nachbearbeitung import detector_v3_enabled
    db = SessionLocal()
    alt_grenzen = v1.grenzen_fuer
    try:
        s = db.get(models.Session, sid)
        owner = db.get(models.User, s.user_id)
        sens = getattr(owner, "foil_sensitivity", None) or "normal"
        preset = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
        judge = (s.sport_class or "pumpfoil") == "pumpfoil"
        det = s.result.detection if s.result else None
        v3_an = det == "model" and detector_v3_enabled() and getattr(s, "placement", None) != "board"
        if getattr(s, "placement", None) == "board":
            preset["use_model"] = False
        gps_roh = storage.load_gps(s.session_uuid, roh=True)
        out = {"id": sid, "user": s.user_id, "sens": sens, "det": det, "sport": s.sport_class,
               "gespeichert": s.result.num_runs if s.result else None,
               "sprint_gespeichert": round(float(s.result.sprint_60s_mps or 0) * 3.6, 2) if s.result else None}
        for name in ("heute", "neu"):
            if name == "neu":
                band, spitze = NEU["band"] / 3.6, NEU["spitze"]
                v1.grenzen_fuer = lambda sc, _a=alt_grenzen: ((band, spitze) if (sc or "pumpfoil") in SPORTARTEN
                                                              else _a(sc))
            else:
                v1.grenzen_fuer = alt_grenzen
            res = _rechnen(s, judge, sens, preset, v3_an)
            segs = res["segments"]
            sp = sprint.session_sprints(gps_roh, segs, int(s.trim_start_ms or 0))
            out[name] = {
                "laeufe": [{"a": int(x["t_start_session_ms"]), "b": int(x["t_end_session_ms"]),
                            "s": round((x["t_end_session_ms"] - x["t_start_session_ms"]) / 1000, 1),
                            "avg": round(float(x.get("avg_speed_mps") or 0) * 3.6, 1),
                            "max": round(float(x.get("max_speed_mps") or 0) * 3.6, 1)} for x in segs],
                "sprint": {k: round(v * 3.6, 2) for k, v in sp["best"].items()},
                "tempo_verworfen": sum(1 for f in (res.get("metrics") or {}).get("fremdkraft_laeufe") or []
                                       if f.get("quelle") == "tempo"),
            }
        return out
    except Exception as e:  # ein Fehler je Session darf den Lauf nicht abbrechen
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}"}
    finally:
        v1.grenzen_fuer = alt_grenzen
        db.close()


def sessions_liste(detection: str):
    from app.db import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        sql = ("select a.session_id from analysis_results a join sessions s on s.id = a.session_id "
               "where s.sport_class = any(:sp) and not coalesce(s.deleted, false) and a.segments_json is not null")
        if detection != "alle":
            sql += " and a.detection = :det"
        return [r[0] for r in db.execute(text(sql + " order by a.session_id"),
                                         {"sp": list(SPORTARTEN), "det": detection})]
    finally:
        db.close()


def _init(band, spitze):
    NEU["band"], NEU["spitze"] = band, spitze


def ueberlapp(a, b, liste):
    return any(a < y and b > x for x, y in liste)


def bericht(pfad: str):
    zeilen = [json.loads(z) for z in open(pfad)]
    ok = [z for z in zeilen if "fehler" not in z]
    fehler = [z for z in zeilen if "fehler" in z]
    print(f"Sessions: {len(zeilen)}, gerechnet {len(ok)}, Fehler {len(fehler)}")
    for det in sorted({z["det"] or "-" for z in ok}):
        g = [z for z in ok if (z["det"] or "-") == det]
        treffer = sum(1 for z in g if z["gespeichert"] == len(z["heute"]["laeufe"]))
        geaendert = [z for z in g if [(l["a"], l["b"]) for l in z["heute"]["laeufe"]]
                     != [(l["a"], l["b"]) for l in z["neu"]["laeufe"]]]
        lh = sum(len(z["heute"]["laeufe"]) for z in g); ln = sum(len(z["neu"]["laeufe"]) for z in g)
        fh = sum(l["s"] for z in g for l in z["heute"]["laeufe"]); fn = sum(l["s"] for z in g for l in z["neu"]["laeufe"])
        print(f"\n== detection {det}: {len(g)} Sessions ==")
        print(f"Nachbau trifft gespeicherte Laufzahl: {treffer}/{len(g)}")
        print(f"Sessions mit geaenderten Laeufen: {len(geaendert)} ({len(geaendert) / max(len(g), 1) * 100:.1f} %)")
        print(f"Laeufe: {lh} -> {ln} ({(ln - lh) / max(lh, 1) * 100:+.2f} %)   "
              f"Foil-Zeit: {fh / 3600:.1f} h -> {fn / 3600:.1f} h ({(fn - fh) / max(fh, 1) * 100:+.2f} %)")
        tv_h = sum(z["heute"]["tempo_verworfen"] for z in g); tv_n = sum(z["neu"]["tempo_verworfen"] for z in g)
        print(f"Nach Tempo verworfene Laeufe: {tv_h} -> {tv_n}")
        neu = [(z, l) for z in g for l in z["neu"]["laeufe"]
               if not ueberlapp(l["a"], l["b"], [(x["a"], x["b"]) for x in z["heute"]["laeufe"]])]
        weg = [(z, l) for z in g for l in z["heute"]["laeufe"]
               if not ueberlapp(l["a"], l["b"], [(x["a"], x["b"]) for x in z["neu"]["laeufe"]])]
        print(f"Ganz neue Laeufe: {len(neu)} in {len({z['id'] for z, _ in neu})} Sessions; weggefallene: {len(weg)}")
        for z, l in sorted(neu, key=lambda zl: -zl[1]["s"])[:12]:
            print(f"   neu  #{z['id']} u{z['user']}: {l['s']:.0f} s, Ø {l['avg']} km/h, Spitze {l['max']} km/h")
        for z, l in weg[:8]:
            print(f"   weg  #{z['id']} u{z['user']}: {l['s']:.0f} s, Ø {l['avg']} km/h, Spitze {l['max']} km/h")
        # Sprints
        for kz in ("sprint_100m", "sprint_60s"):
            d = [(z["neu"]["sprint"].get(kz, 0) - z["heute"]["sprint"].get(kz, 0), z) for z in g]
            hoch = [x for x in d if x[0] > 0.05]
            runter = [x for x in d if x[0] < -0.05]
            mh = max((z["heute"]["sprint"].get(kz, 0) for z in g), default=0)
            mn = max((z["neu"]["sprint"].get(kz, 0) for z in g), default=0)
            print(f"{kz}: hoeher in {len(hoch)} Sessions, niedriger in {len(runter)}; Bestwert {mh} -> {mn} km/h")
            for dd, z in sorted(hoch, key=lambda x: -x[0])[:10]:
                print(f"   #{z['id']} u{z['user']}: {z['heute']['sprint'].get(kz, 0)} -> {z['neu']['sprint'].get(kz, 0)}")
            for dd, z in sorted(runter, key=lambda x: x[0])[:5]:
                print(f"   runter #{z['id']} u{z['user']}: {z['heute']['sprint'].get(kz, 0)} -> {z['neu']['sprint'].get(kz, 0)}")
        # Top-10 der fliegenden Minute heute vs. neu
        for name in ("heute", "neu"):
            top = sorted(((z[name]["sprint"].get("sprint_60s", 0), z["id"], z["user"]) for z in g), reverse=True)[:10]
            print(f"Top 10 sprint_60s {name}: " + ", ".join(f"{v}(#{i})" for v, i, _u in top))
    if fehler:
        print("\nFehler (erste 5):", [(z["id"], z["fehler"][:100]) for z in fehler[:5]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus")
    ap.add_argument("--bericht")
    ap.add_argument("--detection", default="alle", help="model | gps_only | alle")
    ap.add_argument("--band", type=float, default=30.0, help="neue Bandgrenze km/h")
    ap.add_argument("--spitze", type=float, default=40.0, help="neue Lauf-Spitze km/h")
    ap.add_argument("--ids", help="nur diese Sessions (Komma)")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args()
    if a.bericht:
        bericht(a.bericht)
        sys.exit(0)
    ids = [int(x) for x in a.ids.split(",")] if a.ids else sessions_liste(a.detection)
    if a.limit:
        ids = ids[:a.limit]
    print(f"{len(ids)} Sessions, neu: Band {a.band} km/h, Spitze {a.spitze} km/h", flush=True)
    with open(a.aus, "w") as fh, Pool(a.jobs, initializer=_init, initargs=(a.band, a.spitze)) as pool:
        for i, z in enumerate(pool.imap_unordered(eine, ids, chunksize=4), 1):
            fh.write(json.dumps(z) + "\n")
            if i % 200 == 0:
                print(f"  {i}/{len(ids)}", flush=True)
