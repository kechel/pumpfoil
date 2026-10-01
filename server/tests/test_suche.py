"""Suche ohne Akzente/Bindestriche (Jan, 01.10.2026: „teste mal alle Suchfunktionen durch").

Die Suchform entsteht zweimal — in Python (Suchtext) und in SQL (Spalte). Weichen beide ab,
findet die Suche in genau den Faellen nichts, fuer die sie gebaut ist. Deshalb hier gegeneinander.
"""
from sqlalchemy import literal, select

from app.db import SessionLocal
from app.suche import suchform, suchform_sql, worte

BEISPIELE = ["Frédéric Brg", "Jérôme michenaud", "Joël", "Łódź", "Straße", "F-One", "X-Over V3",
             "Mach-2", "Alby-sur-Chéran", "Amelsbüren", "vívoactive® 6", "fēnix® 7X Pro",
             "Ludvík", "Kraków", "Søren", "Œuvre", "Ærø", "Tomás", "Argelès-sur-Mer"]


def test_sql_und_python_ergeben_dieselbe_suchform():
    db = SessionLocal()
    try:
        for s in BEISPIELE:
            sql = db.execute(select(suchform_sql(literal(s)))).scalar()
            assert sql == suchform(s), (s, sql, suchform(s))
    finally:
        db.close()


def test_typische_eingaben():
    assert suchform("Frédéric") == "frederic"
    assert suchform("F-One") == suchform("fone") == suchform("F One".replace(" ", ""))
    assert suchform("vívoactive®") == "vivoactive"
    assert worte("  f-one   phantom ") == ["fone", "phantom"]
    assert worte("-") == []
