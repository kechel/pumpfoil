"""Freitextsuche im Material-Katalog (Foils, Stabs) — UNABHAENGIG von der Wortstellung.

Anlass (24.08.): eine Meldung „Marke oder Groesse fehlt im Katalog: Axis png 1300 v2". Der Fluegel
STAND drin, seit dem 15.08. — als `AXIS` / `PNG V2` / `1300`. Gesucht wurde bis hierher mit EINEM
LIKE ueber den ganzen Suchtext je Spalte, und „png 1300 v2" ist in keiner einzelnen Spalte
enthalten: der Nutzer haette die Worte in unserer Reihenfolge tippen muessen, um sein eigenes
Material zu finden.

Das ist nicht nur unbequem, es erzeugt Datenmuell: wer sein Teil nicht findet, legt einen privaten
Eintrag an — genau die Ursache der Katalog-Dopplungen vom 17.08. Deshalb: Suchtext in WORTE
zerlegen, jedes Wort muss irgendwo vorkommen (UND ueber Worte, ODER ueber Spalten). „axis png 1300
v2", „1300 png", „png v2 1300" finden damit alle dieselbe Zeile.
"""
from __future__ import annotations

from sqlalchemy import and_, func, or_


def wort_bedingung(q: str | None, spalten: list):
    """SQL-Bedingung fuer `q` ueber `spalten` (Modell-Attribute). None = nicht filtern."""
    worte = (q or "").lower().split()
    if not worte:
        return None
    bed = []
    for wort in worte:
        like = f"%{wort}%"
        bed.append(or_(*[func.lower(func.coalesce(s, "")).like(like) for s in spalten]))
    return and_(*bed)
