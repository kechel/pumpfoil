"""Fehlendes Uhr-Tempo aus den Positionen auffuellen (Befund #16840, 16.10.2026)."""
from app.storage import tempo_auffuellen

# ~3,7 m/s nach Norden: 1e-5 Grad Breite = 1,113 m
def _spur(tempi, schritt=3.33e-5):
    return [[i * 1000, 52.0 + i * schritt, 13.0, v, 120, 4.0] for i, v in enumerate(tempi)]


def test_null_bei_fahrt_wird_aufgefuellt():
    g = _spur([3.5, 0, 0, 3.6, 0])
    out = tempo_auffuellen(g)
    assert out[0][3] == 3.5 and out[3][3] == 3.6            # Messungen bleiben
    assert all(3.6 < out[i][3] < 3.8 for i in (1, 2, 4))      # Luecken aus den Positionen
    assert out[1][4:] == [120, 4.0]                           # Puls/Genauigkeit unberuehrt
    assert g[1][3] == 0                                       # Eingabe nicht veraendert


def test_echter_stillstand_bleibt_null():
    g = _spur([0, 0, 0], schritt=2e-6)                        # ~0,2 m/s Rauschen
    assert [r[3] for r in tempo_auffuellen(g)] == [0, 0, 0]


def test_minus_eins_heisst_kein_tempo():
    g = _spur([-1, -1, -1], schritt=2e-6)
    out = tempo_auffuellen(g)
    assert out[0][3] == 0.0 and all(0 < r[3] < 0.5 for r in out[1:])


def test_ohne_position_oder_tempo_nichts_tun():
    g = [[0, 52.0, 13.0, 3.0], [1000, None, None, 0], [2000, 52.0, 13.0, None], [3000, 52.0, 13.0]]
    assert tempo_auffuellen(g) == g
