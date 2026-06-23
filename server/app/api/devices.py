"""Pairing-Code-Workflow: Website generiert Code, Uhr löst ihn gegen Device-Token ein."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..ratelimit import rate_limit
from ..schemas import DeviceTokenOut, PairIn, PairingCodeOut
from ..security import new_pairing_code, new_token
from .deps import current_device, current_user

router = APIRouter(prefix="/api/devices", tags=["devices"])

PAIRING_TTL_MIN = 15


@router.get("/config")
def device_config(
    device: models.DeviceToken = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    """Konfiguration für die Uhr-App (per Device-Token). Liefert die auf der Website
    konfigurierten Ansichten + die Farb-Option. Die Uhr lädt das beim App-Start."""
    user = db.get(models.User, device.user_id)
    settings = json.loads(user.settings_json) if user and user.settings_json else {}
    return {
        "views": settings.get("views", [[1, 2, 0]]),
        "colorByValue": bool(settings.get("colorByValue", False)),
        # Vibrationsalarm (per Website konfiguriert).
        "alarmEnabled": bool(settings.get("alarm_enabled", False)),
        "speedHigh": int(settings.get("speed_high", 0) or 0),
        "speedLow": int(settings.get("speed_low", 0) or 0),
        "alarmPatternHigh": settings.get("alarm_pattern_high", "short2"),
        "alarmPatternLow": settings.get("alarm_pattern_low", "long2"),
        "alarmRepeat": settings.get("alarm_repeat", "once"),
    }


@router.post("/pairing-code", response_model=PairingCodeOut)
def create_pairing_code(
    user: models.User = Depends(current_user), db: Session = Depends(get_db)
) -> PairingCodeOut:
    """Eingeloggter Web-Nutzer erzeugt einen Code zum Eintippen in die Uhr."""
    # Eindeutigen Code finden (Kollision extrem unwahrscheinlich, aber sicher ist sicher).
    for _ in range(10):
        code = new_pairing_code()
        if not db.query(models.PairingCode).filter_by(code=code).first():
            break
    else:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate code")

    expires = datetime.now(timezone.utc) + timedelta(minutes=PAIRING_TTL_MIN)
    pc = models.PairingCode(code=code, user_id=user.id, expires_at=expires)
    db.add(pc)
    db.commit()
    return PairingCodeOut(code=code, expires_at=expires)


@router.post("/pair", response_model=DeviceTokenOut)
def pair(
    body: PairIn, db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(10, 300, "pair")),
) -> DeviceTokenOut:
    """Uhr löst den Code ein und erhält einen dauerhaften Device-Token. Kein JWT nötig."""
    pc = db.query(models.PairingCode).filter_by(code=body.code.upper()).first()
    now = datetime.now(timezone.utc)
    if pc is None or pc.used_at is not None or _aware(pc.expires_at) < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired code")

    device = models.DeviceToken(
        token=new_token(), user_id=pc.user_id, label=body.label
    )
    pc.used_at = now
    db.add(device)
    db.commit()
    db.refresh(device)
    return DeviceTokenOut(device_token=device.token, user_id=device.user_id)


def _aware(dt: datetime) -> datetime:
    """SQLite gibt naive datetimes zurück — als UTC interpretieren."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
