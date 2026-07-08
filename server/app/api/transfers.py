"""Session-Übertragung: eine Session an einen anderen Nutzer weitergeben (z. B. Uhr verliehen,
der andere ist gefahren). Absender initiiert → Empfänger sieht die ausstehende Übertragung in
„Meine Sessions", kann die Session ansehen und annehmen/ablehnen. Bei Annahme wandert die
Eigentümerschaft in der DB (Session.user_id = Empfänger); die Session zählt fortan für ihn."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..push import send_push, wants
from .deps import current_user

router = APIRouter(prefix="/api/transfers", tags=["transfers"])


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _blocked_between(db: Session, a: int, b: int) -> bool:
    return db.query(models.UserBlock.id).filter(
        or_(
            (models.UserBlock.blocker_id == a) & (models.UserBlock.blocked_id == b),
            (models.UserBlock.blocker_id == b) & (models.UserBlock.blocked_id == a),
        )
    ).first() is not None


def _user_brief(u: models.User | None) -> dict | None:
    if u is None:
        return None
    return {"id": u.id, "display_name": u.display_name, "avatar_url": u.avatar_url}


def _session_brief(db: Session, s: models.Session) -> dict:
    """Kompakte Zusammenfassung fürs Übertragungs-Karte (Ort, Datum, Foil-Zeit)."""
    ft = None
    r = s.result
    if r is not None:
        ft = getattr(r, "foiling_time_s", None)
    return {
        "id": s.id,
        "place": s.place_name or s.place_water or None,
        "water": s.place_water or None,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "sport": s.sport,
        "foiling_time_s": ft,
    }


def _transfer_out(db: Session, t: models.SessionTransfer, *, side: str) -> dict:
    """side='incoming' → Gegenüber = Absender; side='outgoing' → Gegenüber = Empfänger."""
    other_id = t.from_user_id if side == "incoming" else t.to_user_id
    s = db.get(models.Session, t.session_id)
    return {
        "id": t.id,
        "status": t.status,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "other": _user_brief(db.get(models.User, other_id)),
        "session": _session_brief(db, s) if s is not None else None,
    }


class InitiateIn(BaseModel):
    session_id: int
    to_user_id: int


@router.post("")
def initiate(body: InitiateIn, user: models.User = Depends(current_user),
             db: Session = Depends(get_db)) -> dict:
    """Besitzer überträgt seine Session an einen anderen Nutzer (erzeugt eine offene Übertragung)."""
    s = db.get(models.Session, body.session_id)
    if s is None or s.deleted or s.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session nicht gefunden")
    other = db.get(models.User, body.to_user_id)
    if other is None or other.id == user.id or other.hidden or other.blocked:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Empfänger")
    if _blocked_between(db, user.id, other.id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Übertragung nicht möglich")
    # Bestehende offene Übertragung dieser Session ersetzen (Re-Targeting erlaubt).
    for old in db.query(models.SessionTransfer).filter_by(session_id=s.id, status="pending").all():
        old.status = "cancelled"
        old.resolved_at = _utcnow()
    t = models.SessionTransfer(session_id=s.id, from_user_id=user.id, to_user_id=other.id)
    db.add(t)
    db.commit()
    db.refresh(t)
    if wants(db, other.id, "transfer"):
        send_push(db, other.id, "Session-Übertragung",
                  f"{user.display_name or 'Jemand'} möchte dir eine Session übertragen",
                  "/sessions")
    return _transfer_out(db, t, side="outgoing")


@router.get("/incoming")
def incoming(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Offene Übertragungen AN mich (in „Meine Sessions" anzeigen)."""
    rows = (db.query(models.SessionTransfer)
            .filter_by(to_user_id=user.id, status="pending")
            .order_by(models.SessionTransfer.created_at.desc()).all())
    out = []
    for t in rows:
        s = db.get(models.Session, t.session_id)
        if s is None or s.deleted or s.user_id != t.from_user_id:
            continue  # Session weg/schon übertragen → offene Übertragung ist gegenstandslos
        out.append(_transfer_out(db, t, side="incoming"))
    return out


