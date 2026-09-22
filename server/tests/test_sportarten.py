"""Die Sportarten-Liste — eine Quelle, vier Kopien, und alle muessen sie gleich lauten.

Neu am 22.09.2026: `foil_scoot` (Jan: „Foil Scoot als weitere sportart mit aufnehmen").
Der Test prueft, was der Server tatsaechlich annimmt — und dass die Listen in Web, Android und
iOS nicht auseinanderlaufen. Genau das ist hier die Gefahr: die Liste steht an vier Stellen,
und eine vergessene Kopie faellt niemandem auf, bis ein Nutzer die Sportart in der App sucht
und nicht findet (oder der Server seine Auswahl mit 400 abweist).
"""
from __future__ import annotations

import re
from pathlib import Path

from app.api.sessions import SPORTS

WURZEL = Path(__file__).resolve().parents[2]


def _liste_aus(pfad: Path, muster: str) -> list[str]:
    text = (WURZEL / pfad).read_text(encoding="utf-8")
    m = re.search(muster, text, re.S)
    assert m, f"Liste nicht gefunden in {pfad}"
    return re.findall(r'"([a-z_]+)"', m.group(1))


def test_foil_scoot_ist_zulaessig():
    assert "foil_scoot" in SPORTS
    # `other` bleibt der letzte Eintrag — die Oberflaechen zeigen die Liste in dieser Reihenfolge.
    assert SPORTS[-1] == "other"


def test_alle_vier_listen_sind_deckungsgleich():
    web = _liste_aus(Path("web/src/lib/sportClass.ts"),
                     r"export const SPORTS = \[(.*?)\] as const;")
    android = _liste_aus(Path("android/app/src/main/java/org/pumpfoil/app/SportClass.kt"),
                         r"listOf\((.*?)\)")
    ios = _liste_aus(Path("watch-apple/Sources-iOS/SportClass.swift"), r"= \[(.*?)\]")
    assert web == list(SPORTS), web
    assert android == list(SPORTS), android
    assert ios == list(SPORTS), ios


def test_jede_sportart_hat_ein_label_in_jeder_sprache():
    """Fehlt ein Schluessel, zeigt die Oberflaeche den nackten Code („foil_scoot")."""
    for datei in sorted((WURZEL / "web/src/i18n/locales").glob("*.ts")):
        text = datei.read_text(encoding="utf-8")
        fehlend = [s for s in SPORTS if f'"cls.sport.{s}"' not in text]
        assert not fehlend, f"{datei.name}: {fehlend}"
