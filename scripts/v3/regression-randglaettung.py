#!/usr/bin/env python3
"""Regressionstest: v3-Laufrand mit rohem p statt nur geglaettetem (A5, 16.11.2026). REIN LESEND.

Anlass (15.11.2026, Flying Sprint, Session A Lauf 3): `_glaetten` (5 s zentriert) zieht die niedrigen p nach dem (Fall 2026-11-16-f)
Absetzen vor — 4413 s roh p 0,43 >= theta 0,4, geglaettet 0,36 -> Schnitt; der Lauf hatte 59,997 s, das 60-s-Fenster
brauchte 60,000 s. Variante (NUR hier nachgebaut, app/analysis unveraendert): nach `_teil` jeden Lauf an Anfang und Ende
um bis zu GLAETTEN_S//2 Punkte verlaengern, solange das ROHE p >= theta bleibt, nie ueber den Kandidaten hinaus —
NACH `_bruecken`, tau-Filter und kurzen Stuecken (wie live), dann _segmente, nach_empfindlichkeit, geschuetzte Laeufe.

Je Session: `heute` = Live-Funktionen unveraendert (muss die gespeicherte Laufzahl treffen), `neu` = mit Randregel.
`run_analysis` wird NIE aufgerufen.

Aufruf (aus server/):
  DATABASE_URL=... DETECTOR_V2=1 DETECTOR_V3=1 nice -n 10 .venv/bin/python ../scripts/v3/regression-randglaettung.py --jobs 6 --aus X.jsonl
  DATABASE_URL=... .venv/bin/python ../scripts/v3/regression-randglaettung.py --bericht X.jsonl
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
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1])); from lokal_faelle import laden as _laden
_F = _laden("v3_faelle", "scripts/v3/v3_faelle.beispiel.json")   # Session-IDs nur lokal


def _rand_verlaengern(N, L, kand, t, p, theta):
    """Jeden fertigen Lauf an Anfang/Ende um bis zu GLAETTEN_S//2 Punkte verlaengern, solange das ROHE p >= theta
    bleibt — nie ueber seinen Kandidaten hinaus. Laeuft NACH tau-/Kurz-Filter, damit die Verlaengerung keinen Lauf
    aus dem Filter wirft (erste Fassung: -47 Laeufe, weil der Rand den pg-Schnitt senkte)."""
    k = N.GLAETTEN_S // 2
    out = []
    for x, y in L:
        ka = next(((a, b) for a, b in kand if a <= x and y <= b), None)
        if ka is None:
            out.append((x, y)); continue
        idx = np.flatnonzero((t >= ka[0]) & (t <= ka[1]))
        i0 = int(np.searchsorted(t[idx], x)); i1 = int(np.searchsorted(t[idx], y, side="right")) - 1
        n = 0
        while n < k and i1 + 1 < idx.size and p[idx[i1 + 1]] >= theta:
            i1 += 1; n += 1
        n = 0
        while n < k and i0 - 1 >= 0 and p[idx[i0 - 1]] >= theta:
            i0 -= 1; n += 1
        out.append((float(t[idx[i0]]), float(t[idx[i1]])))
    # Ueberlappungen nach dem Verlaengern zusammenlegen
    return N._vereinigung(out, [])


def _laeufe_beide(N, tb, v2, tief, sens, keep):
    """Wie N.laeufe() (Stand v3-r4-mild-3, mit _bruecken), gibt heute UND neu zurueck."""
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
    kand = N._vereinigung(frei_v2, frei_tief)
    gps = getattr(tb, "gps", None)

    def rest(L):
        L = N._bruecken(L, t, pg, theta, gps)
        L = [(a, b) for a, b in L if (N._mittel(t, pg, a, b) or 0) >= tau]
        return [(a, b) for a, b in L if b - a >= N.KURZ_S * 1000 or (N._mittel(t, p, a, b) or 0) >= k]
    heute = rest(N._teil(kand, t, pg, theta))
    return heute, _rand_verlaengern(N, heute, kand, t, p, theta), geschuetzt


def eine(sid: int) -> dict:
    import logging
    logging.disable(logging.WARNING)
    from sqlalchemy import text
    from app.db import SessionLocal
    from app import models
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.timebase import build_timebase_for_session
    from app.analysis.v3 import nachbearbeitung as N, merkmale as M
    db = SessionLocal()
    try:
        db.execute(text("SET TRANSACTION READ ONLY"))
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
        out = {"id": sid, "user": s.user_id, "sport": s.sport_class,
               "gespeichert": s.result.num_runs if s.result else None}
        if r is None:
            out["heute"] = out["neu"] = None
            return out
        Lh, Ln, geschuetzt = r
        off = (int(v2[0]["t_start_session_ms"]) - int(v2[0]["t_start_ms"])) if v2 else int(s.trim_start_ms or 0)
        from app.analysis import analyse_ausschluss
        for name, L in (("heute", Lh), ("neu", Ln)):
            if name == "neu" and Ln == Lh:
                out["neu"] = out["heute"]
                continue
            L2 = N.ohne_ausschluss(L, analyse_ausschluss(s))
            segs = N.nach_empfindlichkeit(N._segmente(L2, v2, s, off), v2, sens, geschuetzt)
            for g in geschuetzt:
                if g not in segs:
                    segs.append(g)
            out[name] = [{"a": int(x["t_start_session_ms"]), "b": int(x["t_end_session_ms"]),
                          "s": round((x["t_end_session_ms"] - x["t_start_session_ms"]) / 1000, 1),
                          "m": round(float(x.get("distance_m") or 0), 1)} for x in segs]
        return out
    except Exception as e:  # noqa: BLE001
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
    print(f"Nachbau trifft gespeicherte Laufzahl: {sum(1 for z in ok if z['gespeichert'] == len(z['heute']))}/{len(ok)}")
    lh = sum(len(z["heute"]) for z in ok); ln = sum(len(z["neu"]) for z in ok)
    fh = sum(l["s"] for z in ok for l in z["heute"]); fn = sum(l["s"] for z in ok for l in z["neu"])
    mh = sum(l["m"] for z in ok for l in z["heute"]); mn = sum(l["m"] for z in ok for l in z["neu"])
    print(f"Laeufe: {lh} -> {ln} ({ln - lh:+d})   Foil-Zeit {fh / 3600:.2f} -> {fn / 3600:.2f} h ({(fn - fh) / max(fh, 1) * 100:+.2f} %)"
          f"   Strecke {mh / 1000:.1f} -> {mn / 1000:.1f} km ({(mn - mh) / max(mh, 1) * 100:+.2f} %)")
    geaendert = [z for z in ok if z["neu"] != z["heute"]]
    print(f"Sessions mit geaenderten Laeufen: {len(geaendert)}; Laufzahl anders: {sum(1 for z in ok if len(z['neu']) != len(z['heute']))}")
    d = []
    for z in geaendert:
        if len(z["neu"]) == len(z["heute"]):
            d += [n["s"] - h["s"] for h, n in zip(z["heute"], z["neu"]) if n["s"] != h["s"]]
    if d:
        d = np.array(d)
        print(f"Verlaengerte Laeufe (gleiche Laufzahl): {d.size}, Median {np.median(d):+.1f} s, max {d.max():+.1f} s, min {d.min():+.1f} s")
    # 60-s-Grenze: Laeufe, die erst mit der Regel >= 60 s haben
    neu60 = sum(1 for z in geaendert if len(z["neu"]) == len(z["heute"])
                for h, n in zip(z["heute"], z["neu"]) if h["s"] < 60 <= n["s"])
    print(f"Laeufe, die neu >= 60 s erreichen (Minutenfenster moeglich): {neu60}")
    z = next((x for x in ok if x["id"] == _F["GT_RANDGLAETTUNG"]), None)
    if z:
        print("Ground Truth (Randglaettung) heute:", [l["s"] for l in z["heute"]], "neu:", [l["s"] for l in z["neu"]])
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
