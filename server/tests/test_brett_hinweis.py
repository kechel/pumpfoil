"""Die Frage „Sass das Handy am Brett?" — das Urteil aus den Lage-Kennzahlen je Lauf."""
from app.api.sessions import brett_urteil


def _lauf(nick, roll, hub=True):
    return {"ok": True, "pitch_amplitude_deg": nick, "roll_amplitude_deg": roll, "hub_sicher": hub}


def test_10195_wird_gefragt():
    """Bestaetigt am Brett, zwei von vier Laeufen mit mehr Rollen als Nicken. Mit dem Quotienten
    der Mediane (1,13) fiel sie durch; je Lauf gerechnet 1,20."""
    u = brett_urteil([_lauf(26.5, 17.7), _lauf(24.3, 27.0), _lauf(12.4, 20.3), _lauf(18.8, 7.5)])
    assert u["verdacht"] is True and u["nick_roll"] == 1.20 and u["hub_anteil"] == 1.0


def test_am_koerper_bleibt_draussen():
    # Gleich stark auf beiden Achsen und kaum sicherer Takt: das Muster der „Koerper"-Aufnahmen.
    u = brett_urteil([_lauf(10, 11, False), _lauf(9, 10, False), _lauf(12, 12, True), _lauf(8, 9, False)])
    assert u["verdacht"] is False


def test_ohne_sicheren_takt_kein_verdacht():
    # Wie #9484: klar nickend, aber kein Lauf mit sicherem Hub -> lieber nicht fragen.
    assert brett_urteil([_lauf(30, 9, False), _lauf(28, 9, False)])["verdacht"] is False


def test_ohne_auswertbaren_lauf_kein_urteil():
    assert brett_urteil([]) is None
    assert brett_urteil([{"ok": False}]) is None
