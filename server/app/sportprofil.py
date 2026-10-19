"""Anzeige-Profil je Sportart (Stufe 1 des Plans vom 19.10.2026, s. data/sportarten_stand.json).

Sagt den Oberflaechen, WIE eine Session dieser Sportart gezeigt wird — nicht, wie sie ausgewertet
wird (die Analyse bleibt unberuehrt). Mitgeliefert als `sport_profil` in jeder Session-Antwort;
aeltere Apps kennen das Feld nicht und zeigen weiter wie bisher.

GRUNDSATZ: was hier nicht steht, verhaelt sich wie Pumpfoil heute. Pumpfoil selbst bekommt das
Standardprofil und damit exakt das bisherige Verhalten.

Felder:
  gruppe      pump | wind | welle | motor (wie im Stand-Buch)
  karte       "laeufe" = nur die Laeufe zeichnen (bisher fuer alle) | "ganz" = ganze Fahrt grau,
              Laeufe farbig darueber, mit Schalter „nur on-foil / ganze Fahrt"
  hauptzahl   "foil" = On-Foil-Strecke/-Zeit vorn (bisher) | "gesamt" = Gesamtstrecke + Dauer vorn,
              on-foil als zweite Zahl
  pumpzahlen  False = Pumps, Kadenz, Gleitphase ausblenden (passen nicht zur Sportart)
  tempo_skala [von, bis] km/h der Tempo-Faerbung in den Apps (bisher fest 8-25, auf Pumpen
              zugeschnitten; bei Wing war damit fast alles rot). Das Web skaliert selbst.
"""
from __future__ import annotations

GRUPPE = {
    "pumpfoil": "pump", "foil_scoot": "pump", "wakethief": "pump", "sup_paddle": "pump",
    "wingfoil": "wind", "kitefoil": "wind", "parawing": "wind",
    "surf_wave": "welle", "surf_downwind": "welle",
    "efoil": "motor", "foildrive": "motor", "towed": "motor",
}

STANDARD = {"karte": "laeufe", "hauptzahl": "foil", "pumpzahlen": True, "tempo_skala": [8, 25]}

# Nur Abweichungen vom Standard. Stufe 1: die Wind-Gruppe.
JE_GRUPPE = {
    "wind": {"karte": "ganz", "hauptzahl": "gesamt", "pumpzahlen": False, "tempo_skala": [10, 40]},
}


def profil(sport_class: str | None) -> dict:
    gruppe = GRUPPE.get(sport_class or "pumpfoil", "pump")
    return {"gruppe": gruppe, **STANDARD, **JE_GRUPPE.get(gruppe, {})}
