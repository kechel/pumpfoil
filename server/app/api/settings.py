"""Nutzer-Einstellungen (frei als JSON), z. B. Farbskala-Grenzen."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Gültige Datenfeld-IDs (gemeinsamer Katalog mit Web + Uhr). 0 = leer/aus.
VALID_FIELD_IDS = set(range(0, 21))  # 0-13 Live-Felder, 14-20 Lauf-Felder
# Default: eine Ansicht mit Speed(3s) + Puls.
DEFAULTS = {"speed_min": 8, "speed_max": 25, "speed_auto": True, "views": [[1, 2, 0]]}


def _merged(user: models.User) -> dict:
    stored = json.loads(user.settings_json) if user.settings_json else {}
    return {**DEFAULTS, **stored}


def _clean_views(views) -> list | None:
    """Validiert views = Liste von Ansichten, je bis zu 3 Feld-IDs."""
    if not isinstance(views, list):
        return None
    out = []
    for v in views[:12]:  # max 12 Ansichten
        if not isinstance(v, list):
            continue
        fields = [int(x) for x in v[:3] if isinstance(x, (int, float)) and int(x) in VALID_FIELD_IDS]
        while len(fields) < 3:
            fields.append(0)
        if any(f != 0 for f in fields):
            out.append(fields)
    return out or [[1, 2, 0]]


@router.get("")
def get_settings(user: models.User = Depends(current_user)) -> dict:
    return _merged(user)


@router.put("")
def update_settings(
    patch: dict,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    current = json.loads(user.settings_json) if user.settings_json else {}
    for k in ("speed_min", "speed_max"):
        if k in patch:
            try:
                current[k] = max(0, min(50, float(patch[k])))
            except (TypeError, ValueError):
                pass
    if "speed_auto" in patch:
        current["speed_auto"] = bool(patch["speed_auto"])
    if "views" in patch:
        cleaned = _clean_views(patch["views"])
        if cleaned:
            current["views"] = cleaned
    user.settings_json = json.dumps(current)
    db.commit()
    return {**DEFAULTS, **current}
