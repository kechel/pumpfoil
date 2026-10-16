"""Admin-Statistik: „aktive Nutzer" je Fenster zaehlt PERSONEN, nicht Fahrer-Tage (Jan, 16.10.2026)."""
from app.api.admin import _fenster_distinct


def test_fenster_zaehlt_verschiedene_nutzer():
    paare = [("2026-10-01", 1), ("2026-10-02", 1), ("2026-10-03", 1), ("2026-10-03", 2),
             ("2026-10-05", 3)]
    f = _fenster_distinct(paare, "2026-10-06")
    assert f["1"]["2026-10-03"] == 2 and f["1"]["2026-10-04"] == 0     # Tageswert
    assert f["3"]["2026-10-03"] == 2                                    # 1 an drei Tagen = 1
    assert f["3"]["2026-10-05"] == 3 and f["3"]["2026-10-06"] == 1     # 1+2 fallen heraus
    assert f["365"]["2026-10-06"] == 3 and f["0"]["2026-10-06"] == 3
    assert list(f["0"])[-1] == "2026-10-06"                             # Achse bis heute


def test_fenster_leer():
    assert _fenster_distinct([], "2026-10-06")["30"] == {}
