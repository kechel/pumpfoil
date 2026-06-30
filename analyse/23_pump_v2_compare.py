#!/usr/bin/env python3
"""Experiment v2: Pump-Erkennung auf dem VERTIKALEN Signal gegen die Schwerkraft
(Aufwärts-Push) statt auf dem orientierungslosen |Betrag|. Vergleich über alle
Accel-Sessions: alt(global,|mag|) / lokal(|mag|,lauf-lokal) / v2(vertikal) /
v2asym(vertikal + Asymmetrie „schnell hoch, langsam runter").

Produktion bleibt unangetastet. DATABASE_URL via server/.env (kein SQLite).
    cd server && ./.venv/bin/python ../analyse/23_pump_v2_compare.py
"""
from __future__ import annotations
import os, sys, json, csv
from pathlib import Path
import numpy as np
from scipy.signal import butter, filtfilt

SERVER = Path(__file__).resolve().parent.parent / "server"
sys.path.insert(0, str(SERVER))
for line in (SERVER / ".env").read_text().splitlines():
    s = line.strip()
    if s and not s.startswith("#") and "=" in s:
        k, v = s.split("=", 1); os.environ.setdefault(k, v.strip().strip('"').strip("'"))

from app.db import SessionLocal                                            # noqa: E402
from app import models, storage                                           # noqa: E402
from app.ml.features import magnitude_g, bandpass_fft, FILTER_BAND        # noqa: E402
from app.ml.pumps import MIN_PEAK_DISTANCE_S, PEAK_PROMINENCE_STD, pump_times_ms  # noqa: E402

OUT = Path(__file__).resolve().parent / "out"; OUT.mkdir(exist_ok=True)
K = PEAK_PROMINENCE_STD     # 0.6
FLOOR = 0.04
RMS_GATE = 0.03


def trimmed_accel(s):
    fs = float(s.accel_hz); acc = storage.load_accel(s.session_uuid)
    if acc.shape[0] == 0:
        return fs, acc
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    if ts0 is not None or ts1 is not None:
        gps = storage.load_gps(s.session_uuid)
        lo = ts0 if ts0 is not None else 0
        hi = ts1 if ts1 is not None else (gps[-1][0] if gps else 0)
        a_lo = max(int(round(lo / 1000.0 * fs)), 0); a_hi = min(int(round(hi / 1000.0 * fs)), acc.shape[0])
        acc = acc[a_lo:a_hi] if a_hi > a_lo else acc[0:0]
    return fs, acc


def vertical_signal(acc_raw, scale, fs):
    """Vertikale Dynamik gegen die Schwerkraft (>0 = aufwärts). Schwerkraft = Tiefpass."""
    a = acc_raw.astype(float) / scale
    b, c = butter(2, 0.25 / (fs / 2), "low")
    g = filtfilt(b, c, a, axis=0)
    gn = g / np.clip(np.linalg.norm(g, axis=1, keepdims=True), 1e-6, None)
    return np.sum((a - g) * gn, axis=1)


def greedy(sig, fs, thr):
    md = max(int(round(MIN_PEAK_DISTANCE_S * fs)), 1)
    cand = np.where((sig[1:-1] > sig[:-2]) & (sig[1:-1] >= sig[2:]) & (sig[1:-1] > thr))[0] + 1
    if cand.size == 0:
        return cand
    order = cand[np.argsort(-sig[cand])]; taken = []; bl = np.zeros(sig.size, bool)
    for i in order:
        if not bl[i]:
            taken.append(int(i)); bl[max(i - md, 0):min(i + md + 1, sig.size)] = True
    return np.array(sorted(taken), int)


def peaks_local(run, fs):
    if run.size < 3 or np.sqrt(np.mean(run * run)) < RMS_GATE:
        return np.empty(0, int)
    return greedy(run, fs, max(K * np.std(run), FLOOR))


