"""Detektor (v3) gegen die getappte Pump-Wahrheit (PumpTruth-Konsens) auswerten.

Für jeden gelabelten (Session, Lauf) [run_idx]:
  - Konsens-Wahrheit aus den Takes (app.pumptruth.compare_takes),
  - Detektor-Pump-Zeiten exakt wie in der Produktion (vertical_against_gravity ->
    bandpass -> find_pumps_local je Foiling-Segment),
  - Ausrichtung Konsens<->Detektor mit einem KONSTANTEN Offset, begrenzt auf ±½ Pump-
    Periode (verhindert Perioden-Aliasing der quasi-periodischen Folgen),
  - Recall / Precision im getappten Fenster (Bereich vor erstem / nach letztem Tap = nicht
    gelabelt -> ausgeschlossen).

Aufruf (DATABASE_URL muss auf Postgres zeigen — manueller .env-Parser unten):
    .venv/bin/python -m analyse.25_truth_vs_detector            # alle gelabelten Laeufe
    .venv/bin/python -m analyse.25_truth_vs_detector 295        # nur eine Session
"""
from __future__ import annotations

import os
import sys
from collections import defaultdict

# --- .env manuell laden (set -a exportiert DATABASE_URL nicht zuverlaessig) ---
_HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV = os.path.join(_HERE, "server", ".env")
if os.path.exists(_ENV):
    for _l in open(_ENV):
        _l = _l.strip()
        if _l.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = _l.split("=", 1)[1].strip().strip('"').strip("'")
sys.path.insert(0, os.path.join(_HERE, "server"))
os.chdir(os.path.join(_HERE, "server"))   # storage löst data/media relativ zu server/ auf

import numpy as np  # noqa: E402

from app.db import SessionLocal  # noqa: E402
from app import models, storage  # noqa: E402
from app.analysis import analyze_gps  # noqa: E402
from app.analysis.foil_model import predict_foiling_mask, detect_jumps  # noqa: E402
from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND  # noqa: E402
from app.ml.pumps import find_pumps_local  # noqa: E402
from app.pumptruth import compare_takes  # noqa: E402

MATCH_TOL_MS = 200   # ein Detektor-Peak gilt als Treffer, wenn < tol an einem Wahrheits-Pump


def detector_pts(s: models.Session) -> np.ndarray:
    """Pump-Zeiten (ms) des v3-Detektors, exakt wie in run_analysis (inkl. Trim)."""
    gps = storage.load_gps(s.session_uuid)
    accel = storage.load_accel(s.session_uuid)
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    if (ts0 is not None or ts1 is not None) and gps:
        lo = ts0 or 0
        hi = ts1 if ts1 is not None else gps[-1][0]
        gps = [[x[0] - lo] + list(x[1:]) for x in gps if lo <= x[0] <= hi]
        a_lo = max(int(round(lo / 1000 * s.accel_hz)), 0)
        a_hi = min(int(round(hi / 1000 * s.accel_hz)), accel.shape[0])
        accel = accel[a_lo:a_hi] if a_hi > a_lo else accel[0:0]
    if accel.shape[0] == 0:
        return np.empty(0)
    fs = float(s.accel_hz)
    res = analyze_gps(gps, gps_hz=s.gps_hz,
                      mask_override=predict_foiling_mask(gps, accel, fs, s.accel_scale),
                      impulse_times_ms=detect_jumps(accel, fs, s.accel_scale), water_rings=None)
    vsig = bandpass_fft(vertical_against_gravity(accel, s.accel_scale, fs), fs, *FILTER_BAND)
    det = []
    for seg in res["segments"]:
        alo = max(int(round(seg["t_start_ms"] / 1000 * fs)), 0)
        ahi = min(int(round(seg["t_end_ms"] / 1000 * fs)), vsig.size)
        det += list((alo + find_pumps_local(vsig[alo:ahi], fs)) / fs * 1000.0)
    return np.array(sorted(det))


