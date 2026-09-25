"""„Ort verbergen": die Spur bleibt formtreu, der Ort wird ersetzt.

Geprueft wird genau das, was beim Versetzen schiefgehen KANN und niemandem auffallen wuerde: dass
sich die Laengen aendern. Wer Koordinaten in Grad addiert, staucht oder streckt die Spur je nach
Breitengrad — die gezeichnete Strecke passte dann nicht mehr zu den Zahlen daneben.
"""
from __future__ import annotations

import math

from app.ortverbergen import NEMO_LAT, NEMO_LON, ist_verborgen, versetzen

_R = 6_371_000.0


def _meter(a: tuple[float, float], b: tuple[float, float]) -> float:
    dlat = math.radians(b[0] - a[0])
    dlon = math.radians(b[1] - a[1]) * math.cos(math.radians((a[0] + b[0]) / 2))
    return _R * math.hypot(dlat, dlon)


def _quadrat(lat: float, lon: float, kante_m: float = 500.0):
    d = kante_m / (math.pi * _R / 180.0)
    dl = d / math.cos(math.radians(lat))
    return [(lat, lon), (lat + d, lon), (lat + d, lon + dl), (lat, lon + dl), (lat, lon)]


def test_laengen_bleiben_erhalten():
    """Der eigentliche Test. 54° Nord nach 49° Sued: in Grad gerechnet waere die Ost-West-Kante
    rund 14 % zu lang."""
    spur = _quadrat(54.0, 10.0)
    neu = versetzen(spur)
    for i in range(len(spur) - 1):
        vorher, nachher = _meter(spur[i], spur[i + 1]), _meter(neu[i], neu[i + 1])
        assert abs(nachher - vorher) < 1.0, (i, vorher, nachher)


def test_funktioniert_auf_beiden_halbkugeln_und_am_aequator():
    for lat, lon in ((54.0, 10.0), (-33.9, 151.2), (0.5, 73.0), (64.1, -21.9)):
        spur = _quadrat(lat, lon)
        neu = versetzen(spur)
        for i in range(len(spur) - 1):
            assert abs(_meter(neu[i], neu[i + 1]) - _meter(spur[i], spur[i + 1])) < 1.0, (lat, i)


def test_mittelpunkt_landet_auf_point_nemo():
    neu = versetzen(_quadrat(54.0, 10.0))
    assert abs(sum(p[0] for p in neu) / len(neu) - NEMO_LAT) < 1e-6
    assert abs(sum(p[1] for p in neu) / len(neu) - NEMO_LON) < 1e-6


def test_zwei_verschiedene_orte_landen_am_selben_fleck():
    """Sonst liesse sich aus der Lage zweier verborgener Aufnahmen ihr Abstand ablesen."""
    a = versetzen(_quadrat(54.0, 10.0))
    b = versetzen(_quadrat(-33.9, 151.2))
    assert _meter((sum(p[0] for p in a) / len(a), sum(p[1] for p in a) / len(a)),
                  (sum(p[0] for p in b) / len(b), sum(p[1] for p in b) / len(b))) < 1.0


def test_norden_bleibt_norden():
    """Gedreht wird NICHT — die Beziehung zwischen Spur und Windrichtung bleibt lesbar."""
    spur = [(54.0, 10.0), (54.01, 10.0)]     # exakt nach Norden
    neu = versetzen(spur)
    assert neu[1][0] > neu[0][0]
    assert abs(neu[1][1] - neu[0][1]) < 1e-9


def test_leere_spur_bleibt_leer():
    assert versetzen([]) == []


class _S:
    def __init__(self, wert):
        self.ort_sichtbarkeit = wert


def test_drei_zustaende_in_beide_richtungen():
    """Der Grund fuer drei statt zwei Zustaenden: NULL heisst „folgt dem Profil", nicht „nein"."""
    assert ist_verborgen(_S(None), True) is True      # Profil verbirgt -> auch alte Aufnahmen
    assert ist_verborgen(_S(None), False) is False
    assert ist_verborgen(_S("show"), True) is False   # einzelne Freigabe trotz Profil
    assert ist_verborgen(_S("hide"), False) is True   # einzelnes Verbergen trotz Profil
