"""Nutzer-Feedback: absenden (eingeloggt) + Admin-Liste."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..ratelimit import rate_limit
from .deps import current_user

router = APIRouter(prefix="/api/feedback", tags=["feedback"])

MAX_LEN = 500


class FeedbackIn(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_LEN)
    url: str | None = None


@router.post("")
def submit(
    body: FeedbackIn,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
    _rl: None = Depends(rate_limit(20, 3600, "feedback")),
) -> dict:
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leeres Feedback")
    fb = models.Feedback(user_id=user.id, text=text[:MAX_LEN], url=(body.url or "")[:255] or None)
    db.add(fb)
    db.commit()
    return {"ok": True}
