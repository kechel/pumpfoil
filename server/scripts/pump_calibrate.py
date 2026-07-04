"""Read-only Pump-Kalibrierung gegen die run_pumps-Wahrheit der Label-App-FITs.

Pro gelabeltem Lauf (lap.run_pumps) wird unser find_pumps_local auf GENAU dem
Lap-Accel-Fenster gerechnet und mit run_pumps verglichen. Erst Ist-Stand, dann
k-Sweep (Schwellen-Faktor). Aendert NICHTS an der Pipeline.

Aufruf: .venv/bin/python -m scripts.pump_calibrate
"""
from __future__ import annotations

import glob

import numpy as np
import fitparse

from app.fitimport import _accel_msg_time, accel_from_messages
from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
from app.ml import pumps

FITS = "/home/jan/garmin-connect-iq/analyse/train_foil_status/*.fit"
SCALE = 2048


def _dur_s(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v)
    if ":" in s:
        parts = [float(x) for x in s.split(":")]
        sec = 0.0
        for p in parts:
            sec = sec * 60 + p
        return sec
    try:
        return float(s)
    except ValueError:
        return None


def load(path):
    fit = fitparse.FitFile(open(path, "rb").read())
    accel_msgs, laps = [], []
    for m in fit.get_messages():
        if m.name == "accelerometer_data":
            accel_msgs.append({d.name: d.value for d in m})
        elif m.name == "lap":
            laps.append({d.name: d.value for d in m})
    if not accel_msgs:
        return None
    a_bytes, hz = accel_from_messages(accel_msgs)
    accel = np.frombuffer(a_bytes, dtype="<i2")
    accel = accel[: (accel.size // 3) * 3].reshape(-1, 3)
    a0 = _accel_msg_time(accel_msgs[0])
    if a0 is not None and a0.tzinfo is not None:
        a0 = a0.replace(tzinfo=None)   # naiv (wie lap.start_time), gleiche UTC-Basis
    # eindeutige Laeufe mit run_pumps (Duplikate nach start_time entfernen)
    seen = set(); runs = []
    for lp in laps:
        rp = lp.get("run_pumps"); st = lp.get("start_time"); dur = _dur_s(lp.get("run_duration"))
        if rp is None or st is None or dur is None or dur <= 0:
            continue
        key = (st, rp)
        if key in seen:
            continue
        seen.add(key)
        runs.append((st, dur, int(rp)))
    return accel, float(hz), a0, runs


def measure(k):
    files = sorted(glob.glob(FITS))
    rows = []
    for f in files:
        r = load(f)
        if r is None:
            continue
        accel, hz, a0, runs = r
        vsig = bandpass_fft(vertical_against_gravity(accel, SCALE, hz), hz, *FILTER_BAND)
        for st, dur, truth in runs:
            if getattr(st, "tzinfo", None) is not None:
                st = st.replace(tzinfo=None)
            i_lo = int(round((st - a0).total_seconds() * hz))
            i_hi = i_lo + int(round(dur * hz))
            i_lo = max(i_lo, 0); i_hi = min(i_hi, vsig.size)
            if i_hi - i_lo < hz:      # < 1 s Fenster -> Alignment daneben
                continue
            ours = int(pumps.find_pumps_local(vsig[i_lo:i_hi], hz, k=k).size)
            rows.append((truth, ours))
    return rows


def stats(rows):
    t = np.array([r[0] for r in rows], float); o = np.array([r[1] for r in rows], float)
    err = o - t
    mae = np.mean(np.abs(err))
    bias = np.mean(err)
    ratio = o.sum() / max(t.sum(), 1)
    # mittlerer relativer Fehler pro Lauf
    rel = np.mean(np.abs(err) / np.maximum(t, 1))
    return dict(n=len(rows), truth=int(t.sum()), ours=int(o.sum()), ratio=ratio,
               mae=mae, bias=bias, rel=rel)


def main():
    base = measure(0.6)
    if not base:
        print("Keine ausrichtbaren Laeufe — Alignment pruefen."); return
    s = stats(base)
    print(f"IST-STAND (k=0.6, aktuell):")
    print(f"  {s['n']} Laeufe ausgerichtet | Wahrheit Σ{s['truth']} vs unser Σ{s['ours']} "
          f"(Verhaeltnis {s['ratio']:.2f})")
    print(f"  MAE {s['mae']:.1f} Pumps/Lauf | Bias {s['bias']:+.1f} | rel. Fehler {s['rel']*100:.0f}%\n")
    print("k-Sweep (Schwellen-Faktor):")
    print(f"  {'k':>5} {'Σours':>7} {'ratio':>6} {'MAE':>6} {'bias':>7} {'rel%':>6}")
    for k in (0.3, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8):
        s = stats(measure(k))
        print(f"  {k:>5} {s['ours']:>7} {s['ratio']:>6.2f} {s['mae']:>6.1f} {s['bias']:>+7.1f} {s['rel']*100:>5.0f}%")


if __name__ == "__main__":
    main()
