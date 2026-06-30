#!/usr/bin/env python3
"""Experiment: globale vs. lauf-lokale Pump-Peak-Schwelle — Vergleich über ALLE
Sessions mit Accel-Daten. Produktion bleibt unangetastet (der neue Detektor lebt
hier im Experiment). Vergleicht je Lauf & Session: Pumps, Pump-Frequenz (Hz),
Gleitphasen (Ø/längste), Meter/Pump, Läufe-ohne-Pump.

Befund (Sessions 360/361): die produktive Schwelle ist GLOBAL
`thr = max(0.6·std(ganze Session), 0.08 g)` -> starke Läufe ziehen die Schwelle hoch,
glatte Pump-Läufe (Markus) fallen komplett drunter -> ganze Läufe ohne Marker.
NEU: Schwelle relativ zur LAUF-eigenen Std (+ niedrigerer Boden + Pump-Band-Gate).

Lauf:  DATABASE_URL muss im Env sein (kein SQLite-Fallback):
    cd server && ./.venv/bin/python ../analyse/22_pump_adaptive_compare.py
(parst server/.env selbst).
"""
from __future__ import annotations
import os, sys, json, csv
from pathlib import Path
import numpy as np

# --- server-App importierbar machen + .env laden (manuell, zuverlässig) ---
SERVER = Path(__file__).resolve().parent.parent / "server"
sys.path.insert(0, str(SERVER))
for line in (SERVER / ".env").read_text().splitlines():
    s = line.strip()
    if s and not s.startswith("#") and "=" in s:
        k, v = s.split("=", 1)
        os.environ.setdefault(k, v.strip().strip('"').strip("'"))

from app.db import SessionLocal                       # noqa: E402
from app import models, storage                       # noqa: E402
from app.ml.features import magnitude_g, bandpass_fft, FILTER_BAND, PUMP_BAND  # noqa: E402
from app.ml.pumps import (                            # noqa: E402
    MIN_PEAK_DISTANCE_S, PEAK_PROMINENCE_STD, MIN_PEAK_ABS_G, MIN_RMS, pump_times_ms,
)

OUT = Path(__file__).resolve().parent / "out"
OUT.mkdir(exist_ok=True)

# --- NEU: lauf-lokale Schwelle -------------------------------------------------
NEW_K = PEAK_PROMINENCE_STD     # gleicher Relativfaktor (0.6), aber auf LAUF-Std
NEW_FLOOR = 0.04                # niedrigerer absoluter Boden (statt 0.08)
NEW_RMS_GATE = 0.03             # niedrigeres Pro-Lauf-Gate (statt 0.05 global)


def _greedy_peaks(sig: np.ndarray, fs: float, thr: float) -> np.ndarray:
    """Lokale Maxima > thr, Mindestabstand greedy nach Amplitude (wie _find_peaks)."""
    if sig.size < 3:
        return np.empty(0, dtype=int)
    min_dist = max(int(round(MIN_PEAK_DISTANCE_S * fs)), 1)
    cand = np.where((sig[1:-1] > sig[:-2]) & (sig[1:-1] >= sig[2:]) & (sig[1:-1] > thr))[0] + 1
    if cand.size == 0:
        return cand
    order = cand[np.argsort(-sig[cand])]
    taken: list[int] = []
    blocked = np.zeros(sig.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx))
            lo = max(idx - min_dist, 0); hi = min(idx + min_dist + 1, sig.size)
            blocked[lo:hi] = True
    return np.array(sorted(taken), dtype=int)


def pumps_new_run(filt_run: np.ndarray, fs: float) -> np.ndarray:
    """Pump-Peak-Indizes (relativ zum Lauf) mit LAUF-lokaler Schwelle + Band-Gate."""
    if filt_run.size < 3:
        return np.empty(0, dtype=int)
    rms = float(np.sqrt(np.mean(filt_run * filt_run)))
    if rms < NEW_RMS_GATE:
        return np.empty(0, dtype=int)
    thr = max(NEW_K * np.std(filt_run), NEW_FLOOR)
    return _greedy_peaks(filt_run, fs, thr)


