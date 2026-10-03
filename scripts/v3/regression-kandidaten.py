#!/usr/bin/env python3
"""Regressionstest: v3-Kandidaten OHNE das alte On-Foil-Modell (foil_rf.pkl). REIN LESEND.

Anlass (03.10.2026, #12632 Bartosz): die „grosszuegigen" v3-Kandidaten (`TIEF_KW`) lockern nur die
Tempo-Grenzen — `detect_v2` nimmt mit Accel weiter das alte Modell als Maske. Wo es 0 % sagt, sieht
das neue Modell die Stelle nie. Frage an diesen Test: was aendert sich ueber den ganzen Bestand,
wenn die TIEF-Kandidaten mit `use_model=False` (reine GPS-Heuristik) gebildet werden?

Je Session (alle mit `metrics.v3`, also live v3-bewertet) zwei Rechnungen mit den LIVE-Funktionen
aus `app/analysis/v3/nachbearbeitung.py` — `run_analysis` wird NIE aufgerufen (committet selbst):
  heute  v2 (Empfindlichkeit des Besitzers) ∪ tief (TIEF_KW)            -> laeufe() -> _segmente()
  neu    v2 (Empfindlichkeit des Besitzers) ∪ tief (TIEF_KW, ohne Modell) -> laeufe() -> _segmente()
`heute` muss die gespeicherte Laufzahl treffen — das belegt, dass der Test misst, was live laeuft.

Ausgabe: JSONL je Session (absolute Lauf-Zeiten in ms, Dauer, mittleres p, foil_status-Anteil).
Den Bericht schreibt `--bericht` aus der JSONL (inkl. Abgleich gegen Brett-Parallelfahrten).

Aufruf (aus server/):
  DATABASE_URL=... nice -n 10 .venv/bin/python ../scripts/v3/regression-kandidaten.py --jobs 12 --aus X.jsonl
  DATABASE_URL=... .venv/bin/python ../scripts/v3/regression-kandidaten.py --bericht X.jsonl
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

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))


def _intervalle(segs, t0_ms):
    return [[int(t0_ms + s["t_start_session_ms"]), int(t0_ms + s["t_end_session_ms"])] for s in segs]


def eine(sid: int) -> dict:
    import logging
    logging.disable(logging.WARNING)
    from app.db import SessionLocal
    from app import models, storage
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import nachbearbeitung as N, merkmale as M
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        owner = db.get(models.User, s.user_id)
        sens = getattr(owner, "foil_sensitivity", None) or "normal"
        preset = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
        judge = (s.sport_class or "pumpfoil") == "pumpfoil"
        keep = []
        try:
            for item in (json.loads(s.fremdkraft_keep) if s.fremdkraft_keep else []):
                keep.append((int(item[0]), int(item[1])))
        except (ValueError, TypeError, IndexError):
            keep = []
        v2 = analyze_session_v2(s, judge_fremdkraft=judge, **preset)["segments"]
        tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                         "accel_scale": s.accel_scale}))
        off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(s.trim_start_ms or 0)
        t0 = s.started_at.timestamp() * 1000.0
        gps = storage.load_gps(s.session_uuid)
        tg = np.array([float(r[0]) for r in gps]) if gps else np.zeros(0)
        fs = storage.load_foil_status(s.session_uuid)
        fs = np.array([bool(x) for x in fs]) if fs and len(fs) == len(gps) and any(fs) else None
        out = {"id": sid, "user": s.user_id, "sens": sens, "t0": int(t0),
               "gespeichert": s.result.num_runs if s.result else None}
        # heute = Stand bis v3-r4-mild-1 (tief MIT altem Modell, keine Empfindlichkeits-Grenzen);
        # neu = der Live-Code (TIEF_KW ohne altes Modell + nach_empfindlichkeit), sobald vorhanden.
        for name, kw in (("heute", {**N.TIEF_KW, "use_model": True}), ("neu", N.TIEF_KW)):
            tief = analyze_session_v2(s, judge_fremdkraft=judge, **kw)["segments"]
            r = N.laeufe(tb, v2, tief, sens, keep)
            if r is None:
                out[name] = None
                continue
            L, geschuetzt, (tp, p) = r
            segs = N._segmente(L, v2, s, off)
            if name == "neu" and hasattr(N, "nach_empfindlichkeit"):
                segs = N.nach_empfindlichkeit(segs, v2, sens, geschuetzt)
            for g in geschuetzt:
                if g not in segs:
                    segs.append(g)
            laeufe = []
            for x in segs:
                a, b = float(x["t_start_session_ms"]), float(x["t_end_session_ms"])
                m = (tp >= a) & (tp <= b)
                fsa = None
                if fs is not None:
                    mg = (tg >= a) & (tg <= b)
                    fsa = round(float(fs[mg].mean()), 2) if mg.any() else None
                laeufe.append({"a": int(t0 + a), "b": int(t0 + b), "s": round((b - a) / 1000, 1),
                               "m": round(float(x.get("distance_m") or 0), 1),
                               "p": round(float(p[m].mean()), 2) if m.any() else None, "fs": fsa})
            out[name] = laeufe
        return out
    except Exception as e:  # ein Fehler je Session darf den Lauf nicht abbrechen
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}"}
    finally:
        db.close()


def sessions_liste():
    from app.db import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        return [r[0] for r in db.execute(text(
            "select a.session_id from analysis_results a join sessions s on s.id = a.session_id "
            "where a.metrics_json::jsonb ? 'v3' and coalesce(a.metrics_json::jsonb->'v3'->>'fehler', '') = '' "
            "and not coalesce(s.deleted, false) order by a.session_id"))]
    finally:
        db.close()


def ueberlapp(a, b, liste):
    return any(a < y and b > x for x, y in liste)


def bericht(pfad: str):
    from app.db import SessionLocal
    from sqlalchemy import text
    zeilen = [json.loads(z) for z in open(pfad)]
    ok = [z for z in zeilen if "fehler" not in z and z.get("heute") is not None and z.get("neu") is not None]
    fehler = [z for z in zeilen if "fehler" in z]
    print(f"Sessions: {len(zeilen)}, gerechnet {len(ok)}, Fehler {len(fehler)}")
    treffer = sum(1 for z in ok if z["gespeichert"] == len(z["heute"]))
    print(f"Nachbau trifft gespeicherte Laufzahl: {treffer}/{len(ok)}")
    lh = sum(len(z["heute"]) for z in ok); ln = sum(len(z["neu"]) for z in ok)
    fh = sum(l["s"] for z in ok for l in z["heute"]); fn = sum(l["s"] for z in ok for l in z["neu"])
    print(f"Laeufe: {lh} -> {ln} ({(ln - lh) / max(lh, 1) * 100:+.1f} %)   Foil-Zeit: {fh / 3600:.1f} h -> {fn / 3600:.1f} h ({(fn - fh) / max(fh, 1) * 100:+.1f} %)")
    neu = [(z, l) for z in ok for l in z["neu"] if not ueberlapp(l["a"], l["b"], [(x["a"], x["b"]) for x in z["heute"]])]
    weg = [(z, l) for z in ok for l in z["heute"] if not ueberlapp(l["a"], l["b"], [(x["a"], x["b"]) for x in z["neu"]])]
    print(f"Ganz neue Laeufe: {len(neu)} in {len({z['id'] for z, _ in neu})} Sessions; weggefallene: {len(weg)}")
    if neu:
        d = np.array([l["s"] for _, l in neu]); p = np.array([l["p"] or 0 for _, l in neu])
        print(f"  neue: Dauer Median {np.median(d):.0f} s, < 8 s: {(d < 8).mean() * 100:.0f} %, >= 30 s: {(d >= 30).mean() * 100:.0f} %; p Median {np.median(p):.2f}")
        fs = [l["fs"] for _, l in neu if l["fs"] is not None]
        if fs:
            print(f"  foil_status (TCX-Wahrheit) vorhanden fuer {len(fs)} neue: bestaetigt (>= 50 %) {sum(f >= 0.5 for f in fs)}")
    je_session = sorted(((len(z["neu"]) - len(z["heute"]), z) for z in ok), key=lambda x: -x[0])
    print("Groesste Zuwaechse (Session, Nutzer, heute -> neu):")
    for dz, z in je_session[:15]:
        print(f"  #{z['id']} u{z['user']} {z['sens']}: {len(z['heute'])} -> {len(z['neu'])}")
    nutzer = {}
    for z in ok:
        n = nutzer.setdefault(z["user"], [0, 0])
        n[0] += len(z["heute"]); n[1] += len(z["neu"])
    print("Je Nutzer (Top 12 nach Zuwachs):")
    for u, (h, n) in sorted(nutzer.items(), key=lambda kv: -(kv[1][1] - kv[1][0]))[:12]:
        print(f"  u{u}: {h} -> {n} ({(n - h) / max(h, 1) * 100:+.0f} %)")
    # Negativbeispiele: duerfen keine Laeufe bekommen
    for sid in (12568, 12574, 12575):
        z = next((x for x in ok if x["id"] == sid), None)
        if z:
            print(f"Negativbeispiel #{sid}: heute {len(z['heute'])}, neu {len(z['neu'])}")
    # Brett-Parallelfahrten: Laeufe der Handgelenk-Session gegen die Brett-Session desselben Fahrers
    db = SessionLocal()
    brett = db.execute(text(
        "select s.id, s.user_id, extract(epoch from s.started_at) * 1000, a.segments_json from sessions s "
        "join analysis_results a on a.session_id = s.id where s.placement = 'board' and not coalesce(s.deleted, false)")).all()
    db.close()
    bz = {"heute": [0, 0, 0], "neu": [0, 0, 0]}   # [Laeufe gesamt, vom Brett bestaetigt, Brett-Laeufe gefunden]
    brett_n = 0
    print("Brett-Parallelfahrten (Uhr-Laeufe vom Brett bestaetigt / Brett-Laeufe gefunden):")
    for bid, uid, bt0, segj in brett:
        bt0 = float(bt0)
        bl = [(bt0 + g["t_start_session_ms"], bt0 + g["t_end_session_ms"]) for g in json.loads(segj or "[]")
              if "t_start_session_ms" in g]
        if not bl:
            continue
        for z in ok:
            if z["user"] != uid or not z["heute"] and not z["neu"]:
                continue
            alle = z["heute"] + z["neu"]
            if not any(bl[0][0] - 3600e3 < l["a"] < bl[-1][1] + 3600e3 for l in alle):
                continue
            lo, hi = bl[0][0] - 60e3, bl[-1][1] + 60e3    # nur der gemeinsam aufgenommene Zeitraum
            brett_n += 1
            zeile = []
            for name in ("heute", "neu"):
                ls = [(l["a"], l["b"]) for l in z[name] if lo <= l["a"] <= hi]
                best = sum(1 for a, b in ls if ueberlapp(a, b, bl))
                gef = sum(1 for a, b in bl if ueberlapp(a, b, ls))
                bz[name][0] += len(ls); bz[name][1] += best; bz[name][2] += gef
                zeile.append(f"{name} {best}/{len(ls)} · {gef}/{len(bl)}")
            print(f"  Uhr #{z['id']} gegen Brett #{bid}: " + "   ".join(zeile))
    for name, (n, b, g) in bz.items():
        print(f"  Summe {name}: Uhr-Laeufe vom Brett bestaetigt {b}/{n}, Brett-Laeufe gefunden {g}")
    if fehler:
        print("Fehler (erste 5):", [(z["id"], z["fehler"][:80]) for z in fehler[:5]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus")
    ap.add_argument("--nur")
    ap.add_argument("--bericht")
    ap.add_argument("--mit-negativ", action="store_true", help="geloeschte Negativbeispiele mitrechnen")
    a = ap.parse_args()
    if a.bericht:
        bericht(a.bericht)
        sys.exit(0)
    ids = [int(x) for x in a.nur.split(",")] if a.nur else sessions_liste()
    if a.mit_negativ:
        ids += [i for i in (12568, 12574, 12575) if i not in ids]
    print(f"{len(ids)} Sessions", flush=True)
    # Die DB-Verbindung des Hauptprozesses NICHT an die Kinder vererben (sonst SSL-Fehler beim Start).
    from app.db import engine
    engine.dispose()
    with open(a.aus, "w") as f, Pool(a.jobs, maxtasksperchild=50) as pool:
        for i, z in enumerate(pool.imap_unordered(eine, ids, chunksize=4), 1):
            f.write(json.dumps(z) + "\n")
            if i % 100 == 0:
                print(i, flush=True)
