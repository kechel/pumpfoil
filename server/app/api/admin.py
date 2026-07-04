"""Admin-/Moderationsbereich. Nur für Nutzer mit is_admin.

Sessions: Übersicht, Moderationsqueue (gemeldet), freigeben/löschen/wiederherstellen.
Nutzer: auflisten/suchen, sperren, Admin-Rechte, Passwort zurücksetzen, Name ändern, löschen.
Fotos: einzelne Bilder blocken/freigeben/löschen, Profilbild entfernen.
Dashboard-Kennzahlen + Audit-Log aller Admin-Aktionen.
"""
from __future__ import annotations

import secrets
import shutil

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, storage
from ..accounts import NEW_ACCOUNT_AGE_S, is_new_account
from ..db import get_db
from ..media import delete_media
from ..security import hash_password
from .deps import current_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _log(db: Session, admin: models.User, action: str, ttype: str, tid: int | None, detail: str | None = None) -> None:
    db.add(models.AdminAudit(admin_id=admin.id, action=action, target_type=ttype, target_id=tid, detail=detail))


# ---------------------------------------------------------------- Sessions ----
def _session_brief(db: Session, s: models.Session, u: models.User | None) -> dict:
    def vc(kind: str) -> int:
        return int(db.query(func.count()).select_from(models.SessionVote)
                   .filter_by(session_id=s.id, kind=kind).scalar() or 0)
    likes = int(db.query(func.count()).select_from(models.SessionLike).filter_by(session_id=s.id).scalar() or 0)
    nphotos = int(db.query(func.count()).select_from(models.SessionPhoto).filter_by(session_id=s.id).scalar() or 0)
    return {
        "session_id": s.id,
        "started_at": s.started_at.isoformat() if s.started_at else None,
        "name": u.display_name if u else None,
        "email": u.email if u else None,
        "spot": s.place_name or None,
        "sport": s.sport,
        "is_pumpfoil": bool(s.is_pumpfoil),
        "deleted": bool(s.deleted),
        "flagged": bool(s.flagged),
        "mod_ok": bool(s.mod_ok),
        "inappropriate": vc("inappropriate"),
        "fake": vc("fake"),
        "likes": likes,
        "photos": nphotos,
    }


def _sessions_query(db: Session):
    return (db.query(models.Session, models.User)
            .join(models.User, models.Session.user_id == models.User.id)
            .order_by(models.Session.id.desc()))


