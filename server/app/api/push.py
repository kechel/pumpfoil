"""Web-Push: VAPID-Key abrufen, Subscriptions an-/abmelden, Test."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..config import get_settings
from ..db import get_db
from ..push import send_push
from .deps import current_user

router = APIRouter(prefix="/api/push", tags=["push"])


class SubKeys(BaseModel):
    p256dh: str
    auth: str


class SubIn(BaseModel):
    endpoint: str
    keys: SubKeys


class UnsubIn(BaseModel):
    endpoint: str


@router.get("/key")
def vapid_key() -> dict:
    """Öffentlicher VAPID-Key (applicationServerKey) – leer = Push deaktiviert."""
    return {"key": get_settings().vapid_public_key}


@router.post("/subscribe")
def subscribe(body: SubIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    sub = db.query(models.PushSubscription).filter_by(endpoint=body.endpoint).first()
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
    n = send_push(db, user.id, "Pumpfoil", "Test-Benachrichtigung ✅", "/")
    return {"sent": n}
