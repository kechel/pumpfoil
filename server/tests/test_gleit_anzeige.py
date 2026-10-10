"""Gleitphasen zum Einblenden (Jan, 03.10.2026): 1,5-10 s zwischen zwei Pumps und vom letzten Pump
bis zum Laufende; nichts ueber Accel-Luecken, nichts vor dem ersten Pump."""
import numpy as np

from app.analysis import gleit_anzeige

GPS = np.arange(0, 60_000, 1000.0)          # ein Track-Punkt je Sekunde


def test_luecken_zwischen_pumps_und_am_ende():
    ps = np.array([5000, 5700, 6400, 9000, 9700, 25_000, 25_700])
    g = gleit_anzeige(ps, [True] * 6, 29_000, GPS)
    # 6,4 -> 9,0 s (2,6 s) ja · 9,7 -> 25,0 s (15,3 s) zu lang (Grenze 15 s seit 10.10.2026)
    # · Ende 25,7 -> 29,0 s (3,3 s) ja
    assert g == [[7, 9, 2.6, 6400], [26, 29, 3.3, 25_700]]


def test_gleiten_bis_fuenfzehn_sekunden():
    ps = np.array([5000, 5700, 18_000, 18_700])                # 5,7 -> 18,0 s = 12,3 s
    assert gleit_anzeige(ps, [True] * 3, 19_000, GPS)[0][:3] == [6, 18, 12.3]


def test_unter_eineinhalb_sekunden_nicht():
    ps = np.array([1000, 2400, 3800])
    assert gleit_anzeige(ps, [True, True], 5000, GPS) == []


def test_accel_luecke_ist_kein_gleiten():
    ps = np.array([1000, 4000])
    assert gleit_anzeige(ps, [False], 4500, GPS) == []


def test_ohne_pumps_nichts():
    assert gleit_anzeige(np.array([]), [], 10_000, GPS) == []


def test_startzeit_in_session_ms():
    g = gleit_anzeige(np.array([1000, 3000]), [True], 3500, GPS, versatz_ms=60_000)
    assert g == [[1, 3, 2.0, 61_000]]
