#!/usr/bin/env python3
"""Regression Stufe-A-Kandidat gegen das Live-Modell ueber den Bestand. REIN LESEND.

Je Session mit `metrics.v3` (live v3-bewertet) wird der Live-Weg nachgebaut (scripts/v3/r7_gemeinsam.py):
  heute  r4 + Referenz r3 aus server/app/analysis/v3/modelle/ (= live) -> Laeufe, Pumps, Bestwerte, is_pumpfoil
  neu_X  Kandidat X (Gesamtmodell, data/ml/v3/stufe_a_X.pkl) + Referenz r3 -> dasselbe
`heute` muss die gespeicherten Werte treffen — das belegt, dass der Nachbau misst, was live laeuft.
Pumps/Gleiten werden auf den neuen Grenzen NEU gezaehlt (Stufe 11 nachgebaut). Nie run_analysis, nie
ein Schreibzugriff (die DB-Sitzung wird am Ende zurueckgerollt).

Aufruf (aus server/):
  DATABASE_URL=... DETECTOR_V2=1 nice -n 15 .venv/bin/python ../scripts/v3/regression_r7.py \
      --kandidat r7s,r7a --jobs 8 --aus data/ml/regression/r7-AAAA.jsonl [--nur 123,456]
  ... --bericht data/ml/regression/r7-AAAA.jsonl --kandidat r7s     (Bericht, liest DB nur fuer Rekorde)
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

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ML = WURZEL / "server" / "data" / "ml"
LIVE = WURZEL / "server" / "app" / "analysis" / "v3" / "modelle"
KANDIDATEN: list[str] = []
REC_FELDER = ["best_distance_m", "best_duration_s", "best_speed_mps", "best_glide_s", "num_runs",
              "foiling_distance_m", "foiling_time_s", "pump_count"]


def _init(k):
    KANDIDATEN[:] = k


def _laeufe(segs, t0):
    return [{"a": int(t0 + x["t_start_session_ms"]), "b": int(t0 + x["t_end_session_ms"]),
             "s": round(float(x.get("duration_s") or 0), 1), "m": round(float(x.get("distance_m") or 0), 1),
             "v": round(float(x.get("max_speed_mps") or 0), 2), "pumps": x.get("pumps"),
             "gl": x.get("longest_glide_s"), "neu": bool(x.get("v3"))} for x in segs]


def eine(sid: int) -> dict:
    import logging
    logging.disable(logging.WARNING)
    import r7_gemeinsam as G
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        ctx = G.kontext(db, sid)
        if ctx is None or ctx.get("X") is None:
            return {"id": sid, "fehler": "keine Accel/GPS"}
        s = ctx["s"]
        res = s.result
        t0 = s.started_at.timestamp() * 1000.0
        m = json.loads(res.metrics_json or "{}") if res else {}
        out = {"id": sid, "user": s.user_id, "sens": ctx["sens"], "sport_class": s.sport_class,
               "sport_source": s.sport_source, "device_model": s.device_model, "app_version": s.app_version,
               "started_at": s.started_at.isoformat(), "t0": int(t0),
               "gespeichert": {k: getattr(res, k, None) for k in REC_FELDER + ["max_speed_mps"]} if res else None}
        if res:
            out["gespeichert"]["is_pumpfoil"] = s.is_pumpfoil
            out["gespeichert"]["laeufe"] = [[int(t0 + x["t_start_session_ms"]), int(t0 + x["t_end_session_ms"])]
                                            for x in json.loads(res.segments_json or "[]") if "t_start_session_ms" in x]
            out["gespeichert"]["v3"] = (m.get("v3") or {}).get("version")
        r3 = G.modell_laden(str(LIVE / "stufe_a_r3.pkl"))
        modelle = [("heute", G.modell_laden(str(LIVE / "stufe_a_r4.pkl")))] + \
                  [(f"neu_{k}", G.modell_laden(str(ML / "v3" / f"stufe_a_{k}.pkl"))) for k in KANDIDATEN]
        p_ref = G.vorhersage(r3, r3["clf"], ctx["X"], None)
        H = G.haltung(ctx, p_ref)
        for name, mod in modelle:
            p = G.vorhersage(mod, mod["clf"], ctx["X"], H)
            segs, verworfen = G.v3_segmente(ctx, p)
            ja, info = G.ist_pumpfoil(ctx, segs, p)
            segs = G.pumps_und_gleiten(ctx, segs)
            kz = G.kennzahlen(ctx, segs, ja)
            kz["laeufe"] = _laeufe(segs, t0)
            kz["verworfen_v2"] = len(verworfen)
            kz["p_mittel_laeufe"] = None
            kz["attempts_pruefung"] = info
            out[name] = kz
        return out
    except Exception as e:  # ein Fehler je Session darf den Lauf nicht abbrechen
        import traceback
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}", "tb": traceback.format_exc()[-600:]}
    finally:
        db.rollback()
        db.close()


def sessions_liste(mit_negativ=False):
    from app.db import SessionLocal
    from sqlalchemy import text
    db = SessionLocal()
    try:
        ids = [r[0] for r in db.execute(text(
            "select a.session_id from analysis_results a join sessions s on s.id = a.session_id "
            "where a.metrics_json::jsonb ? 'v3' and coalesce(a.metrics_json::jsonb->'v3'->>'fehler', '') = '' "
            "and not coalesce(s.deleted, false) and s.merged_into is null and a.detection = 'model' "
            "order by a.session_id"))]
    finally:
        db.rollback(); db.close()
    if mit_negativ:
        ids += [i for i in (12568, 12574, 12575) if i not in ids]
    return ids


# ------------------------------------------------------------------------------------------------ Bericht
def _ueberlapp(a, b, liste):
    return any(a < y and b > x for x, y in liste)


def bericht(pfad: str, kand: str, top: int = 15):
    from app.db import SessionLocal
    from sqlalchemy import text
    zeilen = [json.loads(z) for z in open(pfad)]
    neu_k = f"neu_{kand}"
    ok = [z for z in zeilen if "fehler" not in z and z.get("heute") and z.get(neu_k)]
    fehler = [z for z in zeilen if "fehler" in z]
    print(f"# Regression {kand} gegen r4 (live) — {pfad}")
    print(f"Sessions {len(zeilen)} · gerechnet {len(ok)} · Fehler {len(fehler)}")
    for z in fehler[:8]:
        print(f"  Fehler #{z['id']}: {z['fehler'][:100]}")
    # Nachbau-Treue
    g = [z for z in ok if z.get("gespeichert")]
    tr = lambda f, tol=0.0: sum(1 for z in g if z["gespeichert"].get(f) is not None and z["heute"].get(f) is not None  # noqa: E731
                                and abs(float(z["gespeichert"][f]) - float(z["heute"][f])) <= tol)
    print(f"Nachbau heute = gespeichert: Laeufe {tr('num_runs')}/{len(g)} · Foil-Zeit ±1 s {tr('foiling_time_s', 1.0)} · "
          f"Strecke ±5 m {tr('foiling_distance_m', 5.0)} · Pumps exakt {tr('pump_count')} · ±2 % "
          f"{sum(1 for z in g if z['gespeichert'].get('pump_count') is not None and z['heute'].get('pump_count') is not None and abs(z['gespeichert']['pump_count'] - z['heute']['pump_count']) <= max(2, 0.02 * z['gespeichert']['pump_count']))}"
          f" · best_distance ±1 m {tr('best_distance_m', 1.0)} · best_speed ±0,01 {tr('best_speed_mps', 0.011)} · "
          f"best_glide ±0,01 {tr('best_glide_s', 0.011)} · is_pumpfoil {sum(1 for z in g if z['gespeichert'].get('is_pumpfoil') == z['heute']['is_pumpfoil'])}")
    abw = [z for z in g if z["gespeichert"].get("num_runs") != z["heute"]["num_runs"]]
    if abw:
        print("  Laufzahl-Abweichungen Nachbau (erste 10, gespeichert -> heute, v3-Fassung):",
              [(z["id"], z["gespeichert"]["num_runs"], z["heute"]["num_runs"], z["gespeichert"].get("v3")) for z in abw[:10]])
    # Summen
    def summe(f, wer):
        return sum(float(z[wer].get(f) or 0) for z in ok)
    print("\n## Summen (heute r4 -> neu)")
    for f, fak, ein in (("num_runs", 1, ""), ("foiling_time_s", 1 / 3600, " h"), ("foiling_distance_m", 1 / 1000, " km"),
                        ("pump_count", 1, "")):
        h, n = summe(f, "heute"), summe(f, neu_k)
        print(f"  {f:20s} {h * fak:12.1f} -> {n * fak:12.1f}{ein}  ({(n - h) / max(h, 1) * 100:+.2f} %)")
    pf_weg = [z for z in ok if z["heute"]["is_pumpfoil"] and not z[neu_k]["is_pumpfoil"]]
    pf_neu = [z for z in ok if not z["heute"]["is_pumpfoil"] and z[neu_k]["is_pumpfoil"]]
    print(f"  is_pumpfoil: verlieren {len(pf_weg)} {[z['id'] for z in pf_weg][:20]} · gewinnen {len(pf_neu)} {[z['id'] for z in pf_neu][:20]}")
    # Laeufe weg/neu/Grenzen
    weg, neu, grenze = [], [], []
    for z in ok:
        H = [(l["a"], l["b"]) for l in z["heute"]["laeufe"]]
        N = [(l["a"], l["b"]) for l in z[neu_k]["laeufe"]]
        for l in z["heute"]["laeufe"]:
            if not _ueberlapp(l["a"], l["b"], N):
                weg.append((z, l))
        for l in z[neu_k]["laeufe"]:
            if not _ueberlapp(l["a"], l["b"], H):
                neu.append((z, l))
        for l in z["heute"]["laeufe"]:
            for k in z[neu_k]["laeufe"]:
                if l["a"] < k["b"] and l["b"] > k["a"] and (abs(l["a"] - k["a"]) > 2000 or abs(l["b"] - k["b"]) > 2000):
                    grenze.append((z, l, k))
    print(f"\n## Laeufe: weggefallen {len(weg)} · ganz neu {len(neu)} · Grenze um > 2 s verschoben {len(grenze)}")
    for name, L in (("weg", weg), ("neu", neu)):
        if L:
            d = np.array([l["s"] for _, l in L])
            print(f"  {name}: Dauer Median {np.median(d):.0f} s, < 8 s {(d < 8).mean() * 100:.0f} %, >= 30 s {(d >= 30).sum()}, "
                  f"Summe {d.sum() / 60:.0f} min; laengste: " +
                  ", ".join(f"#{z['id']} {l['s']:.0f} s" for z, l in sorted(L, key=lambda x: -x[1]['s'])[:6]))
    # sportauto 240 s
    kreuz = [z for z in ok if (z["heute"]["laengster_lauf_s"] >= 240) != (z[neu_k]["laengster_lauf_s"] >= 240)]
    print(f"\n## sportauto-Schwelle 240 s gekreuzt: {len(kreuz)}")
    for z in kreuz[:20]:
        print(f"  #{z['id']} u{z['user']} {z['sport_class']}/{z['sport_source']}: laengster {z['heute']['laengster_lauf_s']} -> "
              f"{z[neu_k]['laengster_lauf_s']} s · Urteil {z['heute']['sportauto']} -> {z[neu_k]['sportauto']}"
              f"{'  (wirkt nur bei sport_source default)' if z['sport_source'] != 'default' else '  (WIRKT: default)'}")
    # je Nutzer
    print("\n## Je Nutzer (Top nach |Delta Foil-Zeit|)")
    nu = {}
    for z in ok:
        e = nu.setdefault(z["user"], [0, 0, 0.0, 0.0, 0])
        e[0] += z["heute"]["num_runs"]; e[1] += z[neu_k]["num_runs"]
        e[2] += z["heute"]["foiling_time_s"]; e[3] += z[neu_k]["foiling_time_s"]; e[4] += 1
    for u, (h, n, fh, fn, k) in sorted(nu.items(), key=lambda kv: -abs(kv[1][3] - kv[1][2]))[:top]:
        print(f"  u{u}: {k} Sessions · Laeufe {h} -> {n} · Foil-Zeit {fh / 60:.0f} -> {fn / 60:.0f} min ({(fn - fh) / max(fh, 1) * 100:+.0f} %)")
    # groesste Aenderungen je Session
    print("\n## Groesste Aenderungen Foil-Zeit je Session")
    d = sorted(ok, key=lambda z: z[neu_k]["foiling_time_s"] - z["heute"]["foiling_time_s"])
    for z in d[:top] + d[-top:]:
        print(f"  #{z['id']} u{z['user']} {z['sens']} {(z['device_model'] or 'Garmin')[:16]}: Laeufe {z['heute']['num_runs']} -> "
              f"{z[neu_k]['num_runs']} · {z['heute']['foiling_time_s']:.0f} -> {z[neu_k]['foiling_time_s']:.0f} s · "
              f"Pumps {z['heute']['pump_count']} -> {z[neu_k]['pump_count']}")
    # Rekord-relevante Felder
    rel = [z for z in ok if any(_anders(z["heute"].get(f), z[neu_k].get(f)) for f in REC_FELDER)
           or z["heute"]["is_pumpfoil"] != z[neu_k]["is_pumpfoil"]]
    print(f"\n## Sessions mit geaenderten Rekord-Feldern ({', '.join(REC_FELDER)}, is_pumpfoil): {len(rel)} von {len(ok)}")
    for f in REC_FELDER:
        n = sum(1 for z in ok if _anders(z["heute"].get(f), z[neu_k].get(f)))
        print(f"  {f:20s} {n}")
    # Rekordhalter
    rekorde(ok, neu_k)
    # Negativbeispiele + Brett
    for sid in (12568, 12574, 12575):
        z = next((x for x in ok if x["id"] == sid), None)
        if z:
            print(f"Negativbeispiel #{sid}: heute {z['heute']['num_runs']}, neu {z[neu_k]['num_runs']}")
    db = SessionLocal()
    brett = db.execute(text(
        "select s.id, s.user_id, extract(epoch from s.started_at) * 1000, a.segments_json from sessions s "
        "join analysis_results a on a.session_id = s.id where s.placement = 'board' and not coalesce(s.deleted, false)")).all()
    db.rollback(); db.close()
    bz = {"heute": [0, 0, 0, 0], neu_k: [0, 0, 0, 0]}
    for bid, uid, bt0, segj in brett:
        bt0 = float(bt0)
        bl = [(bt0 + q["t_start_session_ms"], bt0 + q["t_end_session_ms"]) for q in json.loads(segj or "[]")
              if "t_start_session_ms" in q]
        if not bl:
            continue
        for z in ok:
            if z["user"] != uid:
                continue
            alle = z["heute"]["laeufe"] + z[neu_k]["laeufe"]
            if not any(bl[0][0] - 3600e3 < l["a"] < bl[-1][1] + 3600e3 for l in alle):
                continue
            lo, hi = bl[0][0] - 60e3, bl[-1][1] + 60e3
            for name in ("heute", neu_k):
                ls = [(l["a"], l["b"]) for l in z[name]["laeufe"] if lo <= l["a"] <= hi]
                bz[name][0] += len(ls); bz[name][1] += sum(1 for a, b in ls if _ueberlapp(a, b, bl))
                bz[name][2] += sum(1 for a, b in bl if _ueberlapp(a, b, ls)); bz[name][3] += len(bl)
    for name, (n, b, gef, nb) in bz.items():
        print(f"Brett-Parallelfahrten {name}: Uhr-Laeufe vom Brett bestaetigt {b}/{n}, Brett-Laeufe gefunden {gef}/{nb}")


def _anders(a, b):
    if a is None or b is None:
        return (a is None) != (b is None)
    return abs(float(a) - float(b)) > 1e-6


def rekorde(ok, neu_k):
    """Community-Rekordhalter (Pumpfoil, detection model, is_pumpfoil, Filter wie api/community._community)
    heute (gespeichert) gegen neu (Regression ersetzt die Werte der nachgerechneten Sessions)."""
    from app.db import SessionLocal
    from sqlalchemy import text
    from datetime import datetime, timedelta, timezone
    db = SessionLocal()
    rows = db.execute(text("""
        select s.id, s.user_id, s.started_at, s.is_pumpfoil, a.best_distance_m, a.best_duration_s, a.best_speed_mps,
               a.best_glide_s, a.num_runs, a.foiling_distance_m, a.foiling_time_s, a.pump_count
        from analysis_results a join sessions s on s.id = a.session_id join users u on u.id = s.user_id
        where not coalesce(s.deleted, false) and not coalesce(s.flagged, false) and not coalesce(u.blocked, false)
          and not coalesce(u.hidden, false) and s.status not in ('recording', 'live')
          and not coalesce(s.needs_classification, false)
          and (s.sport_class is null or s.sport_class = 'pumpfoil')
          and (s.data_quality is null or s.data_quality = 'ok') and a.detection = 'model'""")).all()
    db.rollback(); db.close()
    felder = ["best_distance_m", "best_duration_s", "best_speed_mps", "best_glide_s", "num_runs",
              "foiling_distance_m", "foiling_time_s", "pump_count"]
    namen = {"best_distance_m": "distance", "best_duration_s": "duration", "best_speed_mps": "speed",
             "best_glide_s": "glide", "num_runs": "runs", "foiling_distance_m": "session_distance",
             "foiling_time_s": "session_time", "pump_count": "session_pumps"}
    neu = {z["id"]: z[neu_k] for z in ok}
    heute_nach = {z["id"]: z["heute"] for z in ok}
    jetzt = datetime.now(timezone.utc)
    print("\n## Community-Rekorde Pumpfoil (Modell), Halter gespeichert -> mit Kandidat")
    for zeitraum, cut in (("all", None), ("365d", jetzt - timedelta(days=365)), ("30d", jetzt - timedelta(days=30))):
        for i, f in enumerate(felder):
            def bester(quelle):
                best = None
                for r in rows:
                    sid, uid, ts, pf = r[0], r[1], r[2], r[3]
                    if cut is not None and ts < cut:
                        continue
                    v = r[4 + i]
                    if quelle == "neu" and sid in neu:
                        v, pf = neu[sid].get(f), neu[sid]["is_pumpfoil"]
                    elif quelle == "nach" and sid in heute_nach:
                        v, pf = heute_nach[sid].get(f), heute_nach[sid]["is_pumpfoil"]
                    if not pf or v is None or v <= 0:
                        continue
                    k = (-float(v), ts, sid)
                    if best is None or k < best[0]:
                        best = (k, sid, uid, float(v))
                return best
            a, n = bester("gespeichert"), bester("neu")
            if a is None:
                continue
            marke = "GLEICH" if (n and a[1] == n[1] and abs(a[3] - n[3]) < 1e-6) else "AENDERT"
            print(f"  {zeitraum:4s} {namen[f]:16s} #{a[1]} u{a[2]} {a[3]:.2f}  ->  "
                  + (f"#{n[1]} u{n[2]} {n[3]:.2f}" if n else "-") + f"   {marke}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus")
    ap.add_argument("--nur")
    ap.add_argument("--kandidat", default="r7s")
    ap.add_argument("--bericht")
    ap.add_argument("--mit-negativ", dest="mit_negativ", action="store_true")
    a = ap.parse_args()
    k = [x for x in a.kandidat.split(",") if x]
    if a.bericht:
        bericht(a.bericht, k[0])
        sys.exit(0)
    ids = [int(x) for x in a.nur.split(",")] if a.nur else sessions_liste(a.mit_negativ)
    print(f"{len(ids)} Sessions, Kandidaten {k}", flush=True)
    from app.db import engine
    engine.dispose()
    pathlib.Path(a.aus).parent.mkdir(parents=True, exist_ok=True)
    with open(a.aus, "w") as f, Pool(min(a.jobs, 8), initializer=_init, initargs=(k,), maxtasksperchild=40) as pool:
        for i, z in enumerate(pool.imap_unordered(eine, ids, chunksize=2), 1):
            f.write(json.dumps(z, default=str) + "\n")
            if i % 100 == 0:
                print(i, flush=True)
