"""Gemischte Ansicht mehrerer Sportarten in einer Rangliste (Jan, 08.11.2026).

Anlass: Pumpfoil gegen Foil Scoot (Community-Chat 07./08.11.2026). Ein Scooter-Fahrer will nicht in eine Sonderwertung
abgeschoben werden, andere wollen „nur freies Pumpfoilen" sehen. Jans Loesung: getrennte Listen bleiben, dazu eine
gemischte Ansicht „Pumpfoil + Foil Scoot", in der jede Zeile ein Abzeichen der Sportart traegt.

Schluessel: die Sportarten mit „+" verbunden, z. B. `pumpfoil+foil_scoot`. Er geht ueberall durch, wo heute eine
Sportart steht (`sport=`-Parameter, `sportart` einer Event-Bestenliste), und `community._community` filtert auf alle
Teile. Die Rechnung ist generisch (jede Kombination bekannter Sportarten); ANGEBOTEN werden nur die Paare in `MIXE`
— vorerst genau eines.
"""
from __future__ import annotations

from .sportarten import SPORTS, SPORTS_LEGACY

TRENNER = "+"
# Angebotene Mischungen (Auswahlfelder, Event-Bestenlisten, Profil-Standard).
MIXE: tuple[str, ...] = ("pumpfoil+foil_scoot",)


def teile(sport: str | None) -> tuple[str, ...] | None:
    """Die Sportarten einer Mischung — None, wenn `sport` keine (gueltige) Mischung ist."""
    # Unkodiert in der Adresse wird „+" zum Leerzeichen (`?sport=pumpfoil+foil_scoot`) — beides gilt.
    if not sport or (TRENNER not in sport and " " not in sport):
        return None
    t = tuple(dict.fromkeys(x for x in sport.replace(" ", TRENNER).split(TRENNER) if x))
    if len(t) < 2 or any(x not in SPORTS and x not in SPORTS_LEGACY for x in t):
        return None
    return t


def ist_mix(sport: str | None) -> bool:
    return teile(sport) is not None


def schluessel(sportarten) -> str:
    """Mischungs-Schluessel in fester Reihenfolge (die der Sportarten-Liste)."""
    s = set(sportarten)
    return TRENNER.join(x for x in (*SPORTS, *SPORTS_LEGACY) if x in s)


def angeboten(vorhanden) -> list[str]:
    """Die Mischungen aus MIXE, deren Teile ALLE in `vorhanden` stehen."""
    v = set(vorhanden)
    return [m for m in MIXE if all(x in v for x in teile(m) or ())]


def gueltig(sport: str | None, standard: str = "pumpfoil") -> str:
    """Sportart oder Mischung pruefen; sonst `standard`."""
    if sport in SPORTS or sport in SPORTS_LEGACY or sport == "all":
        return sport
    t = teile(sport)
    return TRENNER.join(t) if t else standard
