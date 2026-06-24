"""Gemeinsame FastAPI-Dependencies: aktueller Nutzer (JWT) und Gerät (Device-Token)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..security import decode_access_token

_bearer = HTTPBearer(auto_error=False)


def current_user(
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
    return user


def current_admin(user: models.User = Depends(current_user)) -> models.User:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
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