# --- Metriken je Lauf aus Pump-Zeiten (ms, absolut) — wie die Pipeline ---------
def derive(seg: dict, pts_ms: np.ndarray) -> dict:
    dur = seg.get("duration_s") or 0.0
    dist = seg.get("distance_m") or 0.0
    n = int(pts_ms.size)
    d: dict = {"pumps": n}
    d["avg_pump_hz"] = round(n / dur, 3) if dur > 0 and n >= 2 else None
    d["dist_per_pump_m"] = round(dist / n, 1) if n > 0 else None
    d["pumps_per_min"] = round(n / (dur / 60.0), 1) if dur > 0 and n > 0 else None
    if n >= 1:
        ps = np.sort(pts_ms)
        gaps = list(np.diff(ps) / 1000.0)
        lead = (float(ps[0]) - seg["t_start_ms"]) / 1000.0
        tail = (seg["t_end_ms"] - float(ps[-1])) / 1000.0
        glides = [g for g in ([lead] + gaps + [tail]) if g > 0]
        d["num_glides"] = len(glides)
        d["avg_glide_s"] = round(float(np.mean(glides)), 2) if glides else 0.0
        d["longest_glide_s"] = round(float(max(glides)), 2) if glides else 0.0
    else:
        d["num_glides"] = 0; d["avg_glide_s"] = 0.0; d["longest_glide_s"] = 0.0
    return d


