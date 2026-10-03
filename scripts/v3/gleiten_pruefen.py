#!/usr/bin/env python3
"""Gleitphasen der Uhr gegen das Brett pruefen. REIN LESEND (Jan, 03.10.2026: „Glides > 10 s
ausschliessen … koennen wir das vorher testen/verifizieren?").

Uhr: Pump-Zeitpunkte je gespeichertem Lauf, gerechnet wie `run_analysis` (vertikales Signal gegen die
Schwerkraft, Bandpass, `find_pumps_cadence`; Accel auf das gleichmaessige Raster des Zuschnitts).
Gleitphase = Luecke zwischen zwei Pumps >= 1 s. Brett: Pump-Gipfel aus dem Nicken
(`brett_wahrheit.brett`), Zeitversatz aus data/ml/v3/paare.json (nur Paare mit Streuung <= 400 ms).
Eine Uhr-Gleitphase gilt als BESTAETIGT, wenn das Brett darin (mit RAND ms Abstand zu den Grenzen)
keinen Pump hat. Ausgabe: je Laengen-Klasse bestaetigt / Brett-Pumps je Sekunde.
Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/gleiten_pruefen.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json
import pathlib
import sys
import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WURZEL / "server"))
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
RAND = 400
KLASSEN = [(1, 1.25), (1.25, 1.5), (1.5, 2), (2, 3), (3, 5), (5, 10), (10, 15), (15, 999)]


def uhr_pumps(db, sid):
    """-> Liste je Lauf: (t_start, t_end, Pump-Zeiten) in Session-ms."""
    from app import models, storage
    from app.analysis import FILTER_BAND
    from app.analysis.timebase import _accel_chunk_counts, build_timebase
    from app.ml.features import bandpass_fft, vertical_against_gravity
    from app.ml.pumps import find_pumps_cadence
    s = db.get(models.Session, sid)
    gps = storage.load_gps(s.session_uuid); acc = storage.load_accel(s.session_uuid)
    lo = s.trim_start_ms or 0
    hi = s.trim_end_ms if s.trim_end_ms is not None else gps[-1][0]
    tb = build_timebase(gps, acc, s.accel_scale, s.accel_hz, chunk_counts=_accel_chunk_counts(s.session_uuid),
                        t0_by_index=storage.load_accel_t0(s.session_uuid), trim_start_ms=lo, trim_end_ms=hi,
                        excluded_ranges=None)
    fs = round(float(tb.accel_hz), 3)
    src = tb.t_accel_ms - float(lo)
    grid = np.arange(int(max(hi - lo, 0) / 1000.0 * fs) + 1) / fs * 1000.0
    a = tb.accel[np.clip(np.searchsorted(src, grid), 0, src.size - 1)]
    vsig = bandpass_fft(vertical_against_gravity(a, s.accel_scale, fs), fs, *FILTER_BAND)
    out = []
    for seg in json.loads(s.result.segments_json or "[]"):
        a_lo = max(int(round(seg["t_start_ms"] / 1000.0 * fs)), 0)
        a_hi = min(int(round(seg["t_end_ms"] / 1000.0 * fs)), vsig.size)
        idx = find_pumps_cadence(vsig[a_lo:a_hi], fs) if a_hi > a_lo else np.empty(0, int)
        off = seg["t_start_session_ms"] - seg["t_start_ms"]
        out.append((seg["t_start_session_ms"], seg["t_end_session_ms"], np.sort((a_lo + idx) / fs * 1000.0 + off)))
    return out


def main():
    import brett_wahrheit as BW
    from app.db import SessionLocal
    paare = [p for p in json.load(open(WURZEL / "server/data/ml/v3/paare.json")) if p["streuung_ms"] <= 400]
    db = SessionLocal()
    zeilen = []
    for p in paare:
        b = BW.brett(db, p["brett"])
        bp = np.sort(b["pumps"])
        for t0, t1, ps in uhr_pumps(db, p["uhr"]):
            for k in range(ps.size - 1):
                g = (ps[k + 1] - ps[k]) / 1000.0
                if g < 1.0:
                    continue
                x, y = ps[k] + p["versatz_ms"] + RAND, ps[k + 1] + p["versatz_ms"] - RAND
                n = int(((bp > x) & (bp < y)).sum())
                zeilen.append((g, n, p["uhr"], p["brett"]))
        print(f"#{p['uhr']} gegen Brett #{p['brett']}: {sum(1 for z in zeilen if z[2] == p['uhr'] and z[3] == p['brett'])} Gleitphasen >= 1 s", flush=True)
    db.close()
    print(f"\n{'Laenge':>8} {'Anzahl':>7} {'Brett 0 Pumps':>14} {'Brett-Pumps/s':>14}")
    for lo_, hi_ in KLASSEN:
        z = [x for x in zeilen if lo_ <= x[0] < hi_]
        if not z:
            continue
        ok = sum(1 for x in z if x[1] == 0)
        rate = sum(x[1] for x in z) / max(sum(x[0] for x in z), 1e-9)
        print(f"{lo_:>4}-{hi_:<4}s {len(z):>7} {ok:>6} ({ok / len(z) * 100:3.0f} %) {rate:>14.2f}")


if __name__ == "__main__":
    main()
