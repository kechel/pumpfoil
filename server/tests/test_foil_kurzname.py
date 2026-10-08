"""Foil-Namen fuer die Uhren: hoechstens 24 Zeichen, die Groesse bleibt immer ganz (Jan, 08.10.2026)."""
from app.api.devices import foil_kurzname


def test_passt_bleibt_alles():
    assert foil_kurzname("Gong", "SIRUS", "XL") == "Gong SIRUS XL"


def test_erst_marke_weg():
    assert foil_kurzname("Sabfoil", "LEVIATHAN PRO", "1060") == "LEVIATHAN PRO 1060"


def test_dann_modell_gekuerzt_groesse_bleibt():
    a = foil_kurzname("Gong", "TRAIL V3 / V3 ATMO PERF", "L")
    b = foil_kurzname("Gong", "TRAIL V3 / V3 ATMO PERF", "XXL")
    assert a.endswith(" L") and b.endswith(" XXL") and a != b
    assert len(a) <= 24 and len(b) <= 24
    c = foil_kurzname("Cabrinha", "Fusion H-Series MKII", "H1050")
    assert c.endswith(" H1050") and len(c) <= 24


def test_ohne_groesse_und_leer():
    assert foil_kurzname("Gong", "TRAIL V3 / V3 ATMO PERF", None).startswith("TRAIL V3")
    assert len(foil_kurzname("Gong", "TRAIL V3 / V3 ATMO PERF", None)) <= 24
    assert foil_kurzname(None, None, None) == ""
