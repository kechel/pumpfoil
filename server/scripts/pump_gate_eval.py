"""Read-only-Vergleich verschiedener Pump-Gate-Strategien für find_pumps_cadence.

Motivation: das feste RMS-Gate (PUMP_CAD_GATE) verwirft bei leichten/sanften Fahrern
ganze rhythmische Abschnitte -> aufgeblähte "Gleitphasen" (Befund Session 521, Alex).

Strategien:
  - fixed <g>          : absolutes RMS-Gate (Ist-Stand = 0.02, Quick-Win = 0.012)
  - periodicity <t,f>  : amplituden-UNABHÄNGIG — Fenster gilt als rhythmisch, wenn die
                         normierte Autokorrelation im Pump-Perioden-Lag >= t liegt
                         (+ winziger RMS-Floor f gegen reines Sensorrauschen).

Prüft (1) gegen die run_pumps-Ground-Truth der Label-App-FITs und (2) breit gegen
zufällige DB-Sessions (Σ Pumps + Anzahl Läufe mit langer "Gleitphase").

ÄNDERT NICHTS an der Pipeline/DB. Aufruf: .venv/bin/python -m scripts.pump_gate_eval
"""
from __future__ import annotations

import glob
import json

import numpy as np

from app.db import SessionLocal
from app import models, storage
from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
from app.ml.pumps import PUMP_CAD_WIN_S, PUMP_CAD_BAND, _dom_pump_freq
from scripts.pump_calibrate import load  # Ground-Truth-Loader (FIT -> accel + run_pumps)

FITS = "/home/jan/garmin-connect-iq/analyse/train_foil_status/*.fit"
SCALE = 2048


def _periodicity(seg: np.ndarray, fs: float, blo: float, bhi: float) -> float:
    """Normierte Autokorrelations-Spitze im Pump-Perioden-Lag (0..1), amplituden-unabhängig."""
    n = seg.size
    if n < fs:
        return 0.0
    x = seg - seg.mean()
    denom = float(np.dot(x, x))
    if denom <= 1e-12:
        return 0.0
    lag_lo = max(int(round(fs / bhi)), 1)
    lag_hi = min(int(round(fs / blo)), n - 1)
    best = 0.0
    for lag in range(lag_lo, lag_hi + 1):
        ac = float(np.dot(x[:-lag], x[lag:])) / denom
        if ac > best:
            best = ac
    return best


