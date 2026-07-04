"""Read-only Modell-Experiment (fasst foil_rf.pkl NICHT an).

Vergleicht auf den gelabelten fenix-7X-Pro-FITs (foil_status-Wahrheit):
  - Baseline: heutige 7 Features, per Sekunde
  - Idee 2:   Baseline + zeitliche Glättung (Median-Filter ueber ±w s)
  - Idee 1:   Fenster-Features (±r s der 7 Features aneinandergehaengt), Center-Label
  - Idee 1+:  Fenster + neue Richtungs-/Delta-Features
Metriken je Variante (Leave-one-file-out): Sekunden-P/R/F1 UND Fragmentierung
(vorhergesagte Laeufe >=5 s vs. wahre Laeufe = misst das 'Zerstueckeln').

Aufruf: DATABASE_URL=... .venv/bin/python -m scripts.foil_model_experiment
"""
from __future__ import annotations

import glob
import math

import numpy as np
import fitparse
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, precision_score, recall_score

from app.analysis.foil_model import extract_features
from app.fitimport import _accel_msg_time, _record_time, accel_from_messages, gps_from_records

FITS = "/home/jan/garmin-connect-iq/analyse/train_foil_status/*.fit"
MIN_RUN_S = 5   # wie MIN_SEGMENT_S in gps.py


