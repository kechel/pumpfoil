"""FIT-Loader: Roh-Accel (100 Hz SensorLogging) aus einem Garmin-Activity-FIT.
Liefert absolute Unix-Zeit je Sample (für Cross-Watch-Sync mit den Chunk-Daten).
calibrated_accel_* steht in milli-g -> /1000 = g (FIT-Ruhewert ~1000, s. FINDINGS).
"""
from datetime import timezone
import numpy as np
import fitparse


def _unix(ts):
    """FIT-Zeitstempel sind UTC (naive) -> echte Unix-Zeit (sonst Lokalzeit-Versatz)."""
    return ts.replace(tzinfo=timezone.utc).timestamp()


def load_fit_accel(path):
    ff = fitparse.FitFile(path)
    T, X, Y, Z = [], [], [], []
    for m in ff.get_messages("accelerometer_data"):
        d = {f.name: f.value for f in m.fields}
        x = d.get("calibrated_accel_x")
        if not x:
            continue
        ts = d.get("timestamp")           # datetime (UTC, ganze Sekunde)
        tms = d.get("timestamp_ms") or 0  # ms-Anteil der Message
        offs = d.get("sample_time_offset") or [0] * len(x)
        base = _unix(ts) + tms / 1000.0
        for i in range(len(x)):
            T.append(base + (offs[i] or 0) / 1000.0)
            X.append(x[i]); Y.append(d["calibrated_accel_y"][i]); Z.append(d["calibrated_accel_z"][i])
    t = np.array(T)
    a = np.c_[X, Y, Z].astype(float) / 1000.0
    order = np.argsort(t)
    return t[order], a[order]


def load_fit_gps(path):
    ff = fitparse.FitFile(path)
    out = []
    for m in ff.get_messages("record"):
        d = {f.name: f.value for f in m.fields}
        ts = d.get("timestamp")
        spd = d.get("enhanced_speed", d.get("speed"))
        if ts is not None:
            out.append((_unix(ts), spd if spd is not None else 0.0))
    return out


_SEMI = 180.0 / 2**31


def load_fit_gps_samples(path):
    """Für analyze_gps: (samples=[t_ms_rel,lat,lon,speed,hr,hacc], t0_abs_unix).
    t_ms relativ zum ersten Record; lat/lon aus Semicircles."""
    ff = fitparse.FitFile(path)
    rows = []
    for m in ff.get_messages("record"):
        d = {f.name: f.value for f in m.fields}
        ts = d.get("timestamp")
        la = d.get("position_lat"); lo = d.get("position_long")
        if ts is None or la is None or lo is None:
            continue
        spd = d.get("enhanced_speed", d.get("speed"))
        hacc = d.get("gps_accuracy")
        rows.append((_unix(ts), la * _SEMI, lo * _SEMI,
                     float(spd) if spd is not None else None,
                     d.get("heart_rate"), float(hacc) if hacc is not None else None))
    if not rows:
        return [], 0.0
    rows.sort(key=lambda r: r[0])
    t0 = rows[0][0]
    samples = [[(r[0] - t0) * 1000.0, r[1], r[2], r[3], r[4], r[5]] for r in rows]
    return samples, t0
