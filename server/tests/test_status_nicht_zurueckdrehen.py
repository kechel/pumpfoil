"""Eine Zwischenanalyse darf einen erreichten Abschluss NICHT zurueckdrehen.

Der Fehler, den das hier festhaelt (13.09.2026): `run_analysis` schrieb am Ende
`session.status = "analyzed" if final else "live"` — bedingungslos. Die Zwischenanalyse laeuft
aber minutenlang, waehrend die Chunks noch hochladen. Kam `/complete` in dieser Zeit an, setzte
es korrekt „complete", und die noch laufende Zwischenanalyse schrieb danach wieder „live".

Fuer den Nutzer hiess das: die Uhr bekam ihr 200 OK und meldete „fertig", die Aufnahme hing aber
fuer immer in der Upload-Karte („bring deine Uhr in Reichweite"), bekam keine Benachrichtigung,
keinen Auto-Zuschnitt und stand in der Liste nur unter „Aussortiert". Betroffen waren 12
Aufnahmen von 9 echten Nutzern, die aelteste vom 07.09.

Geprueft wird `analysis.neuer_status` — die Entscheidung selbst, nicht eine Kopie davon.
"""
from __future__ import annotations

import pytest

from app.analysis import neuer_status


@pytest.mark.parametrize("erreicht", ["complete", "analyzed"])
def test_zwischenanalyse_laesst_abschluss_stehen(erreicht):
    """Der eigentliche Fall: `/complete` war schneller als die Zwischenanalyse."""
    assert neuer_status(erreicht, final=False) == erreicht


@pytest.mark.parametrize("laufend", ["recording", "live", None])
def test_zwischenanalyse_setzt_live_solange_es_laeuft(laufend):
    """Der Normalfall bleibt unveraendert."""
    assert neuer_status(laufend, final=False) == "live"


@pytest.mark.parametrize("vorher", ["recording", "live", "complete", "analyzed", None])
def test_finale_analyse_gewinnt_immer(vorher):
    """Die finale Analyse setzt `analyzed`, aus jedem Zustand heraus."""
    assert neuer_status(vorher, final=True) == "analyzed"
