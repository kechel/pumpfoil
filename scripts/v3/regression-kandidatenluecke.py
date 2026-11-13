#!/usr/bin/env python3
"""Regressionstest: v3 verbindet benachbarte Kandidaten-Laeufe ueber kurze Luecken. REIN LESEND.

Anlass (13.11.2026, #21487, Meldung eines Nutzers: „Lauf 7 und 8 gehoeren zusammen als ein lauf"): das Handy-GPS fror
5 s ein (Doppler exakt 0, danach Aufholsprung), v2 UND der tief-Kandidat trennten dort, das v3-Modell sagte durchgehend
p 0,94–1,0 — konnte aber nicht verbinden, weil `_teil` Loecher nur INNERHALB eines Kandidaten schliesst.

Loesung (b), hier NUR im Skript nachgebaut (nichts an app/analysis geaendert): nach `_teil(_vereinigung(v2, tief))`
zwei aufeinanderfolgende Laeufe verbinden, wenn die Luecke <= LUECKE_S + 1 s ist und p (geglaettet) in der Luecke
durchgehend >= theta bleibt — dieselbe Lochregel wie in `_teil`, nur ueber die Kandidatengrenze. Danach wie live:
tau-Filter, kurze Stuecke, _segmente, nach_empfindlichkeit, geschuetzte (zurueckgeholte) Laeufe unveraendert.

Je Session (alle mit `metrics.v3`): `heute` = Live-Funktionen unveraendert (muss die gespeicherte Laufzahl treffen —
Beleg, dass der Test misst, was live laeuft), `neu` = mit der Verbindung. Zu jeder Verbindung die GPS-Belege der
Luecke: Doppler-Minimum, Tempo aus der Luftlinie ueber die Luecke, Laenge. `run_analysis` wird NIE aufgerufen.

Aufruf (aus server/):
  DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 nice -n 10 .venv/bin/python ../scripts/v3/regression-kandidatenluecke.py --jobs 8 --aus X.jsonl
  DATABASE_URL=... .venv/bin/python ../scripts/v3/regression-kandidatenluecke.py --bericht X.jsonl
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import json
import math
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))


def _verbinden(L, t, pg, theta, luecke_s):
    """Loesung (b): benachbarte Intervalle ueber kurze Luecken mit hohem p verbinden. -> (neue Liste, Verbindungen)."""
    if not L:
        return L, []
    L = sorted(L)
    out, verb = [list(L[0])], []
    for a, b in L[1:]:
        pa, pb = out[-1]
        gap = (a - pb) / 1000
        m = (t > pb) & (t < a)
        hoch = bool(m.any()) and bool((pg[m] >= theta).all())
        if 0 <= gap <= luecke_s + 1 and (hoch or not m.any()):
            verb.append((pb, a))
            out[-1][1] = max(pb, b)
        else:
            out.append([a, b])
    return [tuple(x) for x in out], verb


def _laeufe_beide(N, tb, v2, tief, sens, keep):
    """Wie N.laeufe(), aber gibt heute UND neu zurueck (gleiche Zwischenschritte)."""
    from app.analysis.v3 import stufe_a
    modell, ref, _v = N._pfade()
    p_ref = stufe_a.wahrscheinlichkeit(tb, ref)
    p = stufe_a.wahrscheinlichkeit(tb, modell, p_ref=p_ref)
    if p is None:
        return None
    t = tb.t_gps_ms.astype(float)
    pg = N._glaetten(p)
    iv = lambda s: (float(s["t_start_session_ms"]), float(s["t_end_session_ms"]))  # noqa: E731
    geschuetzt = [s for s in v2 if keep and any(ka < iv(s)[1] and kb > iv(s)[0] for ka, kb in keep)]
    frei_v2 = [iv(s) for s in v2 if s not in geschuetzt]
    frei_tief = [iv(s) for s in tief if not any(iv(s)[0] < iv(g)[1] and iv(s)[1] > iv(g)[0] for g in geschuetzt)]
    theta, tau = N.TEIL.get(sens, N.TEIL["normal"])
    k = N.KURZ.get(sens, N.KURZ["normal"])
    roh = N._teil(N._vereinigung(frei_v2, frei_tief), t, pg, theta)

    def filtern(L):
        L = [(a, b) for a, b in L if (N._mittel(t, pg, a, b) or 0) >= tau]
        return [(a, b) for a, b in L if b - a >= N.KURZ_S * 1000 or (N._mittel(t, p, a, b) or 0) >= k]
    neu_roh, verb = _verbinden(roh, t, pg, theta, N.LUECKE_S)
    return filtern(roh), filtern(neu_roh), verb, geschuetzt, t, p, pg


def _m(a, b):
    dla = math.radians(b[1] - a[1]); dlo = math.radians(b[2] - a[2]) * math.cos(math.radians(a[1]))
    return 6371000 * math.hypot(dla, dlo)


def eine(sid: int) -> dict:
    import logging
    logging.disable(logging.WARNING)
    from sqlalchemy import text
    from app.db import SessionLocal
    from app import models, storage
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import nachbearbeitung as N, merkmale as M
    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))      # jeder Schreibversuch bricht ab
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
        tief = analyze_session_v2(s, judge_fremdkraft=judge, **N.TIEF_KW)["segments"]
        tb = build_timebase_for_session(M.ganze_aufnahme({"uuid": s.session_uuid, "accel_hz": s.accel_hz,
                                                         "accel_scale": s.accel_scale}))
        r = _laeufe_beide(N, tb, v2, tief, sens, keep)
        out = {"id": sid, "user": s.user_id, "sens": sens, "platform": None,
               "gespeichert": s.result.num_runs if s.result else None}
        if r is None:
            out["heute"] = out["neu"] = None
            return out
        Lh, Ln, verb, geschuetzt, tp, p, pg = r
        off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(s.trim_start_ms or 0)
        for name, L in (("heute", Lh), ("neu", Ln)):
            if name == "neu" and not verb:
                out["neu"] = out["heute"]
                continue
            L2 = N.ohne_ausschluss(L, __import__("app.analysis", fromlist=["analyse_ausschluss"]).analyse_ausschluss(s))
            segs = N.nach_empfindlichkeit(N._segmente(L2, v2, s, off), v2, sens, geschuetzt)
            for g in geschuetzt:
                if g not in segs:
                    segs.append(g)
            out[name] = [{"a": int(x["t_start_session_ms"]), "b": int(x["t_end_session_ms"]),
                          "s": round((x["t_end_session_ms"] - x["t_start_session_ms"]) / 1000, 1),
                          "m": round(float(x.get("distance_m") or 0), 1)} for x in segs]
        # GPS-Belege je Verbindung
        gps = storage.load_gps(s.session_uuid, roh=True) if verb else []
        belege = []
        for a, b in verb:
            # 1 s vor bis 2 s nach der Luecke: beim eingefrorenen GPS liegen die Fixe direkt an der Luecke selbst
            # im eingefrorenen Bereich (#21487: 0,04 m/s statt ~4 m/s)
            vor = [q for q in gps if q[0] <= a - 1000]
            nach = [q for q in gps if q[0] >= b + 2000]
            drin = [q for q in gps if a < q[0] < b]
            if not vor or not nach:
                continue
            x, y = vor[-1], nach[0]
            dt = (y[0] - x[0]) / 1000
            mp = (pg[(tp > a) & (tp < b)].min()) if ((tp > a) & (tp < b)).any() else None
            belege.append({"a": int(a), "b": int(b), "luecke_s": round((b - a) / 1000, 1),
                           "luftlinie_mps": round(_m(x, y) / dt, 2) if dt > 0 else None,
                           "doppler_min": round(min((q[3] for q in drin), default=-1), 2) if drin else None,
                           "doppler_0_anteil": round(sum(1 for q in drin if q[3] == 0) / len(drin), 2) if drin else None,
                           "punkte": len(drin), "p_min": round(float(mp), 2) if mp is not None else None})
        out["verbindungen"] = belege
        return out
    except Exception as e:  # ein Fehler je Session darf den Lauf nicht abbrechen
        return {"id": sid, "fehler": f"{type(e).__name__}: {e}"}
    finally:
        db.rollback()
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


def bericht(pfad: str):
    zeilen = [json.loads(z) for z in open(pfad)]
    ok = [z for z in zeilen if "fehler" not in z and z.get("heute") is not None]
    fehler = [z for z in zeilen if "fehler" in z]
    print(f"Sessions: {len(zeilen)}, gerechnet {len(ok)}, Fehler {len(fehler)}")
    treffer = sum(1 for z in ok if z["gespeichert"] == len(z["heute"]))
    print(f"Nachbau trifft gespeicherte Laufzahl: {treffer}/{len(ok)}")
    lh = sum(len(z["heute"]) for z in ok); ln = sum(len(z["neu"]) for z in ok)
    fh = sum(l["s"] for z in ok for l in z["heute"]); fn = sum(l["s"] for z in ok for l in z["neu"])
    print(f"Laeufe: {lh} -> {ln} ({ln - lh:+d}, {(ln - lh) / max(lh, 1) * 100:+.2f} %)   "
          f"Foil-Zeit: {fh / 3600:.2f} h -> {fn / 3600:.2f} h ({(fn - fh) / max(fh, 1) * 100:+.2f} %)")
    v = [(z, b) for z in ok for b in z.get("verbindungen") or []]
    geaendert = [z for z in ok if len(z["neu"]) != len(z["heute"])]
    print(f"Verbindungen: {len(v)} in {len({z['id'] for z, _ in v})} Sessions; Laufzahl geaendert in {len(geaendert)}")
    if v:
        ll = np.array([b["luftlinie_mps"] for _, b in v if b["luftlinie_mps"] is not None])
        gl = np.array([b["luecke_s"] for _, b in v])
        d0 = [b for _, b in v if (b["doppler_0_anteil"] or 0) >= 0.5]
        print(f"  Luecke: Median {np.median(gl):.1f} s, max {gl.max():.1f} s")
        print(f"  Luftlinie ueber die Luecke: Median {np.median(ll):.2f} m/s; < 1,5 m/s (sieht nach echtem Stopp aus): "
              f"{(ll < 1.5).sum()} · 1,5–2,5: {((ll >= 1.5) & (ll < 2.5)).sum()} · >= 2,5 (durchgefahren): {(ll >= 2.5).sum()}")
        print(f"  davon mit Doppler 0 in >= 50 % der Luecke (eingefrorenes GPS wie #21487): {len(d0)}")
        print("  Verdaechtige (Luftlinie < 1,5 m/s):")
        for z, b in sorted(v, key=lambda zb: zb[1]["luftlinie_mps"] if zb[1]["luftlinie_mps"] is not None else 9)[:15]:
            if (b["luftlinie_mps"] or 9) < 1.5:
                print(f"    #{z['id']} u{z['user']} bei {b['a'] / 1000:.0f} s: Luecke {b['luecke_s']} s, Luftlinie {b['luftlinie_mps']} m/s, "
                      f"Doppler-min {b['doppler_min']}, p_min {b['p_min']}")
    z = next((x for x in ok if x["id"] == 21487), None)
    if z:
        print(f"Ground Truth #21487: heute {len(z['heute'])} -> neu {len(z['neu'])} Laeufe; Verbindungen {z.get('verbindungen')}")
    for sid in (12568, 12574, 12575):
        z = next((x for x in ok if x["id"] == sid), None)
        if z:
            print(f"Negativbeispiel #{sid}: heute {len(z['heute'])}, neu {len(z['neu'])}")
    if fehler:
        print("Fehler (erste 5):", [(x["id"], x["fehler"][:80]) for x in fehler[:5]])


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=8)
    ap.add_argument("--aus")
    ap.add_argument("--nur")
    ap.add_argument("--bericht")
    a = ap.parse_args()
    if a.bericht:
        bericht(a.bericht)
        sys.exit(0)
    ids = [int(x) for x in a.nur.split(",")] if a.nur else sessions_liste()
    print(f"{len(ids)} Sessions", flush=True)
    from app.db import engine
    engine.dispose()
    with open(a.aus, "w") as f, Pool(a.jobs, maxtasksperchild=50) as pool:
        for i, z in enumerate(pool.imap_unordered(eine, ids, chunksize=4), 1):
            f.write(json.dumps(z) + "\n")
            if i % 200 == 0:
                print(i, flush=True)
