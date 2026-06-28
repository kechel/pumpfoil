"""Tests der GPS-Foile-Erkennung mit synthetischen Tracks."""
from __future__ import annotations

import math

from app.analysis.gps import analyze_gps


def _point(lat0, lon0, dist_m, bearing_deg=90.0):
    """Punkt dist_m östlich/nördlich von (lat0, lon0)."""
    dlat = (dist_m * math.cos(math.radians(bearing_deg))) / 111_320.0
    dlon = (dist_m * math.sin(math.radians(bearing_deg))) / (
        111_320.0 * math.cos(math.radians(lat0))
    )
    return lat0 + dlat, lon0 + dlon


def _build_track(speeds_mps, hz=1, hacc=5.0):
    """Baut GPS-Samples mit gegebener Speed-Sequenz (gleichmäßig nach Osten)."""
    samples = []
    lat, lon = 54.0, 10.0
    t = 0
    for v in speeds_mps:
        samples.append([t, lat, lon, v, 130, hacc])
        lat, lon = _point(lat, lon, v / hz, bearing_deg=90.0)
        t += int(1000 / hz)
    return samples


def test_empty_track():
    res = analyze_gps([], gps_hz=1)
    assert res["foiling_distance_m"] == 0.0
    assert res["segments"] == []


def test_steady_foiling_detected():
    # 60 s konstant 5 m/s (glatt) -> sollte als Foiling erkannt werden.
    samples = _build_track([5.0] * 60)
    res = analyze_gps(samples, gps_hz=1)
    assert len(res["segments"]) == 1
    assert res["foiling_distance_m"] > 250  # ~300 m
    assert res["foiling_time_s"] > 40


def test_stationary_not_foiling():
    # Stillstand (Speed ~0) -> kein Foiling.
    samples = _build_track([0.0] * 60)
    res = analyze_gps(samples, gps_hz=1)
    assert res["segments"] == []
    assert res["foiling_distance_m"] == 0.0


def test_short_burst_discarded():
    # Nur 3 s schnell, Rest langsam -> zu kurz, verworfen (MIN_SEGMENT_S=5).
    samples = _build_track([0.5] * 10 + [6.0] * 3 + [0.5] * 10)
    res = analyze_gps(samples, gps_hz=1)
    assert res["segments"] == []


def test_too_fast_not_foiling():
    # 10 m/s (~36 km/h) liegt über dem Foile-Band -> kein Foiling (z. B. GPS-Ausreißer/Boot).
    samples = _build_track([10.0] * 60)
    res = analyze_gps(samples, gps_hz=1)
    assert res["segments"] == []


def test_mixed_session_partial_foiling():
    # Langsam -> schnell (foile) -> langsam: Foiling-Distanz < Gesamtdistanz.
    samples = _build_track([0.5] * 20 + [5.0] * 40 + [0.5] * 20)
    res = analyze_gps(samples, gps_hz=1)
    assert len(res["segments"]) == 1
    assert 0 < res["foiling_distance_m"] < res["total_distance_m"]


# --- Segment-Merge: ein durchgehender Lauf darf nicht künstlich geteilt werden ---
# (Regression zu _merge_no_stop: Dropout am Sample-Abstand erkennen, nicht an der Wanduhr.)

def test_mask_hole_does_not_split_continuous_run():
    # Durchgehende Fahrt, 40 s konstant 5 m/s, GPS lückenlos (1 Hz). Das Accel-Modell
    # setzt mitten im Lauf ein 15-Sample-Loch in die Maske -> Wanduhr-Abstand der beiden
    # Maskenstücke = 16 s (>GAP_SPLIT_S). Da aber kein echter Stopp (Speed nie <2,8 m/s)
    # und kein echter GPS-Dropout (Sample-Abstand 1 s) vorliegt, ist es EIN Lauf.
    samples = _build_track([5.0] * 40)
    mask = [True] * 40
    for i in range(13, 28):          # 15 Samples Modell-Aussetzer (13..27)
        mask[i] = False
    res = analyze_gps(samples, gps_hz=1, mask_override=mask)
    assert len(res["segments"]) == 1
    assert res["segments"][0]["i_start"] == 0
    assert res["segments"][0]["i_end"] >= 39


def test_real_stop_still_splits_runs():
    # Echter Stopp dazwischen (Speed fällt auf 0) -> zwei getrennte Läufe, NICHT gemergt.
    samples = _build_track([5.0] * 15 + [0.0] * 8 + [5.0] * 15)
    res = analyze_gps(samples, gps_hz=1)
    assert len(res["segments"]) >= 2


def test_gps_dropout_still_splits_runs():
    # Lückenlose hohe Geschwindigkeit, aber ein echter GPS-Dropout (20 s ohne Sample)
    # zwischen zwei Hälften -> bleibt getrennt (kein Merge über einen echten Dropout).
    samples = _build_track([5.0] * 13)
    lat, lon = samples[-1][1], samples[-1][2]
    t = samples[-1][0] + 20_000       # 20-s-Zeitsprung = Dropout
    for _ in range(20):
        lat, lon = _point(lat, lon, 5.0, bearing_deg=90.0)
        samples.append([t, lat, lon, 5.0, 130, 5.0])
        t += 1000
    res = analyze_gps(samples, gps_hz=1)
    assert len(res["segments"]) >= 2
