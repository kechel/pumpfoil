"""Tests der Accel-Analyse mit synthetischen Signalen.

WICHTIG: Dies sind Sanity-Checks auf idealisierten Signalen. Die echte
Pump-Erkennung ist deutlich schwieriger (Uhr am Handgelenk -> Arm-Bewegung zum
Balancieren überlagert das Board-Signal) und wird erst mit echten, gelabelten
Testdaten kalibriert. Siehe docs/data-format.md / Plan.
"""
from __future__ import annotations

import numpy as np

from app.ml.features import magnitude_g, window_features
from app.ml.pumps import analyze_accel, count_pumps


def _synth(freq_hz, secs, fs=25, scale=2048, amp_g=0.4, noise_g=0.02):
    """Sinus-Beschleunigung auf z-Achse + 1g Gravitation, als int16 (N,3)."""
    n = int(secs * fs)
    t = np.arange(n) / fs
    z = 1.0 + amp_g * np.sin(2 * np.pi * freq_hz * t)
    rng = np.random.default_rng(0)
    z = z + rng.normal(0, noise_g, n)
    x = rng.normal(0, noise_g, n)
    y = rng.normal(0, noise_g, n)
    raw = np.stack([x, y, z], axis=1) * scale
    return raw.astype(np.int16)


def test_pump_count_rhythmic():
    # 1 Hz Pumpen über 30 s -> ~30 Pumps (Toleranz für Peak-Detection).
    raw = _synth(1.0, 30)
    mag = magnitude_g(raw, 2048)
    n = count_pumps(mag, fs=25.0)
    assert 24 <= n <= 36, f"erwartet ~30, war {n}"


def test_glide_few_pumps():
    # Quasi konstant (sehr niedrige Frequenz, kleine Amplitude) -> kaum Peaks.
    raw = _synth(0.05, 30, amp_g=0.02, noise_g=0.01)
    mag = magnitude_g(raw, 2048)
    n = count_pumps(mag, fs=25.0)
    assert n <= 5, f"Gleiten sollte ~0 Pumps haben, war {n}"


def test_windows_classify_pump():
    raw = _synth(1.0, 20)
    res = analyze_accel(raw, 2048, 25.0)
    labels = [w["label"] for w in res["windows"]]
    assert "pump" in labels
    assert 0.5 <= res["avg_cadence_hz"] <= 2.0


def test_mask_restricts_pumps():
    # Nur die erste Hälfte als "foilend" markieren -> ~halbe Pump-Zahl.
    raw = _synth(1.0, 40)
    mag = magnitude_g(raw, 2048)
    full = count_pumps(mag, fs=25.0)
    mask = np.zeros(mag.size, dtype=bool)
    mask[: mag.size // 2] = True
    masked = count_pumps(mag, fs=25.0, mask=mask)
    assert masked < full