def main() -> None:
    db = SessionLocal()
    sessions = db.query(models.Session).filter(models.Session.accel_hz.isnot(None)).all()
    rows = []           # je Lauf
    sess_rows = []      # je Session
    n_sess = n_runs = 0
    val_ok = val_bad = 0   # Validierung: stimmt 'alt' mit dem DB-Wert (seg['pumps']) überein?
    for s in sessions:
        fs = float(s.accel_hz or 0)
        if fs <= 0:
            continue
        ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).first()
        if ar is None or not ar.segments_json:
            continue
        try:
            accel = storage.load_accel(s.session_uuid)
        except Exception:
            continue
        if accel.shape[0] == 0:
            continue
        # WICHTIG: Accel exakt wie die Produktion auf [trim_start, trim_end] zuschneiden,
        # sonst sind die Segment-Zeiten (ms ab getrimmtem Start) gegen das volle Accel
        # versetzt -> falsche Pump-Zahlen. (Validierung unten: 'alt' == DB-Wert.)
        ts0, ts1 = s.trim_start_ms, s.trim_end_ms
        if ts0 is not None or ts1 is not None:
            gps = storage.load_gps(s.session_uuid)
            lo = ts0 if ts0 is not None else 0
            hi = ts1 if ts1 is not None else (gps[-1][0] if gps else 0)
            a_lo = max(int(round(lo / 1000.0 * fs)), 0)
            a_hi = min(int(round(hi / 1000.0 * fs)), accel.shape[0])
            accel = accel[a_lo:a_hi] if a_hi > a_lo else accel[0:0]
            if accel.shape[0] == 0:
                continue
        segs = json.loads(ar.segments_json)
        if not segs:
            continue
        mag = magnitude_g(accel, s.accel_scale)
        filt = bandpass_fft(mag, fs, *FILTER_BAND)
        t_ms = np.arange(mag.size) / fs * 1000.0
        n_sess += 1
        s_old = s_new = s_zero_old = s_zero_new = 0
        for i, seg in enumerate(segs):
            n_runs += 1
            a = int(seg["t_start_ms"] / 1000 * fs); b = min(int(seg["t_end_ms"] / 1000 * fs), filt.size)
            # ALT: globale Schwelle (produktiv) innerhalb der Segment-Maske
            segmask = (t_ms >= seg["t_start_ms"]) & (t_ms <= seg["t_end_ms"])
            old_pts = pump_times_ms(mag, fs, mask=segmask)
            # NEU: lauf-lokal
            run = filt[a:b] if b > a else filt[0:0]
            new_idx = pumps_new_run(run, fs)
            new_pts = (a + new_idx) / fs * 1000.0
            do = derive(seg, old_pts); dn = derive(seg, new_pts)
            stored = seg.get("pumps")
            if stored is not None:
                if do["pumps"] == int(stored): val_ok += 1
                else: val_bad += 1
            s_old += do["pumps"]; s_new += dn["pumps"]
            s_zero_old += int(do["pumps"] == 0); s_zero_new += int(dn["pumps"] == 0)
            rows.append({
                "session": s.id, "run": i, "dur_s": round(seg.get("duration_s") or 0, 1),
                "dist_m": round(seg.get("distance_m") or 0, 1),
                "pumps_old": do["pumps"], "pumps_new": dn["pumps"],
                "ppm_old": do["pumps_per_min"], "ppm_new": dn["pumps_per_min"],
                "hz_old": do["avg_pump_hz"], "hz_new": dn["avg_pump_hz"],
                "mpp_old": do["dist_per_pump_m"], "mpp_new": dn["dist_per_pump_m"],
                "glide_old": do["avg_glide_s"], "glide_new": dn["avg_glide_s"],
                "longglide_old": do["longest_glide_s"], "longglide_new": dn["longest_glide_s"],
            })
        sess_rows.append({"session": s.id, "runs": len(segs), "pumps_old": s_old, "pumps_new": s_new,
                          "zero_old": s_zero_old, "zero_new": s_zero_new})

    # CSV schreiben
    with open(OUT / "pump_compare_runs.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)
    with open(OUT / "pump_compare_sessions.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(sess_rows[0].keys())); w.writeheader(); w.writerows(sess_rows)

    # --- Zusammenfassung ---
    def med(xs): xs = [x for x in xs if x is not None]; return round(float(np.median(xs)), 2) if xs else None
    tot_old = sum(r["pumps_old"] for r in rows); tot_new = sum(r["pumps_new"] for r in rows)
    zero_old = sum(1 for r in rows if r["pumps_old"] == 0)
    zero_new = sum(1 for r in rows if r["pumps_new"] == 0)
    flipped = sum(1 for r in rows if r["pumps_old"] == 0 and r["pumps_new"] > 0)
    print(f"\nValidierung 'alt' == DB-Wert: {val_ok} ok / {val_bad} abweichend  (sollte 0 abweichend sein)")
    print(f"Sessions mit Accel: {n_sess}   Läufe gesamt: {n_runs}")
    print(f"Pumps gesamt:        alt {tot_old:>7}   neu {tot_new:>7}   ({tot_new/max(tot_old,1)*100:.0f} %)")
    print(f"Läufe OHNE Pump:     alt {zero_old:>7}   neu {zero_new:>7}   (davon {flipped} Läufe alt=0 -> neu>0)")
    print(f"Median Pumps/min:    alt {med([r['ppm_old'] for r in rows])}   neu {med([r['ppm_new'] for r in rows])}")
    print(f"Median Pump-Hz:      alt {med([r['hz_old'] for r in rows])}   neu {med([r['hz_new'] for r in rows])}")
    print(f"Median m/Pump:       alt {med([r['mpp_old'] for r in rows])}   neu {med([r['mpp_new'] for r in rows])}")
    print(f"Median Ø-Glide [s]:  alt {med([r['glide_old'] for r in rows])}   neu {med([r['glide_new'] for r in rows])}")
    print(f"Median längste Glide:alt {med([r['longglide_old'] for r in rows])}   neu {med([r['longglide_new'] for r in rows])}")
    print(f"\nCSV: {OUT/'pump_compare_runs.csv'} , {OUT/'pump_compare_sessions.csv'}")


if __name__ == "__main__":
    main()