def find_pumps(sig: np.ndarray, fs: float, strategy: tuple,
               win_s: float = PUMP_CAD_WIN_S, band: tuple = PUMP_CAD_BAND) -> np.ndarray:
    """Wie find_pumps_cadence, aber mit wählbarem Fenster-Gate (fixed | periodicity)."""
    sig = np.asarray(sig, dtype=float)
    n = sig.size
    blo, bhi = band
    if n < fs:
        return np.empty(0, dtype=int)
    w = max(int(round(win_s * fs)), 1)
    hop = max(int(round(0.5 * fs)), 1)
    rms_ok = np.zeros(n, dtype=bool)
    for pos in range(0, n, hop):
        seg = sig[pos:pos + w]
        if seg.size < fs:
            continue
        if strategy[0] == "fixed":
            ok = float(np.sqrt(np.mean(seg * seg))) >= strategy[1]
        else:  # periodicity: (t_ac, rms_floor)
            ok = (_periodicity(seg, fs, blo, bhi) >= strategy[1]
                  and float(np.sqrt(np.mean(seg * seg))) >= strategy[2])
        if ok:
            rms_ok[pos:min(pos + hop, n)] = True
    peaks: list[int] = []
    i = 0
    while i < n:
        if not rms_ok[i]:
            i += 1
            continue
        j = i
        while j < n and rms_ok[j]:
            j += 1
        if j - i >= fs:
            pos = i
            while pos < j:
                lo = max(pos - w // 2, i)
                hi = min(pos + w // 2, j)
                f = _dom_pump_freq(sig[lo:hi], fs, blo, bhi)
                if f <= 0:
                    break
                T = max(int(round(fs / f)), 1)
                seg = sig[pos:min(pos + T, j)]
                if seg.size > 0:
                    peaks.append(pos + int(np.argmax(seg)))
                pos += T
        i = j
    return np.array(sorted(set(peaks)), dtype=int)


STRATEGIES = {
    "fixed 0.020 (alt)":  ("fixed", 0.020),
    "fixed 0.012 (neu)":  ("fixed", 0.012),
    "fixed 0.008":        ("fixed", 0.008),
    "period t.30 f.004":  ("period", 0.30, 0.004),
    "period t.40 f.004":  ("period", 0.40, 0.004),
    "period t.50 f.004":  ("period", 0.50, 0.004),
}


def eval_ground_truth():
    rows = {k: [] for k in STRATEGIES}
    files = sorted(glob.glob(FITS))
    for f in files:
        r = load(f)
        if r is None:
            continue
        accel, hz, a0, runs = r
        vsig = bandpass_fft(vertical_against_gravity(accel, SCALE, hz), hz, *FILTER_BAND)
        for st, dur, truth in runs:
            if getattr(st, "tzinfo", None) is not None:
                st = st.replace(tzinfo=None)
            i_lo = max(int(round((st - a0).total_seconds() * hz)), 0)
            i_hi = min(i_lo + int(round(dur * hz)), vsig.size)
            if i_hi - i_lo < hz:
                continue
            seg = vsig[i_lo:i_hi]
            for k, strat in STRATEGIES.items():
                rows[k].append((truth, int(find_pumps(seg, hz, strat).size)))
    print(f"== GROUND TRUTH ({len(rows['fixed 0.020 (alt)'])} Läufe, {len(files)} FITs) ==")
    print(f"{'Strategie':<19} {'Σtruth':>7} {'Σours':>7} {'ratio':>6} {'MAE':>6} {'bias':>7} {'rel%':>6}")
    for k in STRATEGIES:
        t = np.array([x[0] for x in rows[k]], float)
        o = np.array([x[1] for x in rows[k]], float)
        err = o - t
        print(f"{k:<19} {int(t.sum()):>7} {int(o.sum()):>7} {o.sum()/max(t.sum(),1):>6.2f} "
              f"{np.mean(np.abs(err)):>6.1f} {np.mean(err):>+7.1f} "
              f"{np.mean(np.abs(err)/np.maximum(t,1))*100:>5.0f}%")


def _glide_max(pts_ms, t0, t1):
    if pts_ms.size == 0:
        return (t1 - t0) / 1000.0
    ps = np.sort(pts_ms)
    g = [x for x in ([(ps[0]-t0)/1000] + list(np.diff(ps)/1000) + [(t1-ps[-1])/1000]) if x > 0]
    return max(g) if g else 0.0


def _load_for_analysis(s):
    """Spiegelt run_analysis: effektive Accel-Rate + Trim (sonst falsche Ausrichtung!)."""
    gps = storage.load_gps(s.session_uuid)
    accel = storage.load_accel(s.session_uuid)
    fs = float(s.accel_hz)
    if accel.shape[0] and gps and gps[-1][0] > 0 and s.accel_hz:
        real = accel.shape[0] / (gps[-1][0] / 1000.0)
        if abs(real - s.accel_hz) / s.accel_hz > 0.25:
            fs = round(real, 2)
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    if (ts0 is not None or ts1 is not None) and gps:
        lo = ts0 if ts0 is not None else 0
        hi = ts1 if ts1 is not None else gps[-1][0]
        a_lo = max(int(round(lo / 1000.0 * fs)), 0)
        a_hi = min(int(round(hi / 1000.0 * fs)), accel.shape[0])
        accel = accel[a_lo:a_hi] if a_hi > a_lo else accel[0:0]
    return accel, fs


def eval_db():
    db = SessionLocal()
    S, AR = models.Session, models.AnalysisResult
    sess = (db.query(S).join(AR, AR.session_id == S.id)
            .filter(S.deleted.isnot(True), AR.detection == "model", AR.num_runs > 0)
            .order_by(S.id).all())
    agg = {k: {"pumps": 0, "g5": 0, "g8": 0} for k in STRATEGIES}
    n = 0
    for s in sess:
        try:
            accel, fs = _load_for_analysis(s)
        except Exception:
            continue
        if accel.shape[0] < fs * 3 or not s.result.segments_json:
            continue
        vsig = bandpass_fft(vertical_against_gravity(accel, s.accel_scale, fs), fs, *FILTER_BAND)
        segs = json.loads(s.result.segments_json)
        n += 1
        for sg in segs:
            a_lo = max(int(round(sg["t_start_ms"] / 1000 * fs)), 0)
            a_hi = min(int(round(sg["t_end_ms"] / 1000 * fs)), vsig.size)
            if a_hi <= a_lo:
                continue
            seg = vsig[a_lo:a_hi]
            # Gleit-Enden auf die Accel-Abdeckung begrenzen (wie run_analysis) — accel-loser
            # Schwanz zählt NICHT als Gleit.
            acc_start_ms = a_lo / fs * 1000.0
            acc_end_ms = a_hi / fs * 1000.0
            for k, strat in STRATEGIES.items():
                idx = find_pumps(seg, fs, strat)
                pts = (a_lo + idx) / fs * 1000.0
                agg[k]["pumps"] += idx.size
                gm = _glide_max(pts, acc_start_ms, acc_end_ms)
                if gm > 5:
                    agg[k]["g5"] += 1
                if gm > 8:
                    agg[k]["g8"] += 1
    print(f"\n== BREITE DB ({n} Sessions) ==")
    print(f"{'Strategie':<19} {'Σpumps':>8} {'Läufe glide>5s':>15} {'Läufe glide>8s':>15}")
    for k in STRATEGIES:
        print(f"{k:<19} {agg[k]['pumps']:>8} {agg[k]['g5']:>15} {agg[k]['g8']:>15}")


if __name__ == "__main__":
    eval_ground_truth()
    eval_db()
