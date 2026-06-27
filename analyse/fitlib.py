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
