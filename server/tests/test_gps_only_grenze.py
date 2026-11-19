"""Tempogrenze fuer „ist Foilen" ohne Bewegungsdaten je Sportart (Jan 19.11.2026)."""
from app.analysis import gps_only_max_mps


def test_pumpfoil_bleibt_30():
    assert round(gps_only_max_mps("pumpfoil") * 3.6) == 30
    assert round(gps_only_max_mps(None) * 3.6) == 30


def test_wing_und_kite_nehmen_ihre_laufspitze():
    assert round(gps_only_max_mps("wingfoil") * 3.6) == 62
    assert round(gps_only_max_mps("kitefoil") * 3.6) == 70


def test_nie_strenger_als_pumpfoil():
    assert round(gps_only_max_mps("sup") * 3.6) == 30          # eigene Lauf-Spitze 25 -> bleibt 30
