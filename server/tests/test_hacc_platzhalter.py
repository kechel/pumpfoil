"""Genauigkeits-Platzhalter mitten in der Aufnahme (15.10.2026, #16671).

Wear OS wechselt die GPS-Quelle: erst echte Werte, dann der LocationManager mit fest 125,0 m. Der
Platzhalter-Abschnitt darf das 15-m-Gate nicht ausloesen; kurz stehengebliebene echte Werte
(eingefrorene Ortung am Handy) bleiben gegated.
"""
import numpy as np

from app.analysis import gps as G


def test_langer_gleicher_abschnitt_wird_nan_kurzer_bleibt():
    h = np.array([3.0, 4.0, 2.5] + [125.0] * G.HACC_PLATZHALTER_MIN + [22.07] * 30 + [5.0])
    out = G.hacc_platzhalter_weg(h)
    assert np.isnan(out[3:3 + G.HACC_PLATZHALTER_MIN]).all()
    assert (out[3 + G.HACC_PLATZHALTER_MIN:-1] == 22.07).all()       # 30 x gleich: weiter Messwert
    assert out[0] == 3.0 and out[-1] == 5.0
    assert (h[3] == 125.0)                                            # Eingabe unveraendert


def _fahrt(t0, n, v):
    # gerade Strecke nach Osten, 1 Hz, Tempo v (m/s)
    return [[(t0 + i) * 1000, 47.0, 9.0 + (t0 + i) * v / 75900.0 * 1.0, v, 0, None] for i in range(n)]


def test_lauf_im_platzhalter_abschnitt_wird_erkannt():
    pts = []
    # 15 min echte Genauigkeit im Stand, dann Quellenwechsel: fest 125 m, darin ein 30-s-Lauf
    for i in range(900):
        pts.append([i * 1000, 47.0, 9.0, 0.2, 0, 3.0 + (i % 5)])
    rest = _fahrt(900, 60, 0.3) + _fahrt(960, 30, 4.0) + _fahrt(990, 60, 0.3)
    for p in rest:
        p[5] = 125.0
    seg = G.analyze_gps(pts + rest)["segments"]
    assert len(seg) == 1
