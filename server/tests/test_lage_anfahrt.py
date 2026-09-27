"""Vorn/hinten aus der Anfahrt: Laengsbeschleunigung (um den Nick-Anteil bereinigt) gegen GPS-dv/dt."""
import numpy as np

from app.analysis import lage


def _anfahrt(nicken_grad=0.0):
    """Handy flach, Oberkante zur Nase (+x). Anfahrt ab t=10 s von 0 auf 5 m/s in ~4 s; das Brett
    nickt dabei um `nicken_grad` hoch (Kreisel um y), was die Laengs-Kraft zusaetzlich verfaelscht."""
    fs = 50.0
    t = np.arange(0, 30000, 1000 / fs)
    ts = t / 1000.0
    v = 5.0 / (1 + np.exp(-(ts - 12.0) * 1.5))                 # m/s
    a = np.gradient(v, ts)                                       # m/s^2
    th = np.radians(nicken_grad) * np.exp(-((ts - 12.0) / 1.5) ** 2)   # Nase oben
    q = -np.gradient(th, ts)                                     # Drehrate um y (Nase oben = negativ)
    f_x = a / 9.81 + np.sin(th)                                  # spezifische Kraft laengs, in g
    f_z = np.cos(th)
    acc = np.column_stack([f_x, np.zeros_like(t), f_z]) * lage.ACCEL_SCALE
    gyr = np.column_stack([np.zeros_like(t), q, np.zeros_like(t)]) * lage.GYRO_SCALE
    gps = [[int(k), 47.6, 11.18, float(np.interp(k, t, v)), 0, 3.0] for k in range(0, 30000, 1000)]
    return acc.astype(np.int16), t, gyr.astype(np.int16), t, gps


def test_richtige_richtung_positiv_verkehrte_negativ():
    acc, ta, gyr, tg, gps = _anfahrt()
    bezug = np.array([0.0, 0.0, 1.0])
    richtig = lage.vorn_aus_anfahrt(acc, ta, gyr, tg, bezug, 0.0, [10000.0], gps)
    verkehrt = lage.vorn_aus_anfahrt(acc, ta, gyr, tg, bezug, 180.0, [10000.0], gps)
    assert richtig["r"] > 0.8 and verkehrt["r"] < -0.8


def test_nicken_waehrend_der_anfahrt_wird_herausgerechnet():
    """Nickt das Brett beim Anfahren 15° hoch, zeigt die rohe Laengs-Kraft das zusaetzlich — ohne
    Abzug ueber den Kreisel waere das Vorzeichen nicht mehr sicher."""
    acc, ta, gyr, tg, gps = _anfahrt(nicken_grad=15.0)
    r = lage.vorn_aus_anfahrt(acc, ta, gyr, tg, np.array([0.0, 0.0, 1.0]), 0.0, [10000.0], gps)
    assert r["r"] > 0.6


def test_ohne_kreisel_oder_ohne_anfahrt_keine_antwort():
    acc, ta, gyr, tg, gps = _anfahrt()
    assert lage.vorn_aus_anfahrt(acc, ta, np.empty((0, 3), np.int16), np.empty(0), np.array([0, 0, 1.0]), 0.0, [10000.0], gps) is None
    stand = [[k, 47.6, 11.18, 0.0, 0, 3.0] for k in range(0, 30000, 1000)]   # kein Tempo-Wechsel
    assert lage.vorn_aus_anfahrt(acc, ta, gyr, tg, np.array([0, 0, 1.0]), 0.0, [10000.0], stand) is None
