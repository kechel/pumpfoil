import numpy as np

from app.analysis.v3 import nachbearbeitung as N


def test_rand_mit_rohem_p_verlaengert():
    t = np.arange(0, 20_000, 1000, dtype=float)
    p = np.array([0.1] * 5 + [0.9] * 8 + [0.5, 0.45, 0.42, 0.1, 0.1, 0.1, 0.1])
    out = N._rand_verlaengern([(5000.0, 12000.0)], [(0.0, 19000.0)], t, p, 0.4)
    assert out == [(5000.0, 14000.0)]          # hoechstens GLAETTEN_S//2 = 2 Punkte, obwohl p bei 15 s noch >= 0.4


def test_rand_nie_ueber_den_kandidaten():
    t = np.arange(0, 20_000, 1000, dtype=float)
    p = np.full(t.size, 0.9)
    assert N._rand_verlaengern([(5000.0, 12000.0)], [(5000.0, 13000.0)], t, p, 0.4) == [(4999.0 + 1, 13000.0)]


def test_rand_verbindet_beruehrende():
    t = np.arange(0, 30_000, 1000, dtype=float)
    p = np.full(t.size, 0.9)
    out = N._rand_verlaengern([(2000.0, 10000.0), (13000.0, 20000.0)], [(0.0, 29000.0)], t, p, 0.4)
    assert out == [(0.0, 22000.0)]
