"""Wake thief: Welle gegen Pumpen (app/welle_pumpen.py, 20.10.2026) an kuenstlichen Daten."""
import numpy as np

from app import welle_pumpen

HZ = 25.0


def _lauf(abschnitte):
    """abschnitte: (Dauer s, Ausschlag, Tempo km/h) -> t_s, accel, gps (1 Hz, faehrt nach Norden)."""
    t, acc, gps, t0, lat = [], [], [], 0.0, 47.0
    for dauer, amp, kmh in abschnitte:
        n = int(dauer * HZ)
        tt = t0 + np.arange(n) / HZ
        t.append(tt)
        acc.append(np.c_[np.zeros(n), np.zeros(n), 1.0 + amp * np.sin(2 * np.pi * 1.7 * tt)])
        for s in np.arange(t0, t0 + dauer, 1.0):
            gps.append([int(s * 1000), lat, 8.0, kmh / 3.6])
            lat += kmh / 3.6 / 111195.0
        t0 += dauer
    return np.concatenate(t), np.concatenate(acc), gps


def test_welle_in_der_mitte():
    t, acc, gps = _lauf([(40, 0.6, 15), (60, 0.03, 20), (30, 0.6, 15)])
    pumps = [float(x) for x in np.arange(0.5, 130, 0.6)]          # Analyse zaehlt auch auf der Welle
    e = welle_pumpen.auswerten(t, acc, HZ, gps, [{"lo": 0.0, "hi": 130.0, "pumps_t": pumps}])
    assert 50 <= e["welle_s"] <= 62
    assert 65 <= e["gepumpt_s"] <= 80
    assert e["laengste_welle_s"] == e["welle_s"]
    assert 300 <= e["welle_m"] <= 360                              # 20 km/h ~ 5,6 m/s
    # nur Pumps ausserhalb der Welle
    assert e["pumps"] < len(pumps) - 80
    assert len(e["abschnitte"]) == 1
    assert len(e["linien"]) == 1 and len(e["linien"][0]) >= 50 and len(e["linien"][0][0]) == 2


def test_nur_pumpen():
    t, acc, gps = _lauf([(60, 0.6, 15)])
    e = welle_pumpen.auswerten(t, acc, HZ, gps, [{"lo": 0.0, "hi": 60.0, "pumps_t": [1.0, 2.0]}])
    assert e["welle_s"] == 0 and e["pumps"] == 2 and e["abschnitte"] == []


def test_ohne_lauf():
    t, acc, gps = _lauf([(60, 0.6, 15)])
    assert welle_pumpen.auswerten(t, acc, HZ, gps, []) is None


def test_kurzer_wellenwechsel_wird_ueberbrueckt():
    t, acc, gps = _lauf([(30, 0.6, 15), (30, 0.03, 20), (5, 0.6, 18), (30, 0.03, 20), (30, 0.6, 15)])
    e = welle_pumpen.auswerten(t, acc, HZ, gps, [{"lo": 0.0, "hi": 125.0, "pumps_t": []}])
    assert len(e["abschnitte"]) == 1 and e["laengste_welle_s"] >= 60


def test_leichtes_pumpen_auf_der_welle():
    # Gleichgewicht halten: ein Drittel des Ausschlags -> zaehlt als Welle
    t, acc, gps = _lauf([(40, 0.6, 15), (60, 0.2, 20), (30, 0.6, 15)])
    e = welle_pumpen.auswerten(t, acc, HZ, gps, [{"lo": 0.0, "hi": 130.0, "pumps_t": []}])
    assert e["welle_s"] >= 50


def test_ausrollen_am_laufende_ist_keine_welle():
    t, acc, gps = _lauf([(60, 0.6, 16), (8, 0.03, 9)])
    e = welle_pumpen.auswerten(t, acc, HZ, gps, [{"lo": 0.0, "hi": 68.0, "pumps_t": []}])
    assert e["welle_s"] == 0
