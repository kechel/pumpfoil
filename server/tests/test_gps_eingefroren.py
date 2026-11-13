"""Kurz eingefrorenes GPS reparieren (13.11.2026, Ground Truth #21487) — Funktion noch nicht eingehaengt."""
from app.analysis.gps import eingefroren_reparieren


def _spur(abschnitte):
    out, lat = [], 47.0
    for von, bis, mps, v in abschnitte:
        for s in range(von, bis):
            lat += mps / 111320.0
            out.append([s * 1000, lat, 9.0, v, 0, 5.0])
    return out


def test_eingefroren_mit_aufholsprung_wird_repariert():
    pk = _spur([(0, 20, 4.0, 4.0), (20, 25, 0.0, 0.0), (25, 26, 20.0, 8.0), (26, 40, 4.0, 4.0)])
    neu, n = eingefroren_reparieren(pk)
    assert n == 1 and len(neu) == len(pk)                       # Indizes bleiben
    assert all(3.0 <= neu[i][3] <= 5.5 for i in range(20, 25))  # Tempo = Luftlinie statt 0


def test_echter_stopp_bleibt():
    pk = _spur([(0, 20, 4.0, 4.0), (20, 30, 0.0, 0.0), (30, 40, 4.0, 4.0)])   # kein Aufholsprung
    neu, n = eingefroren_reparieren(pk)
    assert n == 0 and neu is pk