def _bearing(lon1, lat1, lon2, lat2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    x = math.sin(dl) * math.cos(p2)
    y = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return math.degrees(math.atan2(x, y))


def _hav(lon1, lat1, lon2, lat2):
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def extra_features(gps):
    """Neue Features pro GPS-Sekunde: Delta-Speed 1/3/5 s, Pfadlaenge 5 s,
    Geradlinigkeit (net/path 5 s), Kursaenderung 5 s."""
    n = len(gps)
    lon = np.array([g[1] for g in gps], float)
    lat = np.array([g[2] for g in gps], float)
    spd = np.array([g[3] if len(g) > 3 and g[3] is not None else 0.0 for g in gps], float)
    step = np.zeros(n)
    for i in range(1, n):
        step[i] = _hav(lon[i - 1], lat[i - 1], lon[i], lat[i])
    d1 = np.zeros(n); d3 = np.zeros(n); d5 = np.zeros(n)
    path5 = np.zeros(n); net5 = np.zeros(n); straight = np.zeros(n); turn5 = np.zeros(n)
    for i in range(n):
        d1[i] = spd[i] - spd[max(0, i - 1)]
        d3[i] = spd[i] - spd[max(0, i - 3)]
        d5[i] = spd[i] - spd[max(0, i - 5)]
        j = max(0, i - 5)
        path5[i] = step[j + 1:i + 1].sum()
        net5[i] = _hav(lon[j], lat[j], lon[i], lat[i])
        straight[i] = net5[i] / path5[i] if path5[i] > 1e-6 else 0.0
        if i >= 6:
            b0 = _bearing(lon[i - 6], lat[i - 6], lon[i - 3], lat[i - 3])
            b1 = _bearing(lon[i - 3], lat[i - 3], lon[i], lat[i])
            dif = abs((b1 - b0 + 180) % 360 - 180)
            turn5[i] = dif
    return np.stack([d1, d3, d5, path5, net5, straight, turn5], axis=1)


def build(path, with_extra):
    fit = fitparse.FitFile(open(path, "rb").read())
    records, accel_msgs = [], []
    for m in fit.get_messages():
        if m.name == "record":
            records.append({d.name: d.value for d in m})
        elif m.name == "accelerometer_data":
            accel_msgs.append({d.name: d.value for d in m})
    times = [t for t in (_record_time(r) for r in records) if t]
    a0 = _accel_msg_time(accel_msgs[0]) if accel_msgs else None
    if a0:
        times.append(a0)
    if not times:
        return None
    t0 = min(times)
    gps = gps_from_records(records, t0)
    foil = [r.get("foil_status") for r in records
            if r.get("position_lat") is not None and r.get("position_long") is not None
            and r.get("timestamp") is not None]
    accel_bytes, accel_hz = accel_from_messages(accel_msgs)
    accel = np.frombuffer(accel_bytes, dtype="<i2")
    accel = accel[: (accel.size // 3) * 3].reshape(-1, 3)
    X = extract_features(gps, accel, float(accel_hz or 25), 2048)
    if with_extra:
        E = extra_features(gps)
        m = min(len(X), len(E))
        X = np.hstack([X[:m], E[:m]])
    y = np.array([1 if (f is not None and int(f) >= 1) else 0 for f in foil])
    valid = np.array([f is not None for f in foil])
    m = min(len(X), len(y), len(valid))
    return X[:m][valid[:m]], y[:m][valid[:m]]


def windowize(X, r):
    """Zeile i -> aneinandergehaengte Features [i-r .. i+r] (Rand geklemmt)."""
    n, f = X.shape
    idx = np.clip(np.arange(n)[:, None] + np.arange(-r, r + 1)[None, :], 0, n - 1)
    return X[idx].reshape(n, (2 * r + 1) * f)


def median_smooth(pred, w):
    if w <= 1:
        return pred
    r = w // 2
    out = pred.copy()
    for i in range(len(pred)):
        out[i] = 1 if pred[max(0, i - r):i + r + 1].mean() >= 0.5 else 0
    return out


def count_runs(mask, min_len=MIN_RUN_S):
    runs = 0
    i = 0
    n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            if j - i >= min_len:
                runs += 1
            i = j
        else:
            i += 1
    return runs


def rf():
    return RandomForestClassifier(200, random_state=0, n_jobs=-1, class_weight="balanced")


def evaluate(variant, r, smooth_w, with_extra):
    files = sorted(glob.glob(FITS))
    data = [build(f, with_extra) for f in files]
    data = [d for d in data if d is not None]
    Ps = Rs = Fs = 0.0
    pred_runs = true_runs = 0
    for te in range(len(data)):
        Xtr = np.vstack([windowize(data[i][0], r) for i in range(len(data)) if i != te])
        ytr = np.concatenate([data[i][1] for i in range(len(data)) if i != te])
        Xte = windowize(data[te][0], r)
        yte = data[te][1]
        p = rf().fit(Xtr, ytr).predict(Xte)
        p = median_smooth(p, smooth_w)
        Ps += precision_score(yte, p, zero_division=0)
        Rs += recall_score(yte, p, zero_division=0)
        Fs += f1_score(yte, p, zero_division=0)
        pred_runs += count_runs(p)
        true_runs += count_runs(yte)
    k = len(data)
    print(f"{variant:34} P={Ps/k:.3f} R={Rs/k:.3f} F1={Fs/k:.3f}  "
          f"Laeufe pred/true={pred_runs}/{true_runs} (Faktor {pred_runs/max(true_runs,1):.2f})")


def main():
    print(f"Datei-CV (leave-one-out) auf {len(sorted(glob.glob(FITS)))} gelabelten fenix-FITs\n")
    evaluate("Baseline (7 feat, /s)",           r=0, smooth_w=1,  with_extra=False)
    evaluate("Idee2 Glaettung w=5",             r=0, smooth_w=5,  with_extra=False)
    evaluate("Idee2 Glaettung w=11",            r=0, smooth_w=11, with_extra=False)
    evaluate("Idee1 Fenster r=2 (5 s)",         r=2, smooth_w=1,  with_extra=False)
    evaluate("Idee1 Fenster r=5 (11 s)",        r=5, smooth_w=1,  with_extra=False)
    evaluate("Idee1+ Fenster r=5 +Richtung",    r=5, smooth_w=1,  with_extra=True)
    evaluate("Idee1+2 Fenster r=5 +Glaett w=5", r=5, smooth_w=5,  with_extra=True)


if __name__ == "__main__":
    main()
