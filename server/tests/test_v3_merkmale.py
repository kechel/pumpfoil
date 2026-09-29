"""Erkennung v3, Stufe A — Merkmale an synthetischen Signalen (keine echten Nutzerdaten, das Repo
ist oeffentlich). Prueft, dass die neuen Merkmale messen, was ihr Name sagt: Pumpen landet im
Pump-Band, Schritte im Schritt-Band, Motor-/Strassenvibration im Vibrations-Band, und das Raster
bringt jede Geraeterate zeitgleich auf 25 Hz. Plan: docs/DETECTION-V3.md."""
from types import SimpleNamespace

import numpy as np

from app.analysis.v3 import merkmale as M


def _mag(freq_hz, dauer_s=40, hz=M.ZIEL_HZ, amp=0.3):
    t = np.arange(int(dauer_s * hz)) / hz
    return 1.0 + amp * np.sin(2 * np.pi * freq_hz * t)


def _band(freq_hz):
    mag = _mag(freq_hz)
    t_rel = np.arange(5, 35) * 1000.0
    return M._spektrum(mag, t_rel).mean(axis=0)


def test_pumpen_landet_im_pump_band():
    b = _band(1.4)
    assert b[0] > 0.8 and b[1] < 0.1 and b[2] < 0.05
    assert abs(b[3] - 1.4) <= 0.15


def test_schritte_landen_im_schritt_band():
    b = _band(2.8)
    assert b[1] > 0.8 and b[0] < 0.1


def test_vibration_landet_im_vibrations_band():
    b = _band(8.0)
    assert b[2] > 0.8 and b[0] < 0.05


def test_raster_bringt_100hz_zeitgleich_auf_25hz():
    hz = 100.0
    t = np.arange(0, 20000, 1000.0 / hz)
    sig = np.sin(2 * np.pi * 1.0 * t / 1000.0)       # 1 Hz, langsam genug fuer 25 Hz
    acc = np.stack([sig * 2048, np.zeros_like(sig), np.full_like(sig, 2048)], axis=1)
    tb = SimpleNamespace(accel=acc, t_accel_ms=t, accel_hz=hz, window_start_ms=0.0, window_end_ms=t[-1])
    r = M.raster(tb)
    assert abs(r.shape[0] - 20000 / 1000 * M.ZIEL_HZ) <= 1
    ziel_t = np.arange(r.shape[0]) / M.ZIEL_HZ * 1000
    soll = np.sin(2 * np.pi * ziel_t / 1000.0) * 2048
    # gleitendes Mittel ueber 4 Samples bei 1 Hz: Amplitude fast unveraendert, KEIN Zeitversatz
    innen = slice(5, -5)
    assert np.corrcoef(r[innen, 0], soll[innen])[0, 1] > 0.999


def test_ganze_aufnahme_ohne_zuschnitt_und_ausschluss():
    s = {"uuid": "x", "accel_hz": 25, "sport_class": "pumpfoil", "placement": None}
    ns = M.ganze_aufnahme(s)
    assert ns.trim_start_ms is None and ns.trim_end_ms is None
    assert ns.excluded_ranges is None and ns.fremdkraft_keep is None


def test_namen_passen_zur_spaltenzahl():
    assert len(M.NAMEN) == len(M.BASIS_NAMEN) + len(M.NEU_NAMEN) == 33


def _raster(vert_amp, hor_amp, f=1.4, dauer_s=20, scale=2048):
    """Uhr um 30° geneigt; Pumpen = Schwingung entlang der Schwerkraft, Balancieren = quer dazu."""
    n = int(dauer_s * M.ZIEL_HZ)
    t = np.arange(n) / M.ZIEL_HZ
    g = np.array([0.0, np.sin(np.radians(30)), np.cos(np.radians(30))])       # Schwerkraft in Uhr-Achsen
    quer = np.array([1.0, 0.0, 0.0])
    a = g[None, :] + (vert_amp * np.sin(2 * np.pi * f * t))[:, None] * g[None, :] \
        + (hor_amp * np.sin(2 * np.pi * 0.9 * t))[:, None] * quer[None, :]
    return a * scale


def test_pumpen_ist_vertikal_balancieren_waagerecht():
    t_rel = np.arange(3, 17) * 1000.0
    pump = M._achsen(_raster(0.5, 0.05), 2048, t_rel).mean(axis=0)
    gleit = M._achsen(_raster(0.03, 0.3), 2048, t_rel).mean(axis=0)
    assert pump[2] > 0.9 and gleit[2] < 0.1              # Anteil vertikal
    assert pump[0] > 5 * gleit[0] and gleit[1] > 3 * pump[1]
    assert abs(pump[4] - 30) < 3                          # Neigung erkannt, egal wie die Uhr sitzt
