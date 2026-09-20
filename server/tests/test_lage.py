"""Lage-Berechnung (Pitch/Roll/Gier) gegen Signale, deren Antwort vorher feststeht.

Echte Aufnahmen taugen zum Plausibilisieren, nicht zum Pruefen — bei handgewedelten Daten weiss
niemand, was herauskommen MUSS. Deshalb hier gebaute Signale mit bekannter Wahrheit.
"""
import math

import numpy as np
import pytest

from app.analysis.lage import ACCEL_SCALE, GYRO_SCALE, lage_berechnen, zeitachse


def _ruhend(n, hz, kipp_grad=0.0, achse="pitch"):
    """Stillliegendes Geraet, um `kipp_grad` geneigt: nur Schwerkraft, keine Drehrate."""
    w = math.radians(kipp_grad)
    if achse == "pitch":
        g = np.array([-math.sin(w), 0.0, math.cos(w)])
    else:
        g = np.array([0.0, math.sin(w), math.cos(w)])
    acc = np.tile(g * ACCEL_SCALE, (n, 1)).astype(np.int16)
    gyr = np.zeros((n, 3), dtype=np.int16)
    t = np.arange(n) * (1000.0 / hz)
    return acc, t, gyr, t


def test_ruhendes_geraet_hat_null_auslenkung():
    """Liegt es still, ist die Auslenkung gegen den eigenen Nullpunkt null — egal wie gekippt."""
    acc, t, gyr, tg = _ruhend(600, 50, kipp_grad=12.0)
    r = lage_berechnen(acc, t, gyr, tg, ziel_hz=20)
    assert r["ok"] and r["nullpunkt"] == "ruhe"
    assert max(abs(x) for x in r["pitch_deg"]) < 0.5
    assert max(abs(x) for x in r["roll_deg"]) < 0.5
    assert r["kennzahlen"]["ruhe_anteil"] > 0.9


def test_statische_neigung_wird_als_winkel_erkannt():
    """Erst 8 s flach, dann 8 s um 20° gekippt -> der UNTERSCHIED betraegt 20°.

    Geprueft wird die Differenz zweier EINGESCHWUNGENER Abschnitte, nicht der Absolutwert: der
    Nullpunkt liegt bewusst beim Mittel der Ruhephasen, und der ist hier per Konstruktion
    irgendwo zwischen beiden Lagen. Und nicht ueber die Rampe mitteln — der Filter braucht ein
    paar Sekunden, das ist gewollt (er soll ja nicht jedem Pumpstoss folgen).
    """
    hz = 50
    a1, _, g1, _ = _ruhend(400, hz, 0.0)
    a2, _, g2, _ = _ruhend(400, hz, 20.0)
    acc = np.vstack([a1, a2]); gyr = np.vstack([g1, g2])
    t = np.arange(len(acc)) * (1000.0 / hz)
    r = lage_berechnen(acc, t, gyr, t, ziel_hz=20)
    assert r["ok"]
    p = np.array(r["pitch_deg"]); n = len(p)
    flach = p[n // 2 - 20:n // 2].mean()     # letzte Sekunde vor dem Kippen
    gekippt = p[-20:].mean()                 # letzte Sekunde danach
    assert 19.0 < abs(gekippt - flach) < 21.0, (flach, gekippt)


def test_gierrate_wird_ueber_das_fenster_integriert():
    """Konstante Drehung um die Hochachse mit 90°/s -> 90° je Sekunde, 270° je drei Sekunden."""
    hz, n = 100, 1000        # 10 s
    t = np.arange(n) * (1000.0 / hz)
    acc = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (n, 1)).astype(np.int16)
    rate = math.radians(90.0)
    gyr = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (n, 1)).astype(np.int16)
    for fenster, soll in ((1.0, 90.0), (3.0, 270.0)):
        r = lage_berechnen(acc, t, gyr, t, ziel_hz=20, yaw_fenster_s=fenster)
        assert r["ok"]
        # Die erste Fensterlaenge ist noch nicht gefuellt -> hinten schauen.
        gemessen = np.median(np.array(r["gier_delta_deg"])[-40:])
        assert abs(gemessen - soll) < soll * 0.05, (fenster, gemessen)


