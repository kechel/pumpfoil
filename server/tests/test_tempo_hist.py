"""Tempo-Verteilung je Session (analysis/tempo_hist.py)."""
from app.analysis import tempo_hist as TH


def test_gewicht_aus_laufdauer_und_gleiten():
    v = [0.0] * 3 + [5.0] * 10 + [0.0] * 3          # 5 m/s = 18 km/h -> Stufe 36
    seg = {"i_start": 3, "i_end": 13, "duration_s": 20.0, "pg_pumps": 4, "pg_glides": [[8, 13, 5.0, 0]]}
    h = TH.berechne([seg], v)
    assert sum(h["a"]) == 20.0 and h["a"][36] == 20.0   # 10 Punkte, je 2 s
    assert h["g"][36] == 10.0                              # 5 Punkte in der Gleitphase


def test_ohne_pg_kein_gleiten():
    h = TH.berechne([{"i_start": 0, "i_end": 2, "duration_s": 2.0}], [3.0, 3.0, 3.0])
    assert h["g"] is None and sum(h["a"]) == 2.0


def test_summe_trennt_gleit_basis():
    s = TH.summe([{"a": [1.0] + [0.0] * 79, "g": None}, {"a": [2.0] + [0.0] * 79, "g": [1.0] + [0.0] * 79}])
    assert s["a"][0] == 3.0 and s["g_basis"][0] == 2.0 and s["g"][0] == 1.0
