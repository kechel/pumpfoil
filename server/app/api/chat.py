"""Chat-Engine (gemeinsam für Session-Diskussion + Spot-Chat). Nur Text.
scope = "session:<id>" | "spot:<name>". Polling-basiert (kein Realtime nötig)."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])

_SCOPE_RE = re.compile(r"^(session:\d+|spot:.{1,120})$")
DUP_WINDOW_S = 120          # gleiches Posting innerhalb 2 min = Duplikat
AUTOHIDE_REPORTS = 3        # ab so vielen Meldungen automatisch ausblenden


def _check_scope(scope: str) -> None:
    if not _SCOPE_RE.match(scope or ""):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Chat-scope")


class PostIn(BaseModel):
    text: str


def _msg_out(m: models.ChatMessage, name: str, avatar: str | None, uid: int) -> dict:
    return {
        "id": m.id, "user_id": m.user_id, "name": name, "avatar_url": avatar,
        "text": m.text, "created_at": m.created_at.isoformat() if m.created_at else None,
        "mine": m.user_id == uid, "hidden": m.hidden, "report_count": m.report_count,
    }


@router.get("")
def list_messages(
    scope: str = Query(...), after: int = 0, limit: int = 100,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    _check_scope(scope)
    q = (
        db.query(models.ChatMessage, models.User.display_name, models.User.avatar_url)
        .join(models.User, models.ChatMessage.user_id == models.User.id)
        .filter(models.ChatMessage.scope == scope)
    )
    if not user.is_admin:
        q = q.filter(models.ChatMessage.hidden.isnot(True))
    if after:
        q = q.filter(models.ChatMessage.id > after)
    rows = q.order_by(models.ChatMessage.id.asc()).limit(min(max(limit, 1), 200)).all()
    return [_msg_out(m, name, avatar, user.id) for m, name, avatar in rows]


@router.post("")
def post_message(
    body: PostIn, scope: str = Query(...),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    _check_scope(scope)
    if user.chat_readonly:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Im Chat schreibgesperrt")
    text = (body.text or "").strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Leere Nachricht")
    if len(text) > 2000:
        text = text[:2000]
    # Duplikatserkennung: gleicher Text desselben Nutzers im selben Raum kürzlich.
    since = datetime.now(timezone.utc) - timedelta(seconds=DUP_WINDOW_S)
    dup = (
        db.query(models.ChatMessage)
        .filter(models.ChatMessage.scope == scope, models.ChatMessage.user_id == user.id,
                models.ChatMessage.text == text, models.ChatMessage.created_at >= since)
        .first()
    )
    if dup:
        return _msg_out(dup, user.display_name, user.avatar_url, user.id)
    m = models.ChatMessage(scope=scope, user_id=user.id, text=text)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _msg_out(m, user.display_name, user.avatar_url, user.id)


@router.post("/{message_id}/report")
def report_message(
    message_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    m = db.get(models.ChatMessage, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nachricht nicht gefunden")
    if db.query(models.ChatReport).filter_by(message_id=message_id, user_id=user.id).first() is None:
        db.add(models.ChatReport(message_id=message_id, user_id=user.id))
        m.report_count = (m.report_count or 0) + 1
        if m.report_count >= AUTOHIDE_REPORTS:
            m.hidden = True
        db.commit()
    return {"ok": True, "report_count": m.report_count, "hidden": m.hidden}


def _require_admin(user: models.User) -> None:
    if not user.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nur für Admins")


class HideIn(BaseModel):
    hidden: bool


@router.post("/{message_id}/hide")
def set_hidden(
    message_id: int, body: HideIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Admin: Nachricht aus-/einblenden (Freigeben einer gemeldeten Nachricht)."""
    _require_admin(user)
    m = db.get(models.ChatMessage, message_id)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nachricht nicht gefunden")
    m.hidden = bool(body.hidden)
    db.commit()
    return {"ok": True, "id": m.id, "hidden": m.hidden}


@router.get("/reported")
def list_reported(
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Admin: alle gemeldeten Nachrichten (report_count > 0), neueste zuerst."""
    _require_admin(user)
    rows = (
        db.query(models.ChatMessage, models.User.display_name, models.User.avatar_url)
        .join(models.User, models.ChatMessage.user_id == models.User.id)
        .filter(models.ChatMessage.report_count > 0)
        .order_by(models.ChatMessage.report_count.desc(), models.ChatMessage.id.desc())
        .limit(200).all()
    )
    out = []
    for m, name, avatar in rows:
        d = _msg_out(m, name, avatar, user.id)
        d["scope"] = m.scope
        out.append(d)
    return out


class ReadonlyIn(BaseModel):
    user_id: int
    readonly: bool


@router.post("/moderation/readonly")
def set_readonly(
    body: ReadonlyIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Admin: einen Nutzer im Chat auf read-only setzen / wieder freigeben."""
    _require_admin(user)
    target = db.get(models.User, body.user_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nutzer nicht gefunden")
    target.chat_readonly = bool(body.readonly)
    db.commit()
    return {"ok": True, "user_id": target.id, "chat_readonly": target.chat_readonly}
