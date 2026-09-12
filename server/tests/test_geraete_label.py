"""Uhr-Bezeichnung: Gattungs-Label durch die gemeldete Plattform ersetzen.

Hintergrund: `Api.pairClaim` schickte in der iOS- UND der Android-App fest `"label": "Garmin"`
mit. Dadurch standen am 11.09.2026 20 Apple Watches, 5 Amazfit und eine Wear-Uhr als „Garmin"
in der Geraeteliste und unter 17 Aufnahmen im oeffentlichen Community-Feed. Der Server
korrigiert das jetzt beim LESEN — die vom Geraet gemeldete Plattform ist die verlaessliche
Quelle, das Label kommt vom pairenden Client.
"""
from app.naming import geraete_label


def test_fremdes_gattungslabel_weicht_der_gemeldeten_plattform():
    assert geraete_label("Garmin", "apple") == "Apple Watch"
    assert geraete_label("Garmin", "zepp") == "Amazfit"
    assert geraete_label("Garmin", "wear") == "Wear OS"


def test_echter_modellname_bleibt_unangetastet():
    # Das ist der Kern: ersetzt wird NUR eine Gattung, nie ein aufgeloester Modellname.
    assert geraete_label("fēnix® 6 Pro / 6 Sapphire", "garmin") == "fēnix® 6 Pro / 6 Sapphire"
    assert geraete_label("SM-R915F", "wear") == "SM-R915F"
    assert geraete_label("Amazfit T-Rex 3 (8716545)", "zepp") == "Amazfit T-Rex 3 (8716545)"
    assert geraete_label("vívoactive® 6", "apple") == "vívoactive® 6"


def test_ohne_plattform_bleibt_alles_stehen():
    # Alte Garmin-Tokens melden kein `p=` — da darf nichts passieren.
    assert geraete_label("Garmin", None) == "Garmin"
    assert geraete_label(None, None) is None


def test_handy_recorder_nicht_betroffen():
    # `ios`/`android` sind keine Uhr-Plattformen; das Label "Phone" bleibt.
    assert geraete_label("Phone", "ios") == "Phone"
    assert geraete_label("Phone", "android") == "Phone"


def test_leeres_label_bekommt_die_plattform():
    assert geraete_label(None, "apple") == "Apple Watch"
    assert geraete_label("  ", "wear") == "Wear OS"
