#!/usr/bin/env python3
"""Erkennung v3: Regressionstest ueber den ganzen Bestand, OHNE live zu gehen. REIN LESEND.

Jan (30.09.2026): „koennen wir 'reanalysieren und gegen den Schnappschuss vergleichen' nicht machen
ohne live zu gehen als Regressionstest?" — ja: dieses Skript rechnet fuer jede Accel-Session das,
was die PWA spaeter zeigen wuerde, und vergleicht es mit dem, was heute gespeichert ist.

Zwei Rechnungen je Session, beide mit der ECHTEN Session (Zuschnitt, aussortierte Bereiche,
zurueckgeholte Laeufe, Empfindlichkeit des Besitzers) — nicht die ganze Aufnahme wie die Werkbank:
  heute  der Weg von `run_analysis` nachgebaut, OHNE jedes Schreiben. Muss die gespeicherten Werte
         exakt treffen (Laeufe, Foil-Zeit, Pumps je Lauf) — das ist der Beleg, dass der Test misst,
         was er messen soll. `run_analysis` selbst wird NIE aufgerufen (committet selbst).
  v3     dasselbe, nur die Laeufe aus der v3-Nachbearbeitung (Modell r4, Ausgang v2 ∪ tief, teil +
         Veto je Stueck + kurze Stuecke; Schwellen je Empfindlichkeit). Unveraenderte Laeufe
         behalten die v2-Werte; neue/veraenderte werden aus dem GPS gerechnet (Strecke, Dauer,
         Tempo), Pumps und Gleitphasen fuer ALLE Laeufe wie in `run_analysis`.

Modell: das GESAMT-Modell (so wuerde es live laufen; es hat die Sessions im Training gesehen —
die ehrlichen Zahlen mit herausgehaltenen Fahrern stehen in der Werkbank).
Ausgabe: data/ml/regression/<name>.json.gz (je Session beide Rechnungen) + bericht.txt.

Aufruf (aus server/): DATABASE_URL=... DETECTOR_V2=1 nice -n 10 .venv/bin/python ../scripts/v3/regression.py [--jobs 16] [--nur 9580,10339]
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import gzip
import json
import pathlib
import sys
from multiprocessing import Pool

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
ML = WURZEL / "server" / "data" / "ml"
V3 = ML / "v3"
MODELL, REF = V3 / "stufe_a_r4.pkl", V3 / "stufe_a_r3.pkl"
TIEF_KW = {"enter_speed": 1.4, "exit_speed": 1.1, "min_segment_s": 3, "min_seg_avg_speed": 1.4}
FALTEN = False


# --- heutiger Weg (run_analysis ohne Schreiben) -------------------------------------------------
def rechnen(db, session, laeufe_v3=None):
    """-> dict wie run_analysis es speichern wuerde (nur die Felder, die wir vergleichen).
    `laeufe_v3`: Funktion(res_v2, session) -> neue Segmentliste (sonst heute)."""
    from app import models, storage
    from app.analysis import excluded_windows, MODEL_MIN_ACCEL_HZ, FILTER_BAND
    from app.analysis.timebase import _accel_chunk_counts, build_timebase
    from app.analysis.detect_v2 import analyze_session_v2
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.ml.features import bandpass_fft, vertical_against_gravity, magnitude_g
    from app.ml.pumps import find_pumps_cadence
    gps_samples = storage.load_gps(session.session_uuid)
    accel = storage.load_accel(session.session_uuid)
    ts0, ts1 = session.trim_start_ms, session.trim_end_ms
    lo = ts0 if ts0 is not None else 0
    hi = ts1 if ts1 is not None else (gps_samples[-1][0] if gps_samples else 0)
    accel_hz = float(session.accel_hz or 0.0)
    if accel.shape[0] > 0 and gps_samples:
        _tb = build_timebase(gps_samples, accel, session.accel_scale, session.accel_hz,
                             chunk_counts=_accel_chunk_counts(session.session_uuid),
                             t0_by_index=storage.load_accel_t0(session.session_uuid),
                             trim_start_ms=lo, trim_end_ms=hi, excluded_ranges=None)
        if _tb.has_accel and _tb.accel_hz and _tb.accel_hz > 0:
            accel_hz = round(float(_tb.accel_hz), 3)
            src_ms = _tb.t_accel_ms - float(lo)
            n_grid = int(max(hi - lo, 0) / 1000.0 * accel_hz) + 1
            grid_ms = np.arange(n_grid) / accel_hz * 1000.0
            pick = np.clip(np.searchsorted(src_ms, grid_ms), 0, src_ms.size - 1)
            accel = _tb.accel[pick]
        else:
            accel = accel[0:0]
    if (ts0 is not None or ts1 is not None) and gps_samples:
        gps_samples = [[s[0] - lo] + list(s[1:]) for s in gps_samples if lo <= s[0] <= hi]
    _excl = excluded_windows(session)
    if _excl and gps_samples:
        _off = (ts0 or 0) if (ts0 is not None or ts1 is not None) else 0
        _wins = [(a - _off, b - _off) for a, b in _excl]
        gps_samples = [s for s in gps_samples if not any(a <= s[0] <= b for a, b in _wins)]
    am_brett = (getattr(session, "placement", None) == "board"
                and bool(storage.chunk_laengen(session.session_uuid, "gyro")))
    accel_usable = accel.shape[0] > 0 and accel_hz >= MODEL_MIN_ACCEL_HZ and not am_brett
    if not accel_usable:
        return None                                 # v3 betrifft nur Modell-Sessions
    owner = db.get(models.User, session.user_id)
    sens = getattr(owner, "foil_sensitivity", None) or "normal"
    kw = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
    judge = (session.sport_class or "pumpfoil") == "pumpfoil"
    res = analyze_session_v2(session, judge_fremdkraft=judge, **kw)
    if laeufe_v3 is not None:
        res["segments"] = laeufe_v3(res, session, judge, sens)
        res["foiling_time_s"] = round(sum(s["t_end_ms"] - s["t_start_ms"] for s in res["segments"]) / 1000.0, 1)
        res["max_speed_mps"] = round(max((float(s.get("max_speed_mps") or 0) for s in res["segments"]), default=0.0), 2)
    res.pop("windows", None); res.pop("timebase", None)
    # Pumps je Lauf — WORTGLEICH wie run_analysis
    fs = accel_hz
    vsig = bandpass_fft(vertical_against_gravity(accel, session.accel_scale, fs), fs, *FILTER_BAND)
    total = 0
    for seg in res["segments"]:
        a_lo = max(int(round(seg["t_start_ms"] / 1000.0 * fs)), 0)
        a_hi = min(int(round(seg["t_end_ms"] / 1000.0 * fs)), vsig.size)
        idx = find_pumps_cadence(vsig[a_lo:a_hi], fs) if a_hi > a_lo else np.empty(0, dtype=int)
        pts = (a_lo + idx) / fs * 1000.0
        seg["pumps"] = int(pts.size); total += seg["pumps"]
        dur = seg.get("duration_s") or 0.0
        seg["avg_pump_hz"] = round(seg["pumps"] / dur, 3) if dur > 0 and seg["pumps"] >= 2 else None
        if pts.size >= 1:
            ps = np.sort(pts)
            gaps = list(np.diff(ps) / 1000.0)
            lead = (float(ps[0]) - a_lo / fs * 1000.0) / 1000.0
            tail = (a_hi / fs * 1000.0 - float(ps[-1])) / 1000.0
            gl = [g for g in ([lead] + gaps + [tail]) if g > 0]
            seg["longest_glide_s"] = round(float(max(gl)), 2) if gl else 0.0
        else:
            seg["longest_glide_s"] = 0.0
    segs = res["segments"]
    best = lambda k: max((float(s.get(k) or 0) for s in segs), default=0.0)  # noqa: E731
    return {"num_runs": len(segs), "foiling_time_s": res["foiling_time_s"],
            "foiling_distance_m": round(float(sum(s.get("distance_m") or 0 for s in segs)), 1),
            "max_speed_mps": res["max_speed_mps"], "pump_count": total,
            "best_distance_m": best("distance_m"), "best_duration_s": best("duration_s"),
            "best_speed_mps": best("max_speed_mps"), "best_glide_s": best("longest_glide_s"),
            "is_pumpfoil": len(segs) > 0,
            "laeufe": [[int(s["t_start_session_ms"]), int(s["t_end_session_ms"]), s.get("pumps"),
                        round(float(s.get("distance_m") or 0), 1)] for s in segs]}


# --- v3-Nachbearbeitung ---------------------------------------------------------------------
def v3_laeufe_fabrik(strenge):
    import werkbank as W

    def v3_laeufe(res, session, judge, sens):
        from app.analysis.detect_v2 import analyze_session_v2
        from app.analysis.timebase import build_timebase_for_session
        from app.analysis.v3 import merkmale as M, stufe_a
        from app import models
        ganz = M.ganze_aufnahme({"uuid": session.session_uuid, "accel_hz": session.accel_hz,
                                 "accel_scale": session.accel_scale})
        tb = build_timebase_for_session(ganz)
        # GESAMT-Modelle, so wie es live liefe (r3 als Referenz fuer die Haltung, dann r4)
        p_ref = stufe_a.wahrscheinlichkeit(tb, REF)
        p = stufe_a.wahrscheinlichkeit(tb, MODELL, p_ref=p_ref)
        if p is None:
            return res["segments"]
        t = tb.t_gps_ms.astype(float)
        v = np.nan_to_num(np.array([g[3] if len(g) > 3 and g[3] is not None else np.nan for g in tb.gps], float))
        tief = analyze_session_v2(session, judge_fremdkraft=judge, **TIEF_KW)["segments"]
        L0 = W.vereinigung([(s["t_start_session_ms"], s["t_end_session_ms"]) for s in tief],
                           [(s["t_start_session_ms"], s["t_end_session_ms"]) for s in res["segments"]])
        theta, tau = W.EMPF_TEIL.get(sens, W.EMPF_TEIL["normal"])
        schritte = [("teil", theta), ("veto", tau)]
        schritte += [("kurz", 0.8)] if strenge == "streng" else [("kurzroh", W.EMPF_KURZ.get(sens, 0.8))]
        L = W.anwenden(L0, schritte, t, v, W.glaetten(p), sens, p)
        return segmente_aus(L, res, session)
    return v3_laeufe


def segmente_aus(L, res, session):
    """Neue Laeufe -> Segment-Dicts. Deckt sich ein Lauf mit einem v2-Lauf (±1 s), bleibt dessen
    Dict (exakte heutige Werte); sonst aus dem GPS der Session gerechnet wie v1 (Strecke aus den
    Schritten, Dauer, Tempo 3-s-Median)."""
    from app import storage
    from app.analysis.gps import step_distances_m
    from app.analysis import gps as v1
    alt = {(s["t_start_session_ms"], s["t_end_session_ms"]): s for s in res["segments"]}
    # derselbe Versatz, mit dem analyze_session_v2 re-basiert (tb.window_start_ms)
    if res["segments"]:
        s0 = res["segments"][0]
        off = int(s0["t_start_session_ms"]) - int(s0["t_start_ms"])
    else:
        off = int(session.trim_start_ms or 0)
    g = np.asarray(storage.load_gps(session.session_uuid), float)
    t = g[:, 0]; lat, lon = g[:, 1], g[:, 2]
    step = step_distances_m(lat, lon); step = np.where(step > v1.OUTLIER_STEP_M, 0.0, step)
    sp = np.nan_to_num(g[:, 3]); sp3 = v1._running_median(sp, 3)
    out = []
    for a, b in L:
        treffer = [s for (x, y), s in alt.items() if abs(x - a) <= 1000 and abs(y - b) <= 1000]
        if treffer:
            out.append(treffer[0]); continue
        m = (t >= a) & (t <= b)
        if m.sum() < 2:
            continue
        i = np.flatnonzero(m)
        out.append({"t_start_session_ms": int(a), "t_end_session_ms": int(b),
                    "t_start_ms": int(a) - off, "t_end_ms": int(b) - off,
                    "i_start": int(i[0]), "i_end": int(i[-1]),
                    "duration_s": round((b - a) / 1000.0, 1), "distance_m": round(float(step[i[1:]].sum()), 1),
                    "avg_speed_mps": round(float(sp[m].mean()), 2), "max_speed_mps": round(float(sp3[m].max()), 2),
                    "neu_v3": True})
    return out


def gespeichert(session):
    r = session.result
    segs = json.loads(r.segments_json or "[]")
    return {"num_runs": len(segs), "foiling_time_s": r.foiling_time_s, "pump_count": r.pump_count,
            "pumps_je_lauf": [s.get("pumps") for s in segs],
            "laeufe": [[int(s.get("t_start_session_ms", 0)), int(s.get("t_end_session_ms", 0))] for s in segs]}


def eine(sid):
    from app import db, models
    S = db.SessionLocal()
    try:
        s = S.get(models.Session, sid)
        if s is None or s.result is None or s.result.detection != "model":
            return None
        try:
            heute = rechnen(S, s)
            if heute is None:
                return None
            out = {"id": sid, "user_id": s.user_id, "sport": s.sport_class, "place": s.place_name,
                   "spot_id": s.spot_id, "started_at": s.started_at.isoformat(),
                   "gespeichert": gespeichert(s), "heute": heute}
            for strenge in ("streng", "mild"):
                out[f"v3_{strenge}"] = rechnen(S, s, v3_laeufe_fabrik(strenge))
            return out
        except Exception as e:
            return {"id": sid, "fehler": repr(e)[:300]}
    finally:
        S.rollback(); S.close()


def _init():
    # Nach dem fork: die geerbte DB-Verbindung des Elternprozesses NICHT mitbenutzen (sonst
    # „SSL error: decryption failed or bad record mac"), jeder Arbeiter baut eigene auf.
    from app import db
    db.engine.dispose(close=False)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=16)
    ap.add_argument("--nur", default="")
    ap.add_argument("--name", default="r4")
    a = ap.parse_args()
    if os.environ.get("DETECTOR_V2") != "1":
        raise SystemExit("DETECTOR_V2=1 fehlt — sonst rechnet der Nachbau den alten v1-Weg")
    from app import db, models
    S = db.SessionLocal()
    try:
        q = (S.query(models.Session.id).join(models.AnalysisResult)
             .filter(models.Session.deleted.isnot(True), models.AnalysisResult.detection == "model",
                     models.Session.status.notin_(("recording", "live"))))
        ids = [i for (i,) in q.all()]
    finally:
        S.rollback(); S.close()
    nur = {int(x) for x in a.nur.split(",") if x}
    if nur:
        ids = [i for i in ids if i in nur]
    print("Sessions:", len(ids), flush=True)
    with Pool(a.jobs, initializer=_init) as pool:
        R = [r for r in pool.imap_unordered(eine, ids, chunksize=2) if r]
    aus = ML / "regression"; aus.mkdir(parents=True, exist_ok=True)
    name = a.name + ("-test" if nur else "")
    with gzip.open(aus / f"{name}.json.gz", "wt") as f:
        json.dump(R, f)
    bericht(R, aus / f"{name}-bericht.txt")


def bericht(R, pfad):
    ok = [r for r in R if "fehler" not in r]
    fehl = [r for r in R if "fehler" in r]
    Z = []
    def p(x=""):
        Z.append(x); print(x)
    p(f"Sessions {len(ok)}, Fehler {len(fehl)} {[(r['id'], r['fehler'][:80]) for r in fehl[:5]]}")
    # 1) Nachbau exakt?
    gleich_l = sum(1 for r in ok if r["heute"]["num_runs"] == r["gespeichert"]["num_runs"])
    gleich_p = sum(1 for r in ok if r["heute"]["pump_count"] == r["gespeichert"]["pump_count"])
    gleich_t = sum(1 for r in ok if abs((r["heute"]["foiling_time_s"] or 0) - (r["gespeichert"]["foiling_time_s"] or 0)) <= 0.1)
    p(f"\n1) NACHBAU gegen gespeichert: Laeufe gleich {gleich_l}/{len(ok)} · Foil-Zeit gleich {gleich_t}/{len(ok)} · Pumps gleich {gleich_p}/{len(ok)}")
    abw = [r for r in ok if r["heute"]["num_runs"] != r["gespeichert"]["num_runs"] or r["heute"]["pump_count"] != r["gespeichert"]["pump_count"]]
    for r in abw[:10]:
        p(f"   #{r['id']}: Laeufe {r['gespeichert']['num_runs']} -> {r['heute']['num_runs']}, Pumps {r['gespeichert']['pump_count']} -> {r['heute']['pump_count']}")
    # 2) v3 gegen heute
    for st in ("streng", "mild"):
        k = f"v3_{st}"
        H = sum(r["heute"]["foiling_time_s"] or 0 for r in ok); N = sum(r[k]["foiling_time_s"] or 0 for r in ok)
        p(f"\n2) v3 {st} gegen heute (Nachbau):")
        p(f"   Laeufe {sum(r['heute']['num_runs'] for r in ok)} -> {sum(r[k]['num_runs'] for r in ok)} · Foil-Zeit {H / 3600:.1f} -> {N / 3600:.1f} h "
          f"· Strecke {sum(r['heute']['foiling_distance_m'] for r in ok) / 1000:.0f} -> {sum(r[k]['foiling_distance_m'] for r in ok) / 1000:.0f} km "
          f"· Pumps {sum(r['heute']['pump_count'] for r in ok)} -> {sum(r[k]['pump_count'] for r in ok)}")
        wechsel = sum(1 for r in ok if r["heute"]["is_pumpfoil"] != r[k]["is_pumpfoil"])
        p(f"   Sessions, die ihren Pumpfoil-Status wechseln: {wechsel} (pumpfoil -> nicht: "
          f"{sum(1 for r in ok if r['heute']['is_pumpfoil'] and not r[k]['is_pumpfoil'])})")
        d = sorted(ok, key=lambda r: (r[k]["foiling_time_s"] or 0) - (r["heute"]["foiling_time_s"] or 0))
        p("   groesste Verluste: " + ", ".join(f"#{r['id']} {r['heute']['foiling_time_s']:.0f}->{r[k]['foiling_time_s']:.0f} s" for r in d[:8]))
        p("   groesste Gewinne: " + ", ".join(f"#{r['id']} {r['heute']['foiling_time_s']:.0f}->{r[k]['foiling_time_s']:.0f} s" for r in d[-8:][::-1]))
        # Rekorde: Top 10 all time je Kennzahl, Pumpfoil, je Fahrer bester Wert
        for kz in ("best_distance_m", "best_duration_s", "best_speed_mps", "best_glide_s", "pump_count"):
            def top(key):
                best = {}
                for r in ok:
                    if (r["sport"] or "pumpfoil") != "pumpfoil" or not r[key]["is_pumpfoil"]:
                        continue
                    v = r[key][kz] or 0
                    if v > best.get(r["user_id"], (0, None))[0]:
                        best[r["user_id"]] = (v, r["id"])
                return sorted(best.items(), key=lambda x: -x[1][0])[:10]
            alt, neu = top("heute"), top(k)
            if [u for u, _ in alt] != [u for u, _ in neu] or any(abs(x[1][0] - y[1][0]) > 1e-6 for x, y in zip(alt, neu)):
                p(f"   Rekord-Top-10 {kz}: heute " + ", ".join(f"u{u}={v:.1f}" for u, (v, _) in alt[:5])
                  + " | neu " + ", ".join(f"u{u}={v:.1f}" for u, (v, _) in neu[:5]))
            else:
                p(f"   Rekord-Top-10 {kz}: unveraendert")
    pfad.write_text("\n".join(Z) + "\n")


if __name__ == "__main__":
    main()
