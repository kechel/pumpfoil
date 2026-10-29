"""Web-Push: VAPID-Key abrufen, Subscriptions an-/abmelden, Test."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..push import push_endpoint_ok, send_push
from ..ratelimit import enforce_user_tiers
from .deps import current_user

router = APIRouter(prefix="/api/push", tags=["push"])


class SubKeys(BaseModel):
    p256dh: str
    auth: str


class SubIn(BaseModel):
    endpoint: str
    keys: SubKeys

    @field_validator("endpoint")
    @classmethod
    def _bekannter_dienst(cls, v: str) -> str:
        # Nur bekannte Push-Dienste (Security-Review 29.10.2026, s. app/push.py PUSH_HOSTS) -> sonst 422.
        if not push_endpoint_ok(v):
            raise ValueError("unbekannter Push-Dienst")
        return v


class UnsubIn(BaseModel):
    endpoint: str


@router.get("/key")
def vapid_key() -> dict:
    """Öffentlicher VAPID-Key (applicationServerKey) – leer = Push deaktiviert."""
    return {"key": get_settings().vapid_public_key}


@router.post("/subscribe")
def subscribe(body: SubIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    sub = db.query(models.PushSubscription).filter_by(endpoint=body.endpoint).first()
    # Eine fremde Anmeldung uebernimmt nur, wer auch ihre Schluessel kennt (der Browser, der sie erzeugt hat) —
    # sonst koennte jeder mit einer bekannten Endpoint-Adresse die Pushes eines anderen umleiten.
    if sub is not None and sub.user_id != user.id and (sub.p256dh != body.keys.p256dh or sub.auth != body.keys.auth):
        return {"ok": True}
    if sub is None:
        sub = models.PushSubscription(endpoint=body.endpoint, user_id=user.id,
                                      p256dh=body.keys.p256dh, auth=body.keys.auth)
        db.add(sub)
    else:
        sub.user_id = user.id
        sub.p256dh = body.keys.p256dh
        sub.auth = body.keys.auth
    db.commit()
    return {"ok": True}


@router.post("/unsubscribe")
def unsubscribe(body: UnsubIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    db.query(models.PushSubscription).filter_by(endpoint=body.endpoint, user_id=user.id).delete()
    db.commit()
    return {"ok": True}


@router.post("/test")
def test_push(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Test-Benachrichtigung an die eigenen Geräte."""
    enforce_user_tiers(db, user.id, [(5, 300)], "push-test", "Zu viele Versuche. Bitte kurz warten.")
    n = send_push(db, user.id, "Pumpfoil", "Test-Benachrichtigung ✅", "/")
    return {"sent": n}
