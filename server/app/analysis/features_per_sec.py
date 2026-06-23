"""Per-Sekunde-Features aus Original-Garmin-Daten (GPS-Speed + accelerometer_data).

Wird sowohl fürs Offline-Eval gegen foil_status (scripts/eval_foilstatus.py) als auch
später für die eigentliche Foil-Erkennung genutzt. KEINE Developer-Felder außer
foil_status, das NUR als Label (y) dient.
"""
from __future__ import annotations

from datetime import timezone

import numpy as np

from ..ml.features import bandpass_fft

FEATURE_NAMES = [
    "speed", "speed_3s", "speed_5s", "speed_cv",
    "accel_rms", "pump_rms", "hf_rms",
]


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _accel_times_mag(accel_msgs, scale=2048):
    """Absolute Sample-Zeiten (datetime) + Magnitude (g) aus accelerometer_data."""
    times, xs, ys, zs = [], [], [], []
    for m in accel_msgs:
        ts = m.get("timestamp")
        if ts is None:
            continue
        base = _aware(ts)
        tms = m.get("timestamp_ms") or 0
        offs = m.get("sample_time_offset")
        ax = m.get("calibrated_accel_x"); ay = m.get("calibrated_accel_y"); az = m.get("calibrated_accel_z")
        if ax is None:
            continue
        if not isinstance(ax, (list, tuple)):
            ax, ay, az, offs = [ax], [ay], [az], [0]
        n = len(ax)
        if not isinstance(offs, (list, tuple)):
            offs = list(range(0, n * 10, 10))
        for k in range(n):
            t = base.timestamp() + (tms + (offs[k] if k < len(offs) else 0)) / 1000.0
            times.append(t); xs.append(ax[k]); ys.append(ay[k]); zs.append(az[k])
    if not times:
        return np.empty(0), np.empty(0)
    t = np.array(times); order = np.argsort(t)
    t = t[order]
    a = np.stack([np.array(xs)[order], np.array(ys)[order], np.array(zs)[order]], axis=1) / 1000.0  # mg->g
    mag = np.sqrt((a * a).sum(axis=1))
    return t, mag


def per_second_dataset(records, accel_msgs):
    """-> (X, y, t_rel_ms) oder None. y = foil_status (0/1). Nur Records mit foil_status."""
    rows = [r for r in records if r.get("foil_status") is not None and r.get("timestamp") is not None]
    if len(rows) < 30:
        return None
    t0 = _aware(rows[0]["timestamp"]).timestamp()
    rec_t = np.array([_aware(r["timestamp"]).timestamp() for r in rows])
    speed = np.array([
        (r.get("enhanced_speed") if r.get("enhanced_speed") is not None
         else (r.get("speed") if r.get("speed") is not None else r.get("gps_speed")))
        or 0.0
        for r in rows
    ], dtype=float)
    y = np.array([1 if int(r["foil_status"]) >= 1 else 0 for r in rows], dtype=int)

    def med(win):
        h = win // 2
        out = np.empty_like(speed)
        for i in range(speed.size):
            out[i] = np.median(speed[max(0, i - h): i + h + 1])
        return out

    speed_3s = med(3); speed_5s = med(5)
    cv = np.empty_like(speed)
    for i in range(speed.size):
        w = speed[max(0, i - 2): i + 3]
        cv[i] = (w.std() / w.mean()) if w.mean() > 1e-6 else 0.0

    at, mag = _accel_times_mag(accel_msgs)
    if at.size:
        fs = at.size / max(at[-1] - at[0], 1.0)
        pump = bandpass_fft(mag, fs, 0.3, 3.0)
        hf = bandpass_fft(mag, fs, 3.0, 15.0)
    accel_rms = np.zeros(speed.size); pump_rms = np.zeros(speed.size); hf_rms = np.zeros(speed.size)
    if at.size:
        for i in range(rows.__len__()):
            t = rec_t[i]
            lo = np.searchsorted(at, t); hi = np.searchsorted(at, t + 1.0)
            if hi > lo:
                seg = mag[lo:hi]
                accel_rms[i] = np.sqrt(np.mean((seg - seg.mean()) ** 2))
                pump_rms[i] = np.sqrt(np.mean(pump[lo:hi] ** 2))
                hf_rms[i] = np.sqrt(np.mean(hf[lo:hi] ** 2))

    X = np.stack([speed, speed_3s, speed_5s, cv, accel_rms, pump_rms, hf_rms], axis=1)
    t_rel = ((rec_t - t0) * 1000.0).astype(int)
    return X, y, t_rel
