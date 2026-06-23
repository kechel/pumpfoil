"""Tests des FIT-Imports (reine Parser-Funktionen, ohne echte FIT-Datei)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import numpy as np

from app.fitimport import accel_from_messages, gps_from_records

T0 = datetime(2026, 6, 20, 9, 0, 0, tzinfo=timezone.utc)
# Karlsruhe ~ (49.0, 8.4) in Semicircles.
LAT_SEMI = int(49.0 / (180.0 / 2 ** 31))
LON_SEMI = int(8.4 / (180.0 / 2 ** 31))


def test_gps_from_records_skips_missing_position():
    recs = [
        {"timestamp": T0, "heart_rate": 120},  # keine Position -> übersprungen
        {"timestamp": T0 + timedelta(seconds=1), "position_lat": LAT_SEMI,
         "position_long": LON_SEMI, "enhanced_speed": 4.0, "heart_rate": 130},
    ]
    out = gps_from_records(recs, T0)
    assert len(out) == 1
    t_ms, lat, lon, speed, hr, hacc = out[0]
    assert t_ms == 1000
    assert abs(lat - 49.0) < 1e-4 and abs(lon - 8.4) < 1e-4
    assert speed == 4.0 and hr == 130


def test_accel_from_messages_scales_to_int16():
    # 2 Messages je 3 Samples, Werte in milli-g.
    msgs = [
        {"timestamp": T0, "timestamp_ms": 0,
         "calibrated_accel_x": [1000.0, 0.0, -1000.0],
         "calibrated_accel_y": [0.0, 0.0, 0.0],
         "calibrated_accel_z": [0.0, 1000.0, 0.0],
         "sample_time_offset": [0, 10, 20]},
        {"timestamp": T0 + timedelta(seconds=1), "timestamp_ms": 0,
         "calibrated_accel_x": [500.0, 500.0, 500.0],
         "calibrated_accel_y": [0.0, 0.0, 0.0],
         "calibrated_accel_z": [0.0, 0.0, 0.0],
         "sample_time_offset": [0, 10, 20]},
    ]
    raw, hz = accel_from_messages(msgs)
    arr = np.frombuffer(raw, dtype="<i2").reshape(-1, 3)
    assert arr.shape == (6, 3)
    # 1000 mg = 1 g -> 2048 (int16-Skala)
    assert arr[0, 0] == 2048
    assert arr[2, 0] == -2048
    assert arr[1, 2] == 2048
    assert hz >= 1


def test_accel_empty():
    raw, hz = accel_from_messages([])
    assert raw == b"" and hz == 0
