"""Autofahrten in einer Aufnahme (analysis/autofahrt.py, 04.10.2026) — synthetisch, ohne DB."""
import json
import math
from types import SimpleNamespace

from app.analysis import analyse_ausschluss, autofahrt as A

LAT0, LON0 = 51.85, 7.49
M_PRO_GRAD = 111_320.0


def _spur(stuecke):
    """stuecke: [(dauer_s, kmh, richtung_grad)] -> GPS-Rohzeilen, 1 Hz."""
    out, t, la, lo = [], 0, LAT0, LON0
    for dauer, kmh, ri in stuecke:
        for _ in range(int(dauer)):
            v = kmh / 3.6
            la += v * math.cos(math.radians(ri)) / M_PRO_GRAD
            lo += v * math.sin(math.radians(ri)) / (M_PRO_GRAD * math.cos(math.radians(LAT0)))
            out.append([t * 1000, la, lo, v, None, 4.0])
            t += 1
    return out


def _hin_und_her(n, kmh=13):
    """n Laeufe am Spot: je 40 s hin, 40 s Pause, 40 s zurueck."""
    s = []
    for _ in range(n):
        s += [(40, kmh, 0), (40, 0.5, 0), (40, kmh, 180), (40, 0.5, 0)]
    return s


def test_fahrt_zwischen_zwei_spots_wird_gefunden_und_der_lauf_davor_bleibt():
    spur = _spur(_hin_und_her(3) + [(120, 4, 90)]            # zu Fuss zum Auto (Schritttempo)
                 + [(30, 25, 90), (300, 90, 90), (60, 30, 90), (60, 0, 0)]   # Fahrt, dann Halt
                 + _hin_und_her(2))
    f = A.fahrten(spur, 55)
    assert len(f) == 1
    a, b, spitze = f[0]
    assert spitze > 80
    assert a >= (3 * 160 + 100) * 1000          # beginnt NACH dem Fussweg, nicht schon im Lauf
    assert b <= (3 * 160 + 120 + 450 + 60) * 1000


def test_positionssprung_ist_keine_fahrt():
    spur = _spur(_hin_und_her(4))
    spur[200][1] += 0.02                         # ein Punkt 2 km daneben
    assert A.fahrten(spur, 55) == []


def test_schneller_kite_lauf_bleibt_unberuehrt():
    spur = _spur([(60, 0, 0), (90, 58, 0), (60, 0, 0), (90, 58, 180), (60, 0, 0)])
    assert A.fahrten(spur, A.spitze_fuer("kitefoil")) == []
    assert A.spitze_fuer("other") is None        # Rad/Laufen: gar keine Fahrterkennung


def test_zurueckgeholte_fahrt_wird_nicht_ausgeschlossen():
    s = SimpleNamespace(excluded_ranges=json.dumps([[0, 1000]]),
                        auto_fahrten=json.dumps([[5000, 9000, 90.0], [20000, 30000, 70.0]]),
                        fremdkraft_keep=json.dumps([[20000, 30000]]))
    assert analyse_ausschluss(s) == [(0, 1000), (5000, 9000)]


def test_grenzen_je_sportart():
    from app.analysis import gps as v1
    assert v1.grenzen_fuer("pumpfoil") == (v1.MAX_FOIL_SPEED, v1.RUN_MAX_PLAUSIBLE_KMH)
    assert v1.grenzen_fuer(None) == (v1.MAX_FOIL_SPEED, v1.RUN_MAX_PLAUSIBLE_KMH)
    band, spitze = v1.grenzen_fuer("kitefoil")
    assert round(band * 3.6, 6) == 60.0 and spitze == 70.0
    seg_schnell = {"max_speed_mps": 45 / 3.6, "avg_speed_mps": 35 / 3.6}
    assert v1._gate_implausible_runs([seg_schnell])[1] == 1                      # Pumpfoil: weg
    assert v1._gate_implausible_runs([seg_schnell], spitze, band)[1] == 0        # Kite: bleibt
