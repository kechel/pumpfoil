"""Brett-Regeln pump / gleiten / aus (app/analysis/brett_regeln.py), an synthetischen Daten."""
import numpy as np

from app.analysis import brett_regeln as BR


def _lauf(pump_s=20.0, nachschwingen_s=6.0, vor=5.0, nach=10.0, f=1.4):
    """Hub-Sinus mit phasenrichtigem Nicken (Energie), danach Nachschwingen OHNE Nicken."""
    n = int((vor + pump_s + nachschwingen_s + nach) * BR.HZ)
    t = np.arange(n) / BR.HZ * 1000.0
    s = t / 1000.0
    a, mitte, ende = vor * 1000, (vor + pump_s) * 1000, (vor + pump_s + nachschwingen_s) * 1000
    hub = np.where((t >= a) & (t < ende), 8 * np.sin(2 * np.pi * f * s), 0.0)
    # Nicken in Phase mit der Hub-GESCHWINDIGKEIT -> positive Kopplung, nur waehrend des Pumpens
    pitch = np.where((t >= a) & (t < mitte), 4 * np.cos(2 * np.pi * f * s), 0.0)
    return t, hub, pitch, (a, ende)


def _gps(a, b, aufsetzen):
    t = np.arange(0, b + 12000, 1000.0)
    v = np.where((t >= a) & (t < aufsetzen), 4.0, 1.0)        # 14,4 km/h, danach 3,6 km/h
    return np.column_stack([t, np.zeros_like(t), np.zeros_like(t), v])


def test_pumps_und_gleiten_bis_zum_aufsetzen():
    t, hub, pitch, (a, b) = _lauf()
    gps = _gps(a, b, aufsetzen=b - 2000)
    lab, lauf = BR.je_lauf(t, hub, pitch, gps, [(a, b)])
    k = lauf[0]
    assert k["ok"] and k["aufsetzen_quelle"] == "gps"
    assert abs(k["aufsetzen_ms"] - (b - 2000 - BR.DOPPLER_NACHLAUF_MS)) < 1
    assert 24 <= k["pumps"] <= 30                       # ~1,4 Hz x 20 s
    assert k["gleit_s"] > 3                              # Nachschwingen ohne Energie = gleiten
    assert np.all(lab[t < a] == 0) and np.all(lab[t > k["aufsetzen_ms"] + 50] == 0)


def test_ohne_gps_gilt_das_erkannte_ende():
    t, hub, pitch, (a, b) = _lauf()
    _, lauf = BR.je_lauf(t, hub, pitch, np.empty((0, 4)), [(a, b)])
    assert lauf[0]["aufsetzen_quelle"] == "lauf" and lauf[0]["aufsetzen_ms"] == b


def test_zu_wenig_zyklen_keine_pump_aussage():
    t, hub, pitch, (a, b) = _lauf(pump_s=2.0, nachschwingen_s=0.0)
    _, lauf = BR.je_lauf(t, hub, pitch, np.empty((0, 4)), [(a, b)])
    assert not lauf[0]["ok"] and lauf[0]["pumps"] is None and lauf[0]["gleit_s"] is None


def test_aufsetzen_verlaengert_den_lauf_nie():
    t, hub, pitch, (a, b) = _lauf()
    gps = _gps(a, b + 8000, aufsetzen=b + 5000)   # GPS sieht das Aufsetzen erst NACH dem Laufende
    lab, lauf = BR.je_lauf(t, hub, pitch, gps, [(a, b)])
    assert lauf[0]["aufsetzen_ms"] <= b and np.all(lab[t > b] == 0)


def test_montage_nur_in_den_laeufen():
    t, hub, pitch, (a, b) = _lauf()
    roll = np.zeros_like(pitch)
    mo = BR.montage(t, pitch + 30 * (t > b), roll, [(a, b)])   # nach dem Lauf beliebig gedreht
    assert mo["nick_anteil"] == 1.0


def test_gleitzeit_nach_der_anzeige_regel():
    """Gleitzeit = Stuecke ohne Pump von 1,5-15 s, das Laufende zaehlt, kurze Luecken zwischen
    Zyklen nicht (Jan, 10.10.2026)."""
    t, hub, pitch, (a, b) = _lauf(pump_s=20.0, nachschwingen_s=6.0)
    _, lauf = BR.je_lauf(t, hub, pitch, np.empty((0, 4)), [(a, b)])
    k = lauf[0]
    assert len(k["gleit_phasen_ms"]) == 1                      # nur das Nachschwingen am Ende
    x, y = k["gleit_phasen_ms"][0]
    assert BR.GLEIT_MIN_S <= (y - x) / 1000 <= BR.GLEIT_MAX_S and y >= b - 100
    assert abs(k["gleit_s"] - (y - x) / 1000) < 0.05


def test_keine_gleitzeit_ueber_eine_datenluecke():
    t, hub, pitch, (a, b) = _lauf(pump_s=20.0, nachschwingen_s=6.0)
    echt = ~((t > b - 3000) & (t < b - 2000))                 # 1 s ohne Messwerte im Nachschwingen
    _, lauf = BR.je_lauf(t, hub, pitch, np.empty((0, 4)), [(a, b)], echt=echt)
    assert lauf[0]["gleit_phasen_ms"] == [] and lauf[0]["gleit_s"] == 0
