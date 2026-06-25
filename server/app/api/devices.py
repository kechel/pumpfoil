"""Pairing-Code-Workflow: Website generiert Code, Uhr löst ihn gegen Device-Token ein."""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..ratelimit import rate_limit
from ..schemas import (
    DeviceTokenOut,
    PairClaimIn,
    PairIn,
    PairingCodeOut,
    PairInitOut,
    PairPollOut,
)
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

    # Foil-Auswahl für die Uhr: je hinterlegtem Foil die aus Foil+Gewicht abgeleiteten
    # Auto-Alarm-Schwellen (Min = Min-Viable, Max = Optimal-Speed). Der Nutzer wählt
    # beim Start das heutige Foil; ein manuell gesetzter Alarm hat Vorrang (s. Uhr-Logik).
    foils_out = _foil_alarm_list(db, settings)

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
        "foils": foils_out,
    }


def _foil_alarm_list(db: Session, settings: dict) -> list[dict]:
    from ..foil_physics import alarm_speeds

    my = settings.get("my_foils") or []
    if not isinstance(my, list) or not my:
        return []
    try:
        weight = float(settings.get("weight_kg") or 0)
    except (TypeError, ValueError):
        weight = 0.0
    if weight <= 0:
        weight = 95.0  # Default-Reitergewicht wie im Web-Rechner
    default_id = settings.get("foil_id")
    out: list[dict] = []
    for fid in my:
        f = db.get(models.Foil, fid)
        if f is None:
            continue
        lo, hi = alarm_speeds(f.span_cm or 0, f.area_cm2 or 0, f.thickness_mm or 0, weight)
        label = " ".join(p for p in [f.brand, f.model, f.size] if p).strip() or f"Foil {fid}"
        out.append({"id": f.id, "label": label[:24], "min": lo, "max": hi})
    # Standard-Foil nach vorne.
    out.sort(key=lambda x: x["id"] != default_id)
    return out


@router.get("/list")
def list_devices(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Mit dem Account verknüpfte Uhren/Geräte (ohne Token-Geheimnis)."""
    rows = (
        db.query(models.DeviceToken)
        .filter(models.DeviceToken.user_id == user.id)
        .order_by(models.DeviceToken.last_seen_at.desc().nullslast(),
                  models.DeviceToken.created_at.desc())
        .all()
    )
    return [{
        "id": d.id,
        "label": d.label,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "last_seen_at": d.last_seen_at.isoformat() if d.last_seen_at else None,
        "revoked_at": d.revoked_at.isoformat() if d.revoked_at else None,
    } for d in rows]


@router.delete("/{device_id}")
def revoke_device(
    device_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Geräte-Verknüpfung widerrufen: Soft-Revoke (Zeitstempel). Token wird ungültig,
    der Record bleibt — alte Sessions behalten ihre Geräte-Zuordnung, dieselbe Uhr
    kann später mit neuem Pairing-Code wiederkommen."""
    d = db.get(models.DeviceToken, device_id)
    if d is None or d.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gerät nicht gefunden")
    if d.revoked_at is None:
        d.revoked_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True}


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


# --- Reverse-Pairing: Uhr zeigt Code, Web löst ihn ein, Uhr pollt auf den Token ---

@router.post("/pair-init", response_model=PairInitOut)
def pair_init(
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(20, 300, "pair_init")),
) -> PairInitOut:
    """Uhr (noch ohne Token) erzeugt einen Code zum Eintippen auf der Website +
    ein claim_token zum Pollen."""
    for _ in range(10):
        code = new_pairing_code()
        if not db.query(models.DevicePairing).filter_by(code=code).first():
            break
    else:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not allocate code")
    expires = datetime.now(timezone.utc) + timedelta(minutes=PAIRING_TTL_MIN)
    p = models.DevicePairing(code=code, claim_token=new_token(), expires_at=expires)
    db.add(p)
    db.commit()
    db.refresh(p)
    return PairInitOut(code=p.code, claim_token=p.claim_token, expires_at=expires)


@router.post("/pair-claim")
def pair_claim(
    body: PairClaimIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    """Eingeloggter Web-Nutzer löst den auf der Uhr angezeigten Code ein -> verknüpft die Uhr."""
    p = db.query(models.DevicePairing).filter_by(code=body.code.strip().upper()).first()
    now = datetime.now(timezone.utc)
    if p is None or _aware(p.expires_at) < now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger oder abgelaufener Code")
    if p.device_token is not None:
        return {"ok": True, "already": True}
    device = models.DeviceToken(token=new_token(), user_id=user.id, label=body.label or "Garmin")
    db.add(device)
    db.flush()
    p.device_token = device.token
    p.user_id = user.id
    db.commit()
    return {"ok": True, "label": device.label}


@router.post("/mint", response_model=DeviceTokenOut)
def mint_device(
    label: str = "Watch",
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(20, 300, "mint")),
) -> DeviceTokenOut:
    """Companion-App (eingeloggt) mintet direkt ein Device-Token für die gekoppelte Uhr.
    Apple: per WatchConnectivity auf die Uhr geschoben; Wear: per Wearable Data Layer.
    So entfällt das Code-Tippen ganz (plattform-gerechtes Pairing)."""
    device = models.DeviceToken(token=new_token(), user_id=user.id, label=label[:40])
    db.add(device)
    db.commit()
    return DeviceTokenOut(device_token=device.token, user_id=device.user_id)


@router.get("/pair-poll", response_model=PairPollOut)
def pair_poll(
    claim_token: str,
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(120, 300, "pair_poll")),
) -> PairPollOut:
    """Uhr pollt: sobald der Web-Nutzer den Code eingelöst hat, kommt hier der Device-Token."""
    p = db.query(models.DevicePairing).filter_by(claim_token=claim_token).first()
    now = datetime.now(timezone.utc)
    if p is None or _aware(p.expires_at) < now:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pairing nicht gefunden/abgelaufen")
    return PairPollOut(device_token=p.device_token)


def _aware(dt: datetime) -> datetime:
    """SQLite gibt naive datetimes zurück — als UTC interpretieren."""
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
