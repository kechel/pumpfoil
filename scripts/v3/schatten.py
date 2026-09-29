#!/usr/bin/env python3
"""Erkennung v3: Schattenlauf. Rechnet v2 (heute) und v3 auf der GANZEN Aufnahme — ohne Zuschnitt,
ohne Aussortiertes, ohne Zurueckgeholtes — mit der Empfindlichkeit des Besitzers. REIN LESEND:
ruft `analyze_session_v2` direkt (schreibt nie), NIE `run_analysis` (das committet selbst).

v3 = identischer Weg, nur die On-Foil-Maske kommt aus Stufe A. Dafuer wird in DIESEM Prozess
`detect_v2.model_mask_on_timebase` ersetzt — am Produktionscode aendert sich nichts.

Schreibt server/data/ml/schatten-v2.json.gz und schatten-v3.json.gz im Format der Baseline
(nur Sessions mit Accel/Modell; alle anderen bleiben, wie sie sind, und fehlen hier).

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/schatten.py [--jobs 20] [--nur 10195,1184]
"""
import os
# EIN Rechen-Thread je Prozess: sonst vervielfacht sich die interne Parallelitaet von
# numpy/sklearn mit der Prozesszahl (29.09.2026: Last 264 auf 26 Kernen, VM mit anderen Diensten).
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import argparse
import gzip
import json
import pathlib
import sys
from multiprocessing import Pool

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"


def _lauf(seg):
    return {"t0": seg.get("t_start_session_ms", seg["t_start_ms"]),
            "t1": seg.get("t_end_session_ms", seg["t_end_ms"]),
            "dist_m": seg.get("distance_m"), "dur_s": seg.get("duration_s"), "pumps": None,
            "avg_mps": seg.get("avg_speed_mps"), "max_mps": seg.get("max_speed_mps")}


EMPF = "eigen"


def eine(arg):
    s, variante = arg
    from app.analysis import detect_v2
    from app.analysis.gps import SENSITIVITY_PRESETS
    from app.analysis.v3 import merkmale as M
    if variante in ("ohne", "ohneveto"):
        # Ohne On-Foil-Modell: v2 nur mit GPS-Segmentierung + Fenster-Veto (wie bei gps_only).
        kw_extra = {"use_model": False}
    else:
        kw_extra = {}
    if variante in ("v3veto", "ohneveto"):
        from app.analysis.timebase import build_timebase_for_session
        from app.analysis.v3 import veto
    if variante == "v3":
        from app.analysis.v3 import stufe_a
        detect_v2.model_mask_on_timebase = lambda tb: stufe_a.maske(tb)
    sens = "normal" if EMPF == "normal" else (s.get("sensitivity") or "normal")
    kw = dict(SENSITIVITY_PRESETS.get(sens) or {}) if sens != "normal" else {}
    judge = (s.get("sport_class") or "pumpfoil") == "pumpfoil"
    try:
        res = detect_v2.analyze_session_v2(M.ganze_aufnahme(s), rebase=False, judge_fremdkraft=judge, **kw, **kw_extra)
    except Exception as e:
        return {"id": s["id"], "fehler": str(e)[:200]}
    out = {k: s.get(k) for k in ("id", "user_id", "device_id", "started_at", "ended_at", "device_model",
                                 "accel_hz", "placement", "sport_class", "sport_source", "sensitivity",
                                 "sport_auto", "place", "uuid", "detection")}
    segs = res["segments"]
    if variante in ("v3veto", "ohneveto"):
        tb = res.get("timebase") or build_timebase_for_session(M.ganze_aufnahme(s))
        segs, weg = veto.pruefen(tb, segs, fahrer=s["user_id"])
        out_weg = [dict(_lauf(x), v3_p=x["v3_p"]) for x in weg]
    out["runs"] = [_lauf(x) for x in segs]
    if variante in ("v3veto", "ohneveto"):
        out["verworfen"] = out_weg
    out["num_runs"] = len(out["runs"])
    out["foiling_time_s"] = res.get("foiling_time_s")
    out["foiling_distance_m"] = res.get("foiling_distance_m")
    out["andere_empfindlichkeit"] = {}
    return out


def _setze(e):
    global EMPF
    EMPF = e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--jobs", type=int, default=20)
    ap.add_argument("--nur", default="")
    ap.add_argument("--varianten", default="v2,v3")
    ap.add_argument("--empf", default="eigen", choices=["eigen", "normal"],
                    help="eigen = Profil-Empfindlichkeit des Besitzers; normal = fuer alle 'normal'")
    a = ap.parse_args()
    global EMPF
    EMPF = a.empf
    b = json.load(gzip.open(sorted(ML.glob("baseline-*.json.gz"))[-1]))
    nur = {int(x) for x in a.nur.split(",") if x}
    auswahl = [s for s in b if (s["accel_hz"] or 0) >= 15 and s["detection"] == "model"
               and s.get("placement") != "board" and s.get("uuid") and (not nur or s["id"] in nur)]
    for v in a.varianten.split(","):
        with Pool(a.jobs, initializer=_setze, initargs=(EMPF,)) as pool:
            res = list(pool.imap_unordered(eine, [(s, v) for s in auswahl], chunksize=4))
        fehl = [r for r in res if "fehler" in r]
        ok = [r for r in res if "fehler" not in r]
        name = f"schatten-{v}" + ("-normal" if EMPF == "normal" else "") + ("-test" if nur else "")
        with gzip.open(ML / f"{name}.json.gz", "wt") as f:
            json.dump(ok, f, default=str)
        print(v, "Sessions", len(ok), "Fehler", len(fehl), fehl[:3], "Laeufe", sum(len(r["runs"]) for r in ok), flush=True)


if __name__ == "__main__":
    main()