def _best_offset(truth: np.ndarray, det: np.ndarray, maxshift: int) -> int:
    """Konstanter Offset (|off| <= maxshift), der (truth - off) am besten auf det legt
    (minimale Summe der Nächster-Nachbar-Abstände). Begrenzung = kein Perioden-Aliasing."""
    best, best_cost = 0, float("inf")
    for off in range(-maxshift, maxshift + 1, 10):
        cost = float(np.sum([np.min(np.abs(det - (t - off))) for t in truth]))
        if cost < best_cost:
            best_cost, best = cost, off
    return best


def eval_run(s: models.Session, takes: list[dict]) -> dict | None:
    cmp = compare_takes(takes)
    if not cmp.get("consensus_ms") or not cmp.get("window_ms"):
        return None
    truth = np.asarray(cmp["consensus_ms"], dtype=float)
    w = cmp["window_ms"]
    det = detector_pts(s)
    if det.size == 0:
        return None
    period = float(np.median(np.diff(truth))) if truth.size > 1 else 700.0
    maxshift = int(period / 2)
    off = _best_offset(truth, det[(det >= w[0] - 1500) & (det <= w[1] + 1500)], maxshift)
    al = truth - off
    al_w = det[(det >= w[0] - off - MATCH_TOL_MS) & (det <= w[1] - off + MATCH_TOL_MS)]
    if al_w.size == 0:
        return None
    matched = int(np.sum([np.min(np.abs(al_w - t)) < MATCH_TOL_MS for t in al]))
    fp = int(np.sum([np.min(np.abs(al - d)) > MATCH_TOL_MS for d in al_w]))
    return {
        "truth": int(truth.size), "det": int(al_w.size),
        "recall": matched / truth.size, "precision": (al_w.size - fp) / al_w.size,
        "offset_ms": off, "fp": fp, "n_takes": cmp["n_takes"], "period_ms": int(period),
    }


def main() -> None:
    only = int(sys.argv[1]) if len(sys.argv) > 1 else None
    db = SessionLocal()
    try:
        q = db.query(models.PumpTruth)
        if only:
            q = q.filter_by(session_id=only)
        groups: dict = defaultdict(lambda: defaultdict(list))
        for r in q.order_by(models.PumpTruth.take, models.PumpTruth.t_ms).all():
            groups[(r.session_id, r.run_idx)][r.take].append(r.t_ms)
        if not groups:
            print("Keine getappte Wahrheit gefunden.")
            return
        print(f"{'Session/Lauf':16} {'Takes':5} {'Wahr':5} {'Det':5} {'Offset':8} {'Recall':7} {'Precision':9}")
        tot_t = tot_m = tot_d = tot_fp = 0
        for (sid, run), bt in sorted(groups.items(), key=lambda x: (x[0][0], x[0][1] is None, x[0][1])):
            s = db.get(models.Session, sid)
            res = eval_run(s, [{"take": k, "times_ms": v} for k, v in sorted(bt.items())])
            label = f"{sid}" + ("" if run is None else f"/r{run}")
            if res is None:
                print(f"{label:16} (keine Auswertung)")
                continue
            print(f"{label:16} {res['n_takes']:>5} {res['truth']:>5} {res['det']:>5} "
                  f"{res['offset_ms']:>+6}ms {100*res['recall']:>5.0f}% {100*res['precision']:>7.0f}%"
                  f"  ({res['fp']} FP)")
            tot_t += res["truth"]; tot_m += round(res["recall"] * res["truth"])
            tot_d += res["det"]; tot_fp += res["fp"]
        if tot_t:
            print("-" * 64)
            print(f"{'GESAMT':16} {'':5} {tot_t:>5} {tot_d:>5} {'':8} "
                  f"{100*tot_m/tot_t:>5.0f}% {100*(tot_d-tot_fp)/max(tot_d,1):>7.0f}%  ({tot_fp} FP)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
