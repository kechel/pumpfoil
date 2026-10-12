"""Pumpfoil ja/nein unabhaengig von der Empfindlichkeit (app/analysis/__init__.py, pumpfoil_per_light).

Regel aus dem Trockenlauf vom 12.10.2026 (Jan): mindestens 2 Laeufe ODER einer von mindestens 8 s;
ohne Accel kein „Lauf" ueber 10 min unter 12 km/h (Paddeln) — mit Accel entscheidet das Modell.
"""
from app.analysis import pumpfoil_per_light


def _g(d, kmh=10.0):
    return {"duration_s": d, "avg_speed_mps": kmh / 3.6}


def test_zwei_kurze_laeufe_reichen():
    assert pumpfoil_per_light([_g(4), _g(5)], "gps_only")[0] is True       # wie #10245


def test_ein_lauf_ab_acht_sekunden():
    assert pumpfoil_per_light([_g(8)], "model")[0] is True                  # wie #2639
    assert pumpfoil_per_light([_g(7)], "model")[0] is False                 # wie #2124


def test_paddeln_ohne_accel_nicht():
    assert pumpfoil_per_light([_g(1498, 9.7)], "gps_only")[0] is False      # #1447
    assert pumpfoil_per_light([_g(668, 8.6), _g(12)], "gps_only")[0] is False


def test_mit_accel_entscheidet_das_modell():
    assert pumpfoil_per_light([_g(1498, 9.7)], "model")[0] is True


def test_ohne_laeufe_oder_ohne_erkennung_nicht():
    assert pumpfoil_per_light([], "gps_only")[0] is False
    assert pumpfoil_per_light([_g(20), _g(20)], "none")[0] is False
