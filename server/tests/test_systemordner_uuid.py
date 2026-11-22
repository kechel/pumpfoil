"""R2-G1 (Security-Review 22.11.2026): eine Session darf nicht wie ein Systemordner in data_dir heissen.

Vorher legte eine Uhr mit session_uuid "cache" (oder feedback, heatmap, geo …) eine Session an, deren Ordner der
Systemordner war; die Kontoloeschung loeschte ihn dann mit rmtree."""
from __future__ import annotations

import os

import pytest
from pydantic import ValidationError

from app import storage
from app.schemas import SessionStartIn

SYSTEM = ["cache", "feedback", "heatmap", "geo", "wind", "manoever", "_nicht-lesbar", "garmin-eingang",
          "garmin-warteschlange", "analysis-snapshots", "gesperrte-medien", "models", "ml", "sicherung"]
ECHT = ["0002ab85-8e64-4123-bd28-b0e4c9dc224e", "00555CC7-38BC-43C8-B010-7CA922DE479B", "1782389782-547089095",
        "hw-muzwca92-a4yjzq", "workout-1", "suunto-0502bfe722bf42d0ae47fcab30d2a41f", "test-52c21146d172",
        "pWQGsQkTAayHwfsNRgLwhyooVFiYZyhF"]


@pytest.mark.parametrize("name", SYSTEM)
def test_systemordner_gesperrt(name):
    assert not storage.uuid_erlaubt(name)
    with pytest.raises(ValueError):
        storage.session_dir(name)
    with pytest.raises(ValidationError):
        SessionStartIn(session_uuid=name, started_at="2026-11-22T10:00:00Z")


@pytest.mark.parametrize("name", ECHT)
def test_echte_kennungen_gehen(name):
    assert storage.uuid_erlaubt(name)
    assert storage.session_dir(name).name == name
    SessionStartIn(session_uuid=name, started_at="2026-11-22T10:00:00Z")


def test_alle_systemordner_der_ablage_gesperrt():
    """Jeder vorhandene Nicht-Session-Ordner in data_dir faellt unter die Sperre (nur wo es die Ablage gibt)."""
    d = storage.settings.data_dir
    if not d.is_dir():
        pytest.skip("keine Ablage")
    for n in os.listdir(d):
        if n.islower() and n.replace("_", "").replace("-", "").isalpha():
            assert not storage.uuid_erlaubt(n), n
