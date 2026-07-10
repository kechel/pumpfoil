"""Gemeinsame FastAPI-Dependencies: aktueller Nutzer (JWT) und Gerät (Device-Token)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..security import create_access_token, decode_access_token, token_exp, token_iat

_bearer = HTTPBearer(auto_error=False)


def current_user(
    response: Response,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> models.User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    user_id = decode_access_token(creds.credentials)
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = db.get(models.User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown user")
    if user.blocked:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Konto gesperrt")
    # Per-User-Invalidierung ("alle Geräte abmelden"): Tokens, die vor session_epoch
    # ausgestellt wurden, ablehnen (Sekunden-genau, damit ein frisches Login nicht kippt).
    if user.session_epoch is not None:
        iat = token_iat(creds.credentials)
        if iat is not None and iat < int(user.session_epoch.timestamp()):
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    # Sliding-Refresh (à la Let's Encrypt): läuft das Token in < 30 Tagen ab, ein frisches
    # per Header mitgeben. Der Client (api.ts) speichert es -> aktive Nutzer bleiben eingeloggt.
    exp = token_exp(creds.credentials)
    if exp is not None and exp - datetime.now(timezone.utc) < timedelta(days=30):
        response.headers["X-Refresh-Token"] = create_access_token(user_id)
    # "Zuletzt aktiv" gedrosselt aktualisieren (höchstens 1×/Stunde) — kein Write je Request.
    # last_seen_at kann unter SQLite (Dev/Tests) naiv zurückkommen -> vor dem Vergleich als
    # UTC-aware behandeln, sonst „can't subtract offset-naive and offset-aware".
    now = datetime.now(timezone.utc)
    last = user.last_seen_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if last is None or now - last > timedelta(hours=1):
        user.last_seen_at = now
        db.commit()
    return user


def current_admin(user: models.User = Depends(current_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return user


def require_social(user: models.User = Depends(current_user)) -> models.User:
    """Wie current_user, blockt aber Nutzer ohne Social-Freigabe (unter 13, Apple-Vorgabe für
    „soziale Medien"). Für UGC-/Feed-/Chat-Endpunkte. Default erlaubt (social_allowed None/true)."""
    if user.social_allowed is False:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "social_disabled")
    return user


def current_device(
    x_device_token: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> models.DeviceToken:
    if not x_device_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing X-Device-Token")
    device = (
        db.query(models.DeviceToken).filter_by(token=x_device_token).first()
    )
    if device is None or device.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid device token")
    device.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    return device