def peaks_asym(run, fs):
    """Wie peaks_local, aber nur Aufwärts-Pushes mit Anstieg<=Abfall (schnell hoch, langsam runter)."""
    pk = peaks_local(run, fs)
    if pk.size == 0:
        return pk
    keep = []
    for p in pk:
        # vorheriges/nächstes lokales Minimum suchen (Talsohle)
        l = p
        while l > 0 and run[l - 1] < run[l]:
            l -= 1
        r = p
        while r < run.size - 1 and run[r + 1] < run[r]:
            r += 1
        rise = p - l; fall = r - p
        if rise > 0 and fall >= rise:      # Abfall mindestens so lang wie Anstieg
            keep.append(p)
    return np.array(keep, int)


def main():
    db = SessionLocal()
    rows = []; val_ok = val_bad = 0; n_sess = 0
    for s in db.query(models.Session).filter(models.Session.accel_hz.isnot(None)).all():
        fs, acc = trimmed_accel(s)
        if fs <= 0 or acc.shape[0] == 0:
            continue
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        if ar is None or not ar.segments_json:
            continue
        segs = json.loads(ar.segments_json)
        if not segs:
            continue
        n_sess += 1
        mag = magnitude_g(acc, s.accel_scale)
        magf = bandpass_fft(mag, fs, *FILTER_BAND)
        t_ms = np.arange(mag.size) / fs * 1000.0
        vf = bandpass_fft(vertical_signal(acc, s.accel_scale, fs), fs, *FILTER_BAND)
        for i, seg in enumerate(segs):
            a = int(seg["t_start_ms"] / 1000 * fs); b = min(int(seg["t_end_ms"] / 1000 * fs), magf.size)
            if b <= a:
                continue
            old = int(pump_times_ms(mag, fs, mask=(t_ms >= seg["t_start_ms"]) & (t_ms <= seg["t_end_ms"])).size)
            loc = int(peaks_local(magf[a:b], fs).size)
            v2 = int(peaks_local(vf[a:b], fs).size)
            v2a = int(peaks_asym(vf[a:b], fs).size)
            stored = seg.get("pumps")
            if stored is not None:
                val_ok += int(old == int(stored)); val_bad += int(old != int(stored))
            dur = seg.get("duration_s") or 0.0
            rows.append({"session": s.id, "run": i, "dur_s": round(dur, 1),
                         "old": old, "local": loc, "v2": v2, "v2asym": v2a,
                         "ppm_old": round(old / (dur / 60), 1) if dur else 0,
                         "ppm_v2": round(v2 / (dur / 60), 1) if dur else 0,
                         "ppm_v2asym": round(v2a / (dur / 60), 1) if dur else 0})
    with open(OUT / "pump_v2_runs.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

    def tot(k): return sum(r[k] for r in rows)
    def zero(k): return sum(1 for r in rows if r[k] == 0)
    def med(k): xs = [r[k] for r in rows if r[k] > 0]; return round(float(np.median(xs)), 1) if xs else 0
    print(f"\nValidierung old==DB: {val_ok} ok / {val_bad} bad")
    print(f"Sessions {n_sess}  Läufe {len(rows)}\n")
    print(f"{'Variante':<10} {'Pumps':>7} {'Läufe=0':>8} {'Median ppm':>11}")
    for k in ("old", "local", "v2", "v2asym"):
        print(f"{k:<10} {tot(k):>7} {zero(k):>8} {med('ppm_'+k) if 'ppm_'+k in rows[0] else med(k):>11}")
    # Markus separat
    mk = [r for r in rows if r["session"] in (360, 361)]
    print("\nMarkus 360/361:")
    for k in ("old", "local", "v2", "v2asym"):
        print(f"  {k:<8} pumps {sum(r[k] for r in mk):>5}  Läufe=0 {sum(1 for r in mk if r[k]==0):>2}")
    print(f"\nCSV: {OUT/'pump_v2_runs.csv'}")


if __name__ == "__main__":
    main()
