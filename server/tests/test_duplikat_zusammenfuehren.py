"""Duplikat-Markierung beim Zusammenfuehren von Hand (22.11.2026): Duplikat + Nicht-Duplikat = die echte, kombinierte
Fahrt (Jan: „das duplicate muss halt aufpassen beim mergen von duplicates mit nicht duplicates" · „es sollte halt nie
ein gueltiger lauf ausgeblendet werden"). Die Regel kann eine Fahrt nur wieder einblenden, nie ausblenden.
"""
from types import SimpleNamespace as NS

from app.merge import _einstufung


def _s(q, quelle="default", manuell_json=None):
    return NS(data_quality=q, sport_source=quelle, sport_class="pumpfoil", manuell_json=manuell_json,
              pumpfoil_override=None)


def test_von_hand_duplikat_plus_echte_fahrt_zaehlt():
    # Das Duplikat traegt das staerkere Urteil (Besitzer) — trotzdem bleibt die kombinierte Fahrt gueltig.
    assert _einstufung([_s("duplicate", "owner"), _s("ok")])["data_quality"] == "ok"
    assert _einstufung([_s("ok"), _s("duplicate", "admin")])["data_quality"] == "ok"


def test_von_hand_nur_duplikate_bleibt_duplikat():
    assert _einstufung([_s("duplicate", "owner"), _s("duplicate")])["data_quality"] == "duplicate"


def test_von_hand_falschdaten_unveraendert():
    assert _einstufung([_s("false_data", "admin"), _s("ok")])["data_quality"] == "false_data"
