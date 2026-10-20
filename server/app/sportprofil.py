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
    # Motor/Seil (19.10.2026): Pumps zaehlen dort nicht, die Kadenz waere Rauschen. Skala 8-30 km/h:
    # gemessen Hoechsttempo eFoil/Foildrive Median 22, p90 26 km/h (10-40 liess die Haelfte ungenutzt).
    "motor": {"pumpzahlen": False, "tempo_skala": [8, 30]},
}

# Abweichungen einzelner Sportarten vom Gruppenstand.
JE_SPORT = {
    # eFoil/Foildrive fahren durchgehend wie Wind: ganze Fahrt + Schalter, Gesamtzahlen vorn, Fahrten
    # (Stand-Buch: motor fahrten/kartenschalter, Claude-Vorschlag 19.10.). Towed bleibt bei Laeufen:
    # jeder Zug ist ein eigener Lauf, die Rueckfahrt im Boot gehoert nicht auf die Karte.
    "efoil": {"karte": "ganz", "hauptzahl": "gesamt"},
    "foildrive": {"karte": "ganz", "hauptzahl": "gesamt"},
    # SUP/Paddeln (Jan, 20.10.2026: „die on-foil die daraus folgten als eigene Ansicht, derzeit nur der
    # gesamte track"): Schalter ganze Fahrt / nur Foil; die Sprints zeichnet die Karte aus /paddel.
    "sup_paddle": {"karte": "ganz"},
    # Wake thief (Jan, 20.10.2026: „bei wake-thief das gleiche bitte"): Schalter wie SUP; die Wellenstuecke
    # zeichnet die Karte aus /welle-pumpen.
    "wakethief": {"karte": "ganz"},
    # Downwind (Jan, 20.10.2026: „bei surf/downwind will ich auch wie beim SUP die ganze strecke sehen
    # koennen"): Schalter ganze Fahrt / nur Foil.
    "surf_downwind": {"karte": "ganz"},
}


def profil(sport_class: str | None) -> dict:
    gruppe = GRUPPE.get(sport_class or "pumpfoil", "pump")
    return {"gruppe": gruppe, **STANDARD, **JE_GRUPPE.get(gruppe, {}), **JE_SPORT.get(sport_class or "", {})}
