"""Uhr-Name einer Aufnahme (03.11.2026): meldete sich eine Garmin zuletzt, bevor build-all ihre Part-Number kannte,
steht beim Geraet nur „Garmin" — die Session-Seite nimmt dann den Namen frisch aus der partmap, wie das Profil."""
from __future__ import annotations

from app.api import devices, sessions


def test_gattung_wird_aus_partmap_ersetzt(monkeypatch):
    monkeypatch.setattr(devices, "_partmap", lambda: {"006-B5169-00": {"id": "enduro4", "name": "Enduro™ 4"}})
    assert sessions._geraet_name("Garmin", "garmin", "006-B5169-00") == "Enduro™ 4"
    assert sessions._geraet_name(None, "garmin", "006-B5169-00") == "Enduro™ 4"
    # gespeichertes Modell bleibt, unbekannte Part-Number bleibt Gattung, andere Plattformen unberuehrt
    assert sessions._geraet_name("fēnix® 7X Pro", "garmin", "006-B5169-00") == "fēnix® 7X Pro"
    assert sessions._geraet_name("Garmin", "garmin", "006-B0000-00") == "Garmin"
    assert sessions._geraet_name("wear", "wear", "006-B5169-00") == "Wear OS"
