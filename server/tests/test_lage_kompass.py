"""Vorn/hinten aus Kompass gegen GPS-Kurs (`lage.richtung_messen`, 27.09.2026).

Synthetisch: ein Handy flach auf dem Brett, Nase auf einer bekannten Geraeteachse, das Brett
faehrt eine Runde durch alle Himmelsrichtungen. Geprueft wird, dass die Richtung stimmt, dass das
Vorzeichen des Beschleunigungsmessers (Android +1 g oben, CoreMotion −1 g) GEMESSEN wird, und dass
ohne Magnetometer alles bleibt, wie es war.
Echte Belege (drei Spaziergaenge, je eine andere Haltung): docs/GROUND-TRUTH.md 12d.
"""
import numpy as np
import pytest

from app.analysis import lage

HZ = 50
NORD_UT, UNTEN_UT = 21.0, 44.0          # Erdfeld am Bodensee: waagerecht / nach unten


def _runde(nase_rot_deg: float, acc_vz: int, dauer_s: float = 120.0):
    """Brett faehrt einen Kreis (Kurs 0..360°), Handy flach, Display oben.

    Die Nase des Bretts liegt auf der Geraeteachse (−cos r, sin r, 0) — so definiert es
    `lage_berechnen`. Welt: x Ost, y Nord, z oben."""
    t_ms = np.arange(0, dauer_s * 1000, 1000 / HZ)
    kurs = np.radians(360.0 * t_ms / t_ms[-1])
    w = np.radians(nase_rot_deg)
    nase_dev = np.array([-np.cos(w), np.sin(w), 0.0])
    quer_dev = np.cross([0, 0, 1.0], nase_dev)           # links der Nase
    acc, mag = [], []
    for k in kurs:
        vorn = np.array([np.sin(k), np.cos(k), 0.0])       # Fahrtrichtung in Welt
        links = np.cross([0, 0, 1.0], vorn)
        # Welt -> Geraet: Komponenten entlang vorn/links/oben auf nase/quer/z abbilden
        def welt_zu_geraet(v):
            return (v @ vorn) * nase_dev + (v @ links) * quer_dev + v[2] * np.array([0, 0, 1.0])
        acc.append(acc_vz * welt_zu_geraet(np.array([0, 0, 1.0])))
        mag.append(welt_zu_geraet(np.array([0.0, NORD_UT, -UNTEN_UT])))
    acc = np.round(np.array(acc) * lage.ACCEL_SCALE).astype(np.int16)
    mag = np.round(np.array(mag) * lage.MAG_SCALE).astype(np.int16)
    # GPS 1 Hz auf dem Kreis, ~5 m/s
    r_m = 5.0 * dauer_s / (2 * np.pi)
    gps = []
    for ts in range(0, int(dauer_s * 1000), 1000):
        k = 2 * np.pi * ts / t_ms[-1]
        x, y = r_m * (1 - np.cos(k)), r_m * np.sin(k)      # Start nach Norden, Rechtskurve
        gps.append([ts, 47.9 + y / 110540.0, 9.35 + x / (111320.0 * np.cos(np.radians(47.9))), 0, 0, 0])
    return t_ms, acc, mag, gps


@pytest.mark.parametrize("acc_vz", [+1, -1])
@pytest.mark.parametrize("rot", [0.0, 90.0, 37.0])
def test_richtung_und_schwerkraft_vorzeichen(rot, acc_vz):
    t, acc, mag, gps = _runde(rot, acc_vz)
    ganz = [(float(t[0]), float(t[-1]))]
    richtig = lage.richtung_messen(acc, t, rot, gps, ganz, lage.magnetfeld(mag, t))
    assert richtig is not None
    assert richtig["acc_vz"] == acc_vz and richtig["nase_vorn"] == 1
    assert richtig["vorzeichen"] == acc_vz
    verkehrt = lage.richtung_messen(acc, t, (rot + 180.0) % 360.0, gps, ganz, lage.magnetfeld(mag, t))
    assert verkehrt["nase_vorn"] == -1 and verkehrt["vorzeichen"] == -acc_vz


def test_ohne_magnetometer_bleibt_es_unbestimmt():
    t, acc, mag, gps = _runde(90.0, +1)
    ganz = [(float(t[0]), float(t[-1]))]
    assert lage.magnetfeld(np.empty((0, 3), dtype=np.int16), np.empty(0)) is None
    assert lage.richtung_messen(acc, t, 90.0, gps, ganz, None) is None
    assert lage.richtung_messen(acc, t, 90.0, None, ganz, lage.magnetfeld(mag, t)) is None


def test_unplausibles_feld_ergibt_keine_aussage():
    """Magnet in der Halterung: hunderte µT -> jedes Fenster faellt raus, lieber nichts als geraten."""
    t, acc, mag, gps = _runde(90.0, +1)
    stark = (mag.astype(float) * 8).clip(-32768, 32767).astype(np.int16)
    assert lage.richtung_messen(acc, t, 90.0, gps, [(float(t[0]), float(t[-1]))],
                                lage.magnetfeld(stark, t)) is None
