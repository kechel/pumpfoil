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

# Seit 25.10.2026 aus der EINEN Liste (data/sportarten.json): Gruppe je Sportart, Standard-Profil, Abweichungen je Gruppe
# und je Sportart. Die Begruendungen der einzelnen Werte (eFoil/Foildrive „ganz", SUP/Wake thief/Downwind Schalter,
# Motor-Skala 8-30 km/h) stehen in der Git-Geschichte dieser Datei (bis Commit vor dem 25.10.) und im Stand-Buch.
from .sportarten import FOIL, GRUPPE, GRUPPEN_PROFIL as JE_GRUPPE, SPORT_PROFIL as JE_SPORT, STANDARD_PROFIL as STANDARD  # noqa: E402


def profil(sport_class: str | None) -> dict:
    gruppe = GRUPPE.get(sport_class or "pumpfoil", "pump")
    # `foil` (25.10.2026): False bei Sportarten ohne On-Foil-Fahren (Kitesurfen, Windsurfen, Snowkite …) — die Clients
    # sagen dann „Fahrt" statt „on foil" und zeigen keinen Foil-Anteil.
    return {"gruppe": gruppe, **STANDARD, **JE_GRUPPE.get(gruppe, {}), **JE_SPORT.get(sport_class or "", {}),
            "foil": FOIL.get(sport_class or "pumpfoil", True)}
