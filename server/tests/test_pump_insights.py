"""Tests für Pump-Frequenz-Verlauf, Ende-Klassifikation und Pro-Lauf-Insights."""
from __future__ import annotations

import math

import numpy as np

from app.analysis import _fill_pump_hz
from app.analysis.gps import _classify_end, analyze_gps


def _point(lat0, lon0, dist_m, bearing_deg=90.0):
    dlat = (dist_m * math.cos(math.radians(bearing_deg))) / 111_320.0
    dlon = (dist_m * math.sin(math.radians(bearing_deg))) / (
        111_320.0 * math.cos(math.radians(lat0))
    )
    return lat0 + dlat, lon0 + dlon


def _build_track(speeds_mps, hz=1, hacc=5.0):
    samples = []
    lat, lon = 54.0, 10.0
    t = 0
    for v in speeds_mps:
        samples.append([t, lat, lon, v, 130, hacc])
        lat, lon = _point(lat, lon, v / hz, bearing_deg=90.0)
        t += int(1000 / hz)
    return samples


# --- _fill_pump_hz: gefensterte Kadenz ---

def test_fill_pump_hz_cadence_about_1hz():
    gps_t = np.arange(0, 20000, 1000, dtype=float)  # 20 Punkte @1 Hz
    pts = np.arange(1000, 19000, 1000, dtype=float)  # Pump jede Sekunde -> ~1 Hz
    pump_hz = [None] * gps_t.size
    _fill_pump_hz(pump_hz, gps_t, pts, 0, 19000, window_s=5.0)
    filled = [v for v in pump_hz if v is not None]
    assert filled, "Punkte im Lauf sollten gefüllt sein"
    # In der Mitte ist die Kadenz stabil ~1 Hz.
    assert 0.8 <= pump_hz[10] <= 1.2


def test_fill_pump_hz_outside_window_stays_none():
    gps_t = np.arange(0, 10000, 1000, dtype=float)
    pts = np.array([5000.0])
    pump_hz = [None] * gps_t.size
    # Lauf nur 4000..6000 ms -> nur diese Punkte werden gefüllt.
    _fill_pump_hz(pump_hz, gps_t, pts, 4000, 6000, window_s=5.0)
    assert pump_hz[0] is None and pump_hz[9] is None
    assert any(v is not None for v in pump_hz[4:7])


# --- _classify_end: Sturz vs. Stopp ---

def test_classify_end_fall():
    # Am Ende auf Foil (5 m/s), direkt danach im Wasser (~1 m/s) -> Sturz.
    speed_s = np.array([5.0, 5.0, 5.0, 5.0, 1.0, 0.8, 0.9])
    step = np.full(speed_s.size, 4.0)  # keine GPS-Aussetzer
    end_type, decel = _classify_end(3, speed_s, step, gps_hz=1)
    assert end_type == "fall"
    assert decel > 0


def test_classify_end_stop():
    # Sanftes Auslaufen, bleibt über der Wasser-Schwelle -> kontrollierter Stopp.
    speed_s = np.array([5.0, 5.0, 5.0, 3.0, 2.8, 2.6, 2.5])
    step = np.full(speed_s.size, 4.0)
    end_type, _ = _classify_end(3, speed_s, step, gps_hz=1)
    assert end_type == "stop"


def test_classify_end_gps_dropout_is_fall():
    # Auslaufen, aber direkt danach ein GPS-Teleport (Uhr unter Wasser) -> Sturz.
    speed_s = np.array([5.0, 5.0, 5.0, 3.0, 2.8, 2.6, 2.5])
    step = np.array([4.0, 4.0, 4.0, 4.0, 60.0, 1.0, 1.0])  # Sprung kurz nach i_end=3
    end_type, _ = _classify_end(3, speed_s, step, gps_hz=1)
    assert end_type == "fall"


def test_classify_end_no_tail_is_stop():
    speed_s = np.array([5.0, 5.0, 5.0])
    step = np.full(speed_s.size, 4.0)
    end_type, decel = _classify_end(2, speed_s, step, gps_hz=1)
    assert end_type == "stop" and decel == 0.0


# --- analyze_gps: end_type am Segment vorhanden + Sturz erkannt ---

def test_analyze_gps_sets_end_type_fall():
    # 30 s sauberes Foilen (5 m/s), dann abrupt ins Wasser (0.5 m/s).
    samples = _build_track([5.0] * 30 + [0.5] * 10)
    res = analyze_gps(samples, gps_hz=1)
    assert res["segments"], "ein Foil-Segment erwartet"
    seg = res["segments"][0]
    assert seg["end_type"] == "fall"
    assert "end_decel_mps2" in seg