@router.get("/for-session/{session_id}")
def for_session(session_id: int, user: models.User = Depends(current_user),
                db: Session = Depends(get_db)) -> dict:
    """Offene Übertragung, die diese Session betrifft und mich angeht (als Absender ODER Empfänger)
    — für die Session-Detailansicht. {} wenn keine."""
    t = (db.query(models.SessionTransfer)
         .filter_by(session_id=session_id, status="pending")
         .order_by(models.SessionTransfer.created_at.desc()).first())
    if t is None:
        return {}
    if t.from_user_id == user.id:
        return {**_transfer_out(db, t, side="outgoing"), "role": "sender"}
    if t.to_user_id == user.id:
        return {**_transfer_out(db, t, side="incoming"), "role": "recipient"}
    return {}


def _pending_owned(db: Session, transfer_id: int, *, recipient: int | None = None,
                   sender: int | None = None) -> models.SessionTransfer:
    t = db.get(models.SessionTransfer, transfer_id)
    if t is None or t.status != "pending":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Übertragung nicht gefunden")
    if recipient is not None and t.to_user_id != recipient:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nicht dein")
    if sender is not None and t.from_user_id != sender:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Nicht dein")
    return t


@router.post("/{transfer_id}/accept")
def accept(transfer_id: int, user: models.User = Depends(current_user),
           db: Session = Depends(get_db)) -> dict:
    """Empfänger nimmt an → Eigentümerschaft wandert (Session.user_id = Empfänger)."""
    t = _pending_owned(db, transfer_id, recipient=user.id)
    s = db.get(models.Session, t.session_id)
    if s is None or s.deleted or s.user_id != t.from_user_id:
        t.status = "cancelled"
        t.resolved_at = _utcnow()
        db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "Session nicht mehr übertragbar")
    from_user_id = s.user_id
    s.user_id = user.id
    # Foil gehörte dem Absender → auf Standard-Foil des Empfängers zurücksetzen.
    s.foil_id = None
    t.status = "accepted"
    t.resolved_at = _utcnow()
    db.commit()
    if wants(db, from_user_id, "transfer"):
        send_push(db, from_user_id, "Session-Übertragung",
                  f"{user.display_name or 'Jemand'} hat deine Session angenommen ✅",
                  f"/sessions/{s.id}")
    return {"ok": True, "session_id": s.id}


@router.post("/{transfer_id}/decline")
def decline(transfer_id: int, user: models.User = Depends(current_user),
            db: Session = Depends(get_db)) -> dict:
    """Empfänger lehnt ab."""
    t = _pending_owned(db, transfer_id, recipient=user.id)
    t.status = "declined"
    t.resolved_at = _utcnow()
    db.commit()
    if wants(db, t.from_user_id, "transfer"):
        send_push(db, t.from_user_id, "Session-Übertragung",
                  f"{user.display_name or 'Jemand'} hat die Übertragung abgelehnt",
                  f"/sessions/{t.session_id}")
    return {"ok": True}


@router.delete("/{transfer_id}")
def cancel(transfer_id: int, user: models.User = Depends(current_user),
           db: Session = Depends(get_db)) -> dict:
    """Absender zieht die ausstehende Übertragung zurück."""
    t = _pending_owned(db, transfer_id, sender=user.id)
    t.status = "cancelled"
    t.resolved_at = _utcnow()
    db.commit()
    return {"ok": True}


@router.get("/friends")
def friends(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Nutzer, mit denen ich bereits einen 1:1-Chat habe (für die bevorzugte Auswahl oben).
    Abgeleitet aus meinen dm:-Chaträumen. Blockierte/versteckte ausgenommen."""
    states = (db.query(models.ChatRoomState)
              .filter(models.ChatRoomState.user_id == user.id,
                      models.ChatRoomState.scope.like("dm:%"))
              .order_by(models.ChatRoomState.id.desc()).all())
    seen: set[int] = set()
    out: list[dict] = []
    for st in states:
        try:
            a, b = st.scope[3:].split("-", 1)
            ids = {int(a), int(b)}
        except (ValueError, IndexError):
            continue
        ids.discard(user.id)
        if not ids:
            continue
        oid = next(iter(ids))
        if oid in seen:
            continue
        seen.add(oid)
        u = db.get(models.User, oid)
        if u is None or u.hidden or u.blocked:
            continue
        if _blocked_between(db, user.id, oid):
            continue
        out.append(_user_brief(u))
    return out