def test_gierrate_wird_auf_die_schwerkraft_projiziert():
    """Gerollt liegendes Geraet: eine Drehung um die WELT-Hochachse zaehlt, eine um die
    Geraete-Z-Achse nicht. Ohne die Projektion waere es genau andersherum."""
    hz, n = 100, 600
    t = np.arange(n) * (1000.0 / hz)
    # 90° gerollt: Schwerkraft liegt auf der Geraete-Y-Achse.
    acc = np.tile(np.array([0.0, 1.0, 0.0]) * ACCEL_SCALE, (n, 1)).astype(np.int16)
    rate = math.radians(60.0)
    dreh_um_welt_hoch = np.tile(np.array([0.0, rate, 0.0]) * GYRO_SCALE, (n, 1)).astype(np.int16)
    dreh_um_geraete_z = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (n, 1)).astype(np.int16)

    r1 = lage_berechnen(acc, t, dreh_um_welt_hoch, t, ziel_hz=20, yaw_fenster_s=1.0)
    r2 = lage_berechnen(acc, t, dreh_um_geraete_z, t, ziel_hz=20, yaw_fenster_s=1.0)
    gier1 = abs(np.median(np.array(r1["gier_delta_deg"])[-40:]))
    gier2 = abs(np.median(np.array(r2["gier_delta_deg"])[-40:]))
    assert gier1 > 50.0, gier1          # zaehlt als Gieren
    assert gier2 < 10.0, gier2          # zaehlt NICHT als Gieren


def test_verschiedene_raten_je_kanal():
    """Android-Fall: Accel 120 Hz, Gyro 60 Hz. Beide Achsen werden getrennt aufgebaut."""
    dauer = 8.0
    ta = np.arange(int(dauer * 120)) * (1000.0 / 120)
    tg = np.arange(int(dauer * 60)) * (1000.0 / 60)
    acc = np.tile(np.array([0.0, 0.0, 1.0]) * ACCEL_SCALE, (len(ta), 1)).astype(np.int16)
    rate = math.radians(45.0)
    gyr = np.tile(np.array([0.0, 0.0, rate]) * GYRO_SCALE, (len(tg), 1)).astype(np.int16)
    r = lage_berechnen(acc, ta, gyr, tg, ziel_hz=20, yaw_fenster_s=1.0)
    assert r["ok"]
    assert r["quelle_hz"]["accel"] > 100 and 55 < r["quelle_hz"]["gyro"] < 65
    assert abs(np.median(np.array(r["gier_delta_deg"])[-30:]) - 45.0) < 4.0


def test_ohne_gyro_kommt_trotzdem_pitch_und_roll():
    """Alte Aufnahmen haben keinen Kreisel — dann traegt die Schwerkraft allein."""
    acc, t, _, _ = _ruhend(400, 50, kipp_grad=15.0)
    r = lage_berechnen(acc, t, np.empty((0, 3)), np.empty(0), ziel_hz=20)
    assert r["ok"] and r["hat_gyro"] is False
    assert max(abs(x) for x in r["gier_delta_deg"]) == 0.0


def test_zu_kurz_wird_abgelehnt():
    acc, t, gyr, tg = _ruhend(20, 50)
    assert lage_berechnen(acc, t, gyr, tg)["ok"] is False


def test_zeitachse_aus_chunk_startzeiten():
    """Die Achse kommt aus den `.t0`-Sidecars, nicht aus einer angesagten Rate."""
    t = zeitachse({0: 0, 1: 1000, 2: 2000}, {0: 50, 1: 50, 2: 50})
    assert len(t) == 150
    assert t[0] == 0 and abs(t[50] - 1000) < 1e-6
    assert abs((t[1] - t[0]) - 20.0) < 1e-6      # 50 Samples je 1000 ms = 20 ms
