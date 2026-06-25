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
DEFAULTS = {
    "speed_min": 8, "speed_max": 25, "speed_auto": True, "views": [[1, 2, 0]],
    "colorByValue": False,
    # Vibrationsalarm bei Speed-Schwellen (km/h, 0 = aus).
    "alarm_enabled": False,
    "speed_high": 0, "speed_low": 0,
    "alarm_pattern_high": "short2", "alarm_pattern_low": "long2",
    "alarm_repeat": "once",  # "once" = einmalig beim Überschreiten | "continuous" = dauerhaft
    # Push-Benachrichtigungen je Typ (Default: alle an). Erweiterbar.
    "notify_prefs": {"like": True, "analyzed": True, "record": True},
    # Eigene Foils (Foil.ids) + Standard-Foil (eine davon). foil_id je Session überschreibbar.
    "my_foils": [],
    "foil_id": None,
    # Homespot (Spot-Name). "" -> automatisch Spot der letzten Session.
    "homespot": "",
    # Körpergewicht (kg) — optional, für spätere Leistungsberechnung. 0 = nicht angegeben.
    "weight_kg": 0,
}

# Bekannte Push-Typen (Quelle der Wahrheit, auch im Frontend gespiegelt).
NOTIFY_TYPES = ("like", "analyzed", "record")

# Erlaubte Vibrationsmuster + Modi (IDs identisch mit Web + Uhr).
ALARM_PATTERNS = {"short1", "short2", "long2", "lsl"}
ALARM_REPEATS = {"once", "continuous"}


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
    if "colorByValue" in patch:
        current["colorByValue"] = bool(patch["colorByValue"])
    if "homespot" in patch:
        v = patch["homespot"]
        current["homespot"] = str(v)[:120] if isinstance(v, str) else ""
    if "weight_kg" in patch:
        try:
            current["weight_kg"] = max(0, min(300, round(float(patch["weight_kg"]))))
        except (TypeError, ValueError):
            pass
    if "my_foils" in patch and isinstance(patch["my_foils"], list):
        current["my_foils"] = sorted({int(x) for x in patch["my_foils"] if isinstance(x, (int, float))})
    if "foil_id" in patch:  # Standard-Foil (null = keins)
        v = patch["foil_id"]
        current["foil_id"] = int(v) if isinstance(v, (int, float)) else None
    # Default muss zu den eigenen Foils gehören; Default impliziert Mitgliedschaft.
    mf = set(current.get("my_foils") or [])
    if current.get("foil_id"):
        mf.add(int(current["foil_id"]))
        current["my_foils"] = sorted(mf)
    if "views" in patch:
        cleaned = _clean_views(patch["views"])
        if cleaned:
            current["views"] = cleaned
    # Off-Foil-Screen (Auto-Umschaltung): einzelne View aus bis zu 3 Feld-IDs.
    if "off_foil_view" in patch and isinstance(patch["off_foil_view"], list):
        v = [int(x) for x in patch["off_foil_view"][:3]
             if isinstance(x, (int, float)) and 0 <= int(x) <= 20]
        if v:
            current["off_foil_view"] = v
    # Vibrationsalarm
    if "alarm_enabled" in patch:
        current["alarm_enabled"] = bool(patch["alarm_enabled"])
    for k in ("speed_high", "speed_low"):
        if k in patch:
            try:
                current[k] = max(0, min(60, round(float(patch[k]))))
            except (TypeError, ValueError):
                pass
    for k in ("alarm_pattern_high", "alarm_pattern_low"):
        if k in patch and patch[k] in ALARM_PATTERNS:
            current[k] = patch[k]
    if patch.get("alarm_repeat") in ALARM_REPEATS:
        current["alarm_repeat"] = patch["alarm_repeat"]
    if isinstance(patch.get("notify_prefs"), dict):
        prefs = dict(current.get("notify_prefs") or {})
        for k, v in patch["notify_prefs"].items():
            if k in NOTIFY_TYPES:
                prefs[k] = bool(v)
        current["notify_prefs"] = prefs
    user.settings_json = json.dumps(current)
    db.commit()
    return {**DEFAULTS, **current}