@router.get("/flagged")
def flagged_sessions(_a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> list[dict]:
    rows = _sessions_query(db).filter(models.Session.flagged.is_(True), models.Session.deleted.isnot(True)).all()
    return [_session_brief(db, s, u) for s, u in rows]


@router.get("/sessions")
def all_sessions(
    limit: int = 50, offset: int = 0, scope: str = "all", q: str | None = Query(None),
    user_id: int | None = Query(None),
    _a: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> list[dict]:
    """scope: all | flagged (versteckt) | fake (unecht gemeldet) | deleted.
    q: Name/E-Mail/Spot. user_id: nur Sessions dieses Nutzers."""
    query = _sessions_query(db)
    if user_id is not None:
        query = query.filter(models.Session.user_id == user_id)
    if scope == "flagged":
        query = query.filter(models.Session.flagged.is_(True), models.Session.deleted.isnot(True))
    elif scope == "fake":
        voted = db.query(models.SessionVote.session_id).filter_by(kind="fake").subquery()
        query = query.filter(models.Session.id.in_(voted), models.Session.deleted.isnot(True))
    elif scope == "deleted":
        query = query.filter(models.Session.deleted.is_(True))
    else:
        query = query.filter(models.Session.deleted.isnot(True))
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(
            func.lower(models.User.email).like(like)
            | func.lower(func.coalesce(models.User.display_name, "")).like(like)
            | func.lower(func.coalesce(models.Session.place_name, "")).like(like)
        )
    rows = query.offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all()
    return [_session_brief(db, s, u) for s, u in rows]


def _get_session(db: Session, sid: int) -> models.Session:
    s = db.get(models.Session, sid)
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return s


@router.post("/sessions/{session_id}/ok")
def approve(session_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    s = _get_session(db, session_id)
    s.flagged = False
    s.mod_ok = True
    _log(db, admin, "session_ok", "session", session_id)
    db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/delete")
def delete(session_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    s = _get_session(db, session_id)
    s.deleted = True
    _log(db, admin, "session_delete", "session", session_id)
    db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/restore")
def restore(session_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    s = _get_session(db, session_id)
    s.deleted = False
    _log(db, admin, "session_restore", "session", session_id)
    db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/hide")
def hide(session_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Aus der Community verbergen bzw. eine Freigabe rückgängig machen."""
    s = _get_session(db, session_id)
    s.flagged = True
    s.mod_ok = False
    _log(db, admin, "session_hide", "session", session_id)
    db.commit()
    return {"ok": True}


@router.post("/sessions/{session_id}/dismiss")
def dismiss_reports(
    session_id: int, kind: str = Query("fake"),
    admin: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> dict:
    """Unbegründete Meldungen einer Art (fake|inappropriate) verwerfen -> Zähler/Prüfliste leeren."""
    if kind not in ("fake", "inappropriate"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "kind must be fake|inappropriate")
    _get_session(db, session_id)
    db.query(models.SessionVote).filter_by(session_id=session_id, kind=kind).delete()
    _log(db, admin, "reports_dismiss", "session", session_id, detail=kind)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------- Users ----
def _user_brief(db: Session, u: models.User) -> dict:
    nsess = int(db.query(func.count()).select_from(models.Session)
                .filter_by(user_id=u.id).filter(models.Session.deleted.isnot(True)).scalar() or 0)
    return {
        "id": u.id,
        "email": u.email,
        "display_name": u.display_name,
        "avatar_url": u.avatar_url,
        "is_admin": bool(u.is_admin),
        "blocked": bool(u.blocked),
        "hidden": bool(u.hidden),
        "new": is_new_account(u.created_at),
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "last_seen_at": u.last_seen_at.isoformat() if u.last_seen_at else None,
        "sessions": nsess,
    }


def _filtered_users(
    db: Session, q: str | None, normal: bool, tester: bool, admin: bool, new: bool
):
    """Basis-Query mit Namensfilter + Kategorie-Filter (OR der angehakten Klassen).
    Kategorien: admin=is_admin, tester=hidden, neu=Konto < 24 h, normal=keines davon.
    Alle vier an = alle Nutzer; keiner an = leer."""
    query = db.query(models.User)
    if q:
        like = f"%{q.lower()}%"
        query = query.filter(func.lower(models.User.email).like(like)
                             | func.lower(func.coalesce(models.User.display_name, "")).like(like))
    U = models.User
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=NEW_ACCOUNT_AGE_S)
    c_admin = U.is_admin.is_(True)
    c_tester = U.hidden.is_(True)
    c_new = U.created_at > cutoff
    c_normal = (U.is_admin.isnot(True) & U.hidden.isnot(True)
                & (U.created_at <= cutoff))  # NULL created_at -> nicht "neu" -> ggf. normal über andere Klassen
    conds = []
    if admin:
        conds.append(c_admin)
    if tester:
        conds.append(c_tester)
    if new:
        conds.append(c_new)
    if normal:
        conds.append(c_normal | U.created_at.is_(None))
    if not conds:
        return query.filter(func.coalesce(U.id, 0) < 0)  # nichts angehakt -> leer
    return query.filter(or_(*conds))


@router.get("/users")
def list_users(
    q: str | None = Query(None), limit: int = 50, offset: int = 0,
    normal: bool = Query(True), tester: bool = Query(True),
    admin: bool = Query(True), new: bool = Query(True),
    _a: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> list[dict]:
    query = _filtered_users(db, q, normal, tester, admin, new)
    rows = query.order_by(models.User.id.desc()).offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all()
    return [_user_brief(db, u) for u in rows]


@router.get("/users/count")
def count_users(
    q: str | None = Query(None),
    normal: bool = Query(True), tester: bool = Query(True),
    admin: bool = Query(True), new: bool = Query(True),
    _a: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> dict:
    """Anzahl der nach denselben Filtern gefundenen Nutzer (für die Trefferanzeige)."""
    total = _filtered_users(db, q, normal, tester, admin, new).count()
    return {"total": total}


@router.get("/users/{user_id}/stats")
def user_stats(user_id: int, _a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Kennzahlen/Rekorde eines Nutzers — wie die Self-Stats, für jeden Nutzer."""
    from .sessions import compute_overall_stats
    u = _get_user(db, user_id)
    return {"user": _user_brief(db, u), "stats": compute_overall_stats(db, user_id)}


def _get_user(db: Session, uid: int) -> models.User:
    u = db.get(models.User, uid)
    if u is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return u


@router.post("/users/{user_id}/block")
def block_user(user_id: int, blocked: bool = Query(True), admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    u = _get_user(db, user_id)
    if u.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sich selbst sperren? Nein.")
    u.blocked = blocked
    _log(db, admin, "user_block" if blocked else "user_unblock", "user", user_id)
    db.commit()
    return {"ok": True, "blocked": u.blocked}


@router.post("/users/{user_id}/hide")
def hide_user(user_id: int, hidden: bool = Query(True), admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Testkonto (App-Store-Review): Inhalte für alle anderen ausblenden, Login bleibt aktiv."""
    u = _get_user(db, user_id)
    u.hidden = hidden
    _log(db, admin, "user_hide" if hidden else "user_unhide", "user", user_id)
    db.commit()
    return {"ok": True, "hidden": u.hidden}


@router.post("/users/{user_id}/admin")
def set_admin(user_id: int, is_admin: bool = Query(...), admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    u = _get_user(db, user_id)
    if u.id == admin.id and not is_admin:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Eigene Admin-Rechte nicht entziehen.")
    u.is_admin = is_admin
    _log(db, admin, "user_admin", "user", user_id, detail=str(is_admin))
    db.commit()
    return {"ok": True, "is_admin": u.is_admin}


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: int, password: str | None = Query(None),
    admin: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> dict:
    """Setzt ein vom Admin gewähltes Passwort (password=) ODER generiert ein Temp-PW.
    Überschreibt das alte Passwort unwiderruflich."""
    u = _get_user(db, user_id)
    if password is not None:
        if len(password) < 8:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mindestens 8 Zeichen")
        u.password_hash = hash_password(password)
        _log(db, admin, "user_set_pw", "user", user_id)
        db.commit()
        return {"ok": True, "set": True}
    temp = secrets.token_urlsafe(9)
    u.password_hash = hash_password(temp)
    _log(db, admin, "user_reset_pw", "user", user_id)
    db.commit()
    return {"ok": True, "temp_password": temp}


@router.post("/users/{user_id}/display-name")
def set_display_name(user_id: int, name: str | None = Query(None), admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    u = _get_user(db, user_id)
    clean = (name or "").strip() or None
    if clean and (len(clean) < 2 or len(clean) > 40):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2–40 Zeichen")
    if clean:
        dup = (db.query(models.User)
               .filter(func.lower(models.User.display_name) == clean.lower(), models.User.id != user_id).first())
        if dup:
            raise HTTPException(status.HTTP_409_CONFLICT, "Name bereits vergeben")
    u.display_name = clean
    _log(db, admin, "user_rename", "user", user_id, detail=clean)
    db.commit()
    return {"ok": True, "display_name": u.display_name}


@router.post("/users/{user_id}/remove-avatar")
def remove_avatar(user_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    u = _get_user(db, user_id)
    delete_media(u.avatar_url)
    u.avatar_url = None
    _log(db, admin, "user_remove_avatar", "user", user_id)
    db.commit()
    return {"ok": True}


def _purge_session(db: Session, s: models.Session) -> None:
    sid = s.id
    db.query(models.AnalysisResult).filter_by(session_id=sid).delete()
    db.query(models.Label).filter_by(session_id=sid).delete()
    db.query(models.SessionLike).filter_by(session_id=sid).delete()
    db.query(models.SessionVote).filter_by(session_id=sid).delete()
    for p in db.query(models.SessionPhoto).filter_by(session_id=sid).all():
        delete_media(p.url)
        db.delete(p)
    try:
        d = storage.session_dir(s.session_uuid)
        if d.exists():
            shutil.rmtree(d, ignore_errors=True)
    except ValueError:
        pass
    db.delete(s)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Harte Löschung: Nutzer + alle Sessions/Rohdaten/Fotos/Likes/Votes/Geräte."""
    u = _get_user(db, user_id)
    if u.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sich selbst löschen? Nein.")
    for s in db.query(models.Session).filter_by(user_id=user_id).all():
        _purge_session(db, s)
    # vom Nutzer auf FREMDE Sessions gesetzte Likes/Votes
    db.query(models.SessionLike).filter_by(user_id=user_id).delete()
    db.query(models.SessionVote).filter_by(user_id=user_id).delete()
    db.query(models.DeviceToken).filter_by(user_id=user_id).delete()
    db.query(models.PairingCode).filter_by(user_id=user_id).delete()
    delete_media(u.avatar_url)
    _log(db, admin, "user_delete", "user", user_id, detail=u.email)
    db.delete(u)
    db.commit()
    return {"ok": True}


# ------------------------------------------------------------------ Fotos ----
@router.get("/photos")
def list_photos(
    limit: int = 60, offset: int = 0,
    _a: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(models.SessionPhoto, models.User.display_name, models.Session.place_name)
        .join(models.Session, models.SessionPhoto.session_id == models.Session.id)
        .join(models.User, models.SessionPhoto.user_id == models.User.id)
        .order_by(models.SessionPhoto.id.desc())
        .offset(max(offset, 0)).limit(min(max(limit, 1), 200)).all()
    )
    return [{
        "id": p.id, "url": p.url, "session_id": p.session_id,
        "blocked": bool(p.blocked), "name": name, "spot": place or None,
    } for p, name, place in rows]


@router.post("/photos/{photo_id}/block")
def block_photo(photo_id: int, blocked: bool = Query(True), admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    p = db.get(models.SessionPhoto, photo_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    p.blocked = blocked
    _log(db, admin, "photo_block" if blocked else "photo_unblock", "photo", photo_id)
    db.commit()
    return {"ok": True, "blocked": p.blocked}


@router.delete("/photos/{photo_id}")
def delete_photo(photo_id: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    p = db.get(models.SessionPhoto, photo_id)
    if p is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Photo not found")
    delete_media(p.url)
    db.delete(p)
    _log(db, admin, "photo_delete", "photo", photo_id)
    db.commit()
    return {"ok": True}


# -------------------------------------------------------------- Dashboard ----
@router.get("/overview")
def overview(_a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    c = lambda model, *f: int(db.query(func.count()).select_from(model).filter(*f).scalar() or 0)  # noqa: E731
    return {
        "users": c(models.User),
        "users_blocked": c(models.User, models.User.blocked.is_(True)),
        "users_hidden": c(models.User, models.User.hidden.is_(True)),
        "admins": c(models.User, models.User.is_admin.is_(True)),
        "sessions": c(models.Session, models.Session.deleted.isnot(True)),
        "sessions_deleted": c(models.Session, models.Session.deleted.is_(True)),
        "pumpfoil": c(models.Session, models.Session.is_pumpfoil.is_(True), models.Session.deleted.isnot(True)),
        "flagged": c(models.Session, models.Session.flagged.is_(True), models.Session.deleted.isnot(True)),
        "reported": int(db.query(func.count(func.distinct(models.SessionVote.session_id)))
                        .filter_by(kind="inappropriate").scalar() or 0),
        "photos": c(models.SessionPhoto),
        "photos_blocked": c(models.SessionPhoto, models.SessionPhoto.blocked.is_(True)),
        "likes": c(models.SessionLike),
    }


@router.get("/audit")
def audit_log(
    limit: int = 100, _a: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(models.AdminAudit, models.User.display_name, models.User.email)
        .join(models.User, models.AdminAudit.admin_id == models.User.id)
        .order_by(models.AdminAudit.id.desc()).limit(min(max(limit, 1), 500)).all()
    )
    return [{
        "id": a.id, "action": a.action, "target_type": a.target_type, "target_id": a.target_id,
        "detail": a.detail, "at": a.created_at.isoformat() if a.created_at else None,
        "admin": name or email,
    } for a, name, email in rows]


@router.get("/feedback")
def feedback_list(
    limit: int = 200, _a: models.User = Depends(current_admin), db: Session = Depends(get_db),
) -> list[dict]:
    rows = (
        db.query(models.Feedback, models.User.display_name, models.User.email)
        .join(models.User, models.Feedback.user_id == models.User.id)
        .order_by(models.Feedback.id.desc()).limit(min(max(limit, 1), 500)).all()
    )
    return [{
        "id": f.id, "text": f.text, "url": f.url,
        "at": f.created_at.isoformat() if f.created_at else None,
        "name": name or email, "email": email,
    } for f, name, email in rows]


@router.delete("/feedback/{feedback_id}")
def delete_feedback(feedback_id: int, _a: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    fb = db.get(models.Feedback, feedback_id)
    if fb is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Feedback not found")
    db.delete(fb)
    db.commit()
    return {"ok": True}
