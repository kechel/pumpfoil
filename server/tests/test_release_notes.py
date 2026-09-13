"""Die Statuszeile auf /changelog folgt der Liste, in der ein Eintrag steht.

Anlass (13.09.2026): auf der oeffentlichen Seite stand unter der Ueberschrift „Being reviewed"
die Zeile „built, waiting to be uploaded". Der Eintrag war nach IN_REVIEW verschoben worden, der
von Hand geschriebene Satz aber stehen geblieben — zwei Aussagen, die sich widersprechen, und die
falsche war die sichtbarere. Seitdem wird der Satz erzeugt; diese Tests halten das fest.
"""
from __future__ import annotations

import pytest

from app.api import appmeta as A

LISTEN = [("review", A.IN_REVIEW), ("next", A.NAECHSTES), ("rejected", A.ABGELEHNT)]


@pytest.mark.parametrize("zustand,liste", LISTEN, ids=[z for z, _ in LISTEN])
def test_keine_zeile_von_hand(zustand, liste):
    """Ein `note`-Feld im Eintrag waere genau der Fehler von neulich — es gibt keins mehr."""
    von_hand = [e["name"] for e in liste if "note" in e]
    assert von_hand == [], f"{zustand}: Statuszeile von Hand bei {von_hand}"


def test_review_sagt_eingereicht_und_wer_prueft():
    for e in A.IN_REVIEW:
        note = A._note(e, "review")
        assert note.startswith("submitted "), note
        assert "waiting for " in note, note
        # Der eigentliche Regressionsfall: unter „Being reviewed" darf nie stehen, dass etwas
        # noch hochgeladen werden muss.
        assert "upload" not in note.lower(), note


def test_jede_gruppe_hat_einen_pruefer():
    """Sonst bricht `_note` beim naechsten Verschieben mit einem KeyError."""
    for _, name in A.GRUPPEN:
        assert name in A.PRUEFER, f"Kein Pruefer fuer {name}"


@pytest.mark.parametrize("zustand,liste", LISTEN, ids=[z for z, _ in LISTEN])
def test_jeder_eintrag_hat_seine_pflichtangabe(zustand, liste):
    for e in liste:
        if zustand == "review":
            assert e.get("eingereicht"), f"{e['name']}: Einreichungsdatum fehlt"
        if zustand == "rejected":
            assert e.get("abgelehnt"), f"{e['name']}: Ablehnungsdatum fehlt"
        # NAECHSTES braucht nichts — „built, waiting to be uploaded" ist der Normalfall.


def test_datum_traegt_das_jahr_nur_wenn_noetig():
    from datetime import date
    heute = date.today()
    assert A._datum(f"{heute.year}-09-13") == "13 September"
    assert A._datum("2024-01-05") == "5 January 2024"


@pytest.mark.parametrize("zustand,liste", LISTEN, ids=[z for z, _ in LISTEN])
def test_ausgabe_traegt_die_erzeugte_zeile(zustand, liste):
    for e in A._mit_note(liste, zustand):
        assert e["note"], f"{zustand}: leere Statuszeile bei {e['name']}"
