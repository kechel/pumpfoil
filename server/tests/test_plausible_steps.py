"""plausible_steps: Glitch-Filter nach Tempo statt fester 25 m je Schritt (Feedback #19096, u244).

Smart Recording (Punkte alle 2-8 s) verlor mit der alten 25-m-Regel jeden schnellen Schritt."""
import math

import numpy as np

from app.analysis.gps import plausible_steps

LAT0 = 47.6


def _spur(x_m, t_s):
    x = np.asarray(x_m, dtype=float)
    lat = np.full(x.size, LAT0)
    lon = 9.4 + x / (111320.0 * math.cos(math.radians(LAT0)))
    return lat, lon, np.asarray(t_s, dtype=float) * 1000.0


def test_sekundentakt_wie_bisher():
    t = np.arange(60)
    lat, lon, t_ms = _spur(5.0 * t, t)
    step, v = plausible_steps(lat, lon, t_ms)
    assert abs(step.sum() - 295.0) < 1.0
    assert abs(np.median(v[1:]) - 5.0) < 0.05


def test_smart_recording_zaehlt_schnelle_schritte():
    # 6 m/s, ein Punkt alle 5 s -> 30-m-Schritte; die alte Regel zaehlte davon nichts
    t = np.arange(0, 300, 5)
    lat, lon, t_ms = _spur(6.0 * t, t)
    step, v = plausible_steps(lat, lon, t_ms)
    assert abs(step.sum() - 6.0 * 295) < 2.0
    assert abs(np.median(v[1:]) - 6.0) < 0.05


def test_einzelner_glitch_wird_zur_geraden():
    t = np.arange(30)
    x = 5.0 * t
    x[10] += 300.0                      # ein Punkt 300 m daneben
    lat, lon, t_ms = _spur(x, t)
    step, v = plausible_steps(lat, lon, t_ms)
    assert step[10] == 0.0
    assert abs(step.sum() - 145.0) < 1.0
    assert abs(v[10] - 5.0) < 0.05     # Glitch-Punkt bekommt das Tempo der Geraden


def test_lange_luecke_zaehlt_keinen_sprung():
    t = np.concatenate([np.arange(10), np.arange(40, 50)])
    x = np.concatenate([5.0 * np.arange(10), 2000.0 + 5.0 * np.arange(10)])
    lat, lon, t_ms = _spur(x, t)
    step, _ = plausible_steps(lat, lon, t_ms)
    assert abs(step.sum() - 90.0) < 1.0


def test_falscher_bezugspunkt_setzt_neu_an():
    # Erster Punkt 1 km daneben: nach MAX_GLITCH_PUNKTE neu ansetzen, danach normal zaehlen
    t = np.arange(40)
    x = 5.0 * t
    x[0] = -1000.0
    lat, lon, t_ms = _spur(x, t)
    step, _ = plausible_steps(lat, lon, t_ms)
    assert step.max() < 10.0
    assert step.sum() > 5.0 * 25
