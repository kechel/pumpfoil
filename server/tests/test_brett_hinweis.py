"""Die Frage „Sass das Handy am Brett?" — Urteil aus sicherem Pumptakt und der Lage im Raum."""
import numpy as np

from app.api.sessions import brett_urteil, lage_achse_deg


def _lauf(nick, roll, hub=True):
    return {"ok": True, "pitch_amplitude_deg": nick, "roll_amplitude_deg": roll, "hub_sicher": hub}


VIER_SICHER = [_lauf(14, 12), _lauf(15, 22), _lauf(13, 19), _lauf(14, 22)]


def test_zweiter_fahrer_rollt_mehr_und_wird_trotzdem_gefragt():
    """#10248: fest am Brett, aber dort rollt es staerker als es nickt (0,70). Frueher nicht
    gefragt; die Lage (2,6° zur Achse) und der sichere Takt reichen."""
    u = brett_urteil(VIER_SICHER, 2.6)
    assert u["verdacht"] is True and u["nick_roll"] < 1


def test_schraeg_im_raum_wird_nicht_gefragt():
    """Sauberer Takt, aber schraeg (Armband, enge Tasche): so hingen alle bisher Gefragten."""
    assert brett_urteil(VIER_SICHER, 29.0)["verdacht"] is False


def test_am_koerper_bleibt_draussen():
    k = [_lauf(10, 11, False), _lauf(9, 10, False), _lauf(12, 12, True), _lauf(8, 9, False)]
    assert brett_urteil(k, 4.0)["verdacht"] is False     # auch gerade gehalten: kein sicherer Takt


def test_ohne_lage_oder_lauf_kein_urteil():
    assert brett_urteil(VIER_SICHER, None)["verdacht"] is False
    assert brett_urteil([], 3.0) is None
    assert brett_urteil([{"ok": False}], 3.0) is None


def _aufnahme(richtung, sek=30, fs=50):
    """Accel wie ein fest montiertes Handy: Schwerkraft in `richtung` plus Pump-Schwingung."""
    t = np.arange(0, sek * 1000, 1000 / fs)
    g = np.array(richtung, float) / np.linalg.norm(richtung) * 1000
    schwing = 150 * np.sin(2 * np.pi * 1.4 * t / 1000)[:, None] * np.array([[0.3, 0.3, 1.0]])
    return g + schwing, t


def test_flach_am_brett_und_hochkant_am_mast_sind_beide_ausgerichtet():
    acc, t = _aufnahme([0, 0, 1])        # flach, Display oben
    assert lage_achse_deg(acc, t, [(0, 30000)]) < 5
    acc, t = _aufnahme([0, 1, 0])        # hochkant am Mast
    assert lage_achse_deg(acc, t, [(0, 30000)]) < 5


def test_schraeg_ergibt_grossen_winkel_und_kurze_laeufe_zaehlen_nicht():
    acc, t = _aufnahme([0, 1, 1])        # 45° gekippt
    assert lage_achse_deg(acc, t, [(0, 30000)]) > 40
    assert lage_achse_deg(acc, t, [(0, 5000)]) is None
