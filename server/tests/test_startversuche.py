"""Startversuche „Ruhe -> schnell -> Ruhe oder GPS-Abriss" (app/analysis/startversuche.py, 25.10.2026, u439 Front-Start)."""
import numpy as np

from app.analysis import startversuche as SV

HZ = 25.0


def _ruhe(s, rng):
    return 1.0 + rng.normal(0, 0.02, int(s * HZ))


def _anlauf(s, rng):
    """Schritte/Anschieben: alle 0,35 s ein Stoss auf ~6 g, dazwischen Bewegung."""
    n = int(s * HZ)
    x = 1.0 + rng.normal(0, 0.6, n)
    x[::int(0.35 * HZ)] = 6.0
    return x


def _gps(verlauf_kmh, t0_s=0.0, ausfall=()):
    out, lat = [], 47.0
    for k, v in enumerate(verlauf_kmh):
        t = t0_s + k
        lat += v / 3.6 / 111320.0
        if any(a <= t < b for a, b in ausfall):
            continue
        out.append([t * 1000.0, lat, 9.0, v / 3.6, 0, 5.0])
    return out


def test_anlauf_nach_ruhe_wird_gefunden_einzelstoss_nicht():
    rng = np.random.default_rng(1)
    mag = np.r_[_ruhe(20, rng), _anlauf(3, rng), _ruhe(20, rng)]
    mag[int(30 * HZ)] = 9.0     # einzelner Stoss ohne Anlauf (Klopfen) — kein Anlauf
    al = SV.anlaeufe(mag * 1000, HZ)      # Einheit egal (Garmin ~1000/g): normiert auf den Median
    assert len(al) == 1 and 19.5 < al[0][0] < 20.5 and 22.5 < al[0][1] < 23.6, al


def test_front_start_kurz_mit_anlauf_zaehlt():
    """#12734-Muster: 0 -> 11 km/h fuer EINEN Punkt -> wieder langsam. Ohne Anlauf waere es ein GPS-Sprung."""
    gps = _gps([0.5] * 20 + [3, 11, 4, 1] + [0.5] * 20)
    assert SV.startversuche(gps, []) == []
    vs = SV.startversuche(gps, [(18.0, 21.0)])
    assert [e["weg"] for e in vs] == ["A"] and abs(vs[0]["t"] - 21) < 0.1


def test_ohne_anlauf_nichts_neues_gehen_nie():
    """Ohne Anlauf zaehlt nur die alte Zaehlung — auch zwei schnelle Punkte nicht (verrauschte Spuren, #18822)."""
    assert SV.startversuche(_gps([0.5] * 20 + [9, 12, 3] + [0.5] * 20), []) == []
    # Gehen/Zurueckschwimmen 5-7 km/h ohne Anlauf: nie ein Versuch
    assert SV.startversuche(_gps([0.5] * 10 + [6, 7, 6, 7, 6, 7] * 5 + [0.5] * 10), []) == []
    # mit Anlauf und nur 7 km/h: Weg C
    vs = SV.startversuche(_gps([0.5] * 20 + [7, 7, 2] + [0.5] * 20), [(18.0, 20.5)])
    assert [e["weg"] for e in vs] == ["C"]


def test_kein_start_aus_der_fahrt():
    """Tempo-Delle mitten im Lauf ist kein neuer Versuch (davor nicht in Ruhe), auch mit Bewegung dort."""
    gps = _gps([0.5] * 10 + [12] * 30 + [7] + [12] * 30 + [0.5] * 10)
    assert len(SV.startversuche(gps, [(8.0, 10.5), (38.0, 40.5)])) == 1


def test_abriss_am_steg_braucht_den_steg():
    # drei normale Versuche am selben Ort, dann ein Anlauf und 10 s kein GPS
    verlauf = []
    for _ in range(3):
        verlauf += [0.0] * 20 + [10, 11, 2]
    verlauf += [0.0] * 20 + [0.0] * 15 + [0.0] * 10
    gps = _gps(verlauf, ausfall=[(89, 101)])
    lauf_an = [(18 + 23 * k, 20.5 + 23 * k) for k in range(3)] + [(87.0, 90.0)]
    vs = SV.startversuche(gps, lauf_an)
    assert [e["weg"] for e in vs] == ["A", "A", "A", "B"]
    # nur einer davor: kein Steg bestimmbar -> kein B
    assert [e["weg"] for e in SV.startversuche(gps[23 * 2:], [(64.0, 66.5), (87.0, 90.0)])] == ["A"]


def test_zaehlen_alt_plus_neu_ohne_doppelte():
    vs = [{"t": 10.0, "weg": "A", "strecke_m": 5.0}, {"t": 60.0, "weg": "C", "strecke_m": 3.0},
          {"t": 300.0, "weg": "A", "strecke_m": 4.0}]
    alte = [(11.0, 15.0), (299.0, 14.0), (400.0, 13.0)]
    # Lauf bei 12 s schluckt den alten (11) und den neuen (10); 299/300 ist derselbe Start; Lauf bei 200 s hat keinen
    # Versuch und zaehlt trotzdem; alter Versuch bei 400 s bleibt
    assert SV.zaehlen(vs, alte, [(12.0, 120.0), (200.0, 80.0)]) == [120.0, 3.0, 80.0, 14.0, 13.0]
    assert SV.zaehlen([], [], [(5.0, 50.0)]) == [50.0]
    assert SV.zaehlen([], [], []) == []


def test_pumpfoil_ohne_lauf_braucht_fuenf_belegte_versuche_ohne_weg_c():
    v = lambda w: {"t": 0.0, "weg": w, "strecke_m": 0.0}   # noqa: E731
    assert SV.pumpfoil_per_versuche([v("A")] * 4 + [v("B")]) == (True, 5)
    assert SV.pumpfoil_per_versuche([v("A")] * 4 + [v("C")] * 6) == (False, 4)
    assert SV.pumpfoil_per_versuche(None) == (False, 0)
