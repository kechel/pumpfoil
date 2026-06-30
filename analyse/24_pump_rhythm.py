#!/usr/bin/env python3
"""Experiment v3: sanftes Pumpen über Pump-Band-RHYTHMIK erkennen (zusätzlich zur Amplitude).

v2 (produktiv) = vertikal gegen g + lauf-lokale Schwelle max(k·std, 0.04 g). Problem: sehr
sanftes, aber rhythmisches Pumpen (Markus) liegt unter dem 0.04-g-Boden -> ganze Abschnitte
ohne Marker -> unrealistisch lange „Glides" mitten im Lauf (z. B. 361 run26: 30 s).

v3 = v2, aber der absolute Boden wird dort abgesenkt, wo eine klare Pump-Band-Periodik
(0.5–2 Hz) vorliegt (rollende spektrale Peakedness). In rhythmuslosen Abschnitten (echtes
Gleiten/Rauschen) bleibt der hohe Boden -> kein Über-Zählen.

QA-Metrik: längste INTERNE Lücke (zwischen zwei Pumps) je Lauf. Ein langer interner Glide in
einem Foiling-Lauf = mit hoher Sicherheit verpasste Pumps. Ziel: solche Läufe reduzieren,
ohne die Gesamt-Pumps in klaren Läufen aufzublähen.

    cd server && ./.venv/bin/python ../analyse/24_pump_rhythm.py
"""
from __future__ import annotations
import os, sys, json
from pathlib import Path
import numpy as np

SERVER = Path(__file__).resolve().parent.parent / "server"
sys.path.insert(0, str(SERVER))
for line in (SERVER / ".env").read_text().splitlines():
    s = line.strip()
    if s and not s.startswith("#") and "=" in s:
        k, v = s.split("=", 1); os.environ.setdefault(k, v.strip().strip('"').strip("'"))

from app.db import SessionLocal                                              # noqa: E402
from app import models, storage                                             # noqa: E402
from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND, PUMP_BAND  # noqa: E402
from app.ml.pumps import MIN_PEAK_DISTANCE_S, PEAK_PROMINENCE_STD, find_pumps_local  # noqa: E402

FLOOR_HI = 0.04      # wie v2
FLOOR_LO = 0.015     # in klar rhythmischen Abschnitten
RMS_GATE = 0.03
RHYTHM_WIN_S = 6.0
RHYTHM_HOP_S = 1.0
RHYTHM_ON = 0.45     # Peakedness-Schwelle: darüber gilt der Abschnitt als rhythmisch


def trimmed_accel(s):
    fs = float(s.accel_hz); acc = storage.load_accel(s.session_uuid)
    if acc.shape[0] == 0:
        return fs, acc
    ts0, ts1 = s.trim_start_ms, s.trim_end_ms
    if ts0 is not None or ts1 is not None:
        gps = storage.load_gps(s.session_uuid)
        lo = ts0 if ts0 is not None else 0; hi = ts1 if ts1 is not None else (gps[-1][0] if gps else 0)
        a_lo = max(int(round(lo / 1000.0 * fs)), 0); a_hi = min(int(round(hi / 1000.0 * fs)), acc.shape[0])
        acc = acc[a_lo:a_hi] if a_hi > a_lo else acc[0:0]
    return fs, acc


def rhythmicity(sig, fs):
    """Pro-Sample [0..1]: Anteil der Spektral-Energie im Pump-Band (0.5–2 Hz) am
    Gesamt-Band (0.3–3 Hz), in rollenden Fenstern (spektrale 'Peakedness')."""
    n = sig.size
    if n < int(RHYTHM_WIN_S * fs):
        return np.zeros(n)
    w = int(RHYTHM_WIN_S * fs); hop = max(int(RHYTHM_HOP_S * fs), 1)
    centers, vals = [], []
    for start in range(0, n - w + 1, hop):
        seg = sig[start:start + w]
        spec = np.abs(np.fft.rfft(seg * np.hanning(w))) ** 2
        f = np.fft.rfftfreq(w, 1.0 / fs)
        tot = spec[(f >= FILTER_BAND[0]) & (f <= FILTER_BAND[1])].sum()
        pmp = spec[(f >= PUMP_BAND[0]) & (f <= PUMP_BAND[1])].sum()
        centers.append(start + w // 2); vals.append(pmp / tot if tot > 0 else 0.0)
    return np.interp(np.arange(n), centers, vals, left=vals[0], right=vals[-1])


def peaks_v3(run, fs):
    if run.size < 3 or float(np.sqrt(np.mean(run * run))) < RMS_GATE:
        return np.empty(0, int)
    rh = rhythmicity(run, fs)
    floor = np.where(rh >= RHYTHM_ON, FLOOR_LO, FLOOR_HI)
    thr = np.maximum(PEAK_PROMINENCE_STD * np.std(run), floor)
    md = max(int(round(MIN_PEAK_DISTANCE_S * fs)), 1)
    cand = np.where((run[1:-1] > run[:-2]) & (run[1:-1] >= run[2:]) & (run[1:-1] > thr[1:-1]))[0] + 1
    if cand.size == 0:
        return cand
    order = cand[np.argsort(-run[cand])]; taken = []; bl = np.zeros(run.size, bool)
    for i in order:
        if not bl[i]:
            taken.append(int(i)); bl[max(i - md, 0):min(i + md + 1, run.size)] = True
    return np.array(sorted(taken), int)


def max_internal_gap_s(idx, fs):
    if idx.size < 2:
        return 0.0
    return float(np.max(np.diff(idx)) / fs)


def main():
    db = SessionLocal()
    tot2 = tot3 = 0; runs = 0
    bad2 = bad3 = 0   # Läufe mit interner Lücke > 6 s (unplausibel)
    GAP = 6.0
    worst = []
    for s in db.query(models.Session).filter(models.Session.accel_hz.isnot(None)).all():
        fs, acc = trimmed_accel(s)
        if fs <= 0 or acc.shape[0] == 0:
            continue
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        if ar is None or not ar.segments_json:
            continue
        vf = bandpass_fft(vertical_against_gravity(acc, s.accel_scale, fs), fs, *FILTER_BAND)
        for i, seg in enumerate(json.loads(ar.segments_json)):
            a = int(seg["t_start_ms"] / 1000 * fs); b = min(int(seg["t_end_ms"] / 1000 * fs), vf.size)
            if b <= a:
                continue
            run = vf[a:b]; runs += 1
            p2 = find_pumps_local(run, fs); p3 = peaks_v3(run, fs)
            tot2 += p2.size; tot3 += p3.size
            g2 = max_internal_gap_s(p2, fs); g3 = max_internal_gap_s(p3, fs)
            if g2 > GAP:
                bad2 += 1
            if g3 > GAP:
                bad3 += 1
            if g2 > 10:
                worst.append((g2, g3, s.id, i, p2.size, p3.size))
    print(f"Läufe {runs}")
    print(f"Pumps gesamt:           v2 {tot2}   v3 {tot3}   (+{tot3-tot2})")
    print(f"Läufe mit Lücke >6s:    v2 {bad2}   v3 {bad3}")
    worst.sort(reverse=True)
    print("\nGrößte interne Lücken v2 -> v3 (Session/run, Pumps v2->v3):")
    for g2, g3, sid, ri, n2, n3 in worst[:15]:
        print(f"  s{sid} run{ri}: Lücke {g2:.0f}s -> {g3:.0f}s   pumps {n2}->{n3}   https://pumpfoil.org/sessions/{sid}?run={ri}")


if __name__ == "__main__":
    main()
