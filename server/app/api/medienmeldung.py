"""Fotos und verlinkte Videos melden (12.11.2026).

Anlass: ein frisch angelegtes Konto hing einen Werbe-Link („make easy money", YouTube) an eine Session; er stand im
Community-Feed „Neueste Medien". Bis dahin gab es fuer Medien keinen Melden-Knopf (nur fuer Sessions, Kommentare,
Chat, Spot-Texte) und fuer Videos auch keine Admin-Sperre.

Jan, 12.11.2026: „nur das video aus dem feed verschwinden erstmal und in den session-details oder so halt als
'1 gesperrte medien' oder so einen hinweis geben". Also: ein gesperrtes Medium (blocked) verschwindet aus Feed und
Galerie; die Session selbst bleibt, ihre Detailseite sagt „1 gesperrtes Medium". Ab AUTOHIDE Meldungen verschiedener
Nutzer wird automatisch gesperrt (wie bei Chat-Nachrichten); Admins sehen alle Meldungen und koennen entsperren.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from ..media import gesperrt_verschieben
from .deps import current_admin, current_user, require_social

router = APIRouter(prefix="/api", tags=["medien"])
AUTOHIDE = 3          # ab so vielen Meldungen verschiedener Nutzer automatisch gesperrt (wie chat.AUTOHIDE_REPORTS)
ARTEN = {"photo": models.SessionPhoto, "video": models.SessionVideo}


def _medium(db: Session, art: str, mid: int):
    M = ARTEN.get(art)
    if M is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unbekannt")
    m = db.get(M, mid)
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unbekannt")
    return m


def _sperren(m, art: str, gesperrt: bool) -> None:
    if bool(m.blocked) == gesperrt:
        return
    m.blocked = gesperrt
    if art == "photo":
        gesperrt_verschieben(m.url, gesperrt)      # Datei aus /media nehmen bzw. zurueck (wie Admin › Fotos)


@router.post("/community/media/{art}/{mid}/report", dependencies=[Depends(require_social)])
def melden(art: str, mid: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    from .sessions import _readable
    m = _medium(db, art, mid)
    try:
        _readable(db, m.session_id, user)
    except HTTPException:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "unbekannt") from None
    if m.user_id == user.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "eigenes Medium")
    if db.query(models.MediaReport.id).filter_by(art=art, media_id=mid, user_id=user.id).first() is None:
        db.add(models.MediaReport(art=art, media_id=mid, user_id=user.id))
        db.flush()
        n = db.query(func.count(models.MediaReport.id)).filter_by(art=art, media_id=mid).scalar() or 0
        if n >= AUTOHIDE:
            _sperren(m, art, True)
        db.commit()
    n = db.query(func.count(models.MediaReport.id)).filter_by(art=art, media_id=mid).scalar() or 0
    return {"reported": True, "report_count": int(n), "hidden": bool(m.blocked)}


@router.get("/sessions/{session_id}/blocked-media")
def gesperrte(session_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Wie viele Medien dieser Session gesperrt sind (Hinweis „1 gesperrtes Medium" in den Details)."""
    from .sessions import _readable
    _readable(db, session_id, user)
    f = db.query(func.count(models.SessionPhoto.id)).filter_by(session_id=session_id, blocked=True).scalar() or 0
    v = db.query(func.count(models.SessionVideo.id)).filter_by(session_id=session_id, blocked=True).scalar() or 0
    return {"photos": int(f), "videos": int(v), "total": int(f + v)}


# ------------------------------------------------------------------ Admin
@router.get("/admin/media-reports")
def admin_liste(alle: bool = False, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> list[dict]:
    """Gemeldete Medien (offen = noch nicht erledigt), neueste Meldung zuerst; mit Meldern und Sperrstand."""
    R = models.MediaReport
    zeilen = (db.query(R.art, R.media_id, func.count(R.id), func.max(R.created_at))
              .filter(True if alle else R.erledigt_at.is_(None)).group_by(R.art, R.media_id)
              .order_by(func.max(R.created_at).desc()).limit(200).all())
    out = []
    for art, mid, n, zuletzt in zeilen:
        m = db.get(ARTEN[art], mid)
        if m is None:
            continue
        s = db.get(models.Session, m.session_id)
        besitzer = db.get(models.User, m.user_id)
        melder = [{"name": u.display_name, "at": r.created_at.isoformat() if r.created_at else None}
                  for r, u in db.query(R, models.User).join(models.User, models.User.id == R.user_id)
                  .filter(R.art == art, R.media_id == mid).order_by(R.created_at)]
        out.append({"art": art, "id": mid, "session_id": m.session_id, "url": getattr(m, "url", None),
                    "youtube_url": getattr(m, "youtube_url", None), "blocked": bool(m.blocked), "report_count": int(n),
                    "zuletzt": zuletzt.isoformat() if zuletzt else None,
                    "besitzer": {"id": m.user_id, "name": besitzer.display_name if besitzer else None},
                    "spot": s.place_name if s else None, "melder": melder})
    return out


@router.post("/admin/media/{art}/{mid}/block")
def admin_sperren(art: str, mid: int, blocked: bool = Query(True), admin: models.User = Depends(current_admin),
                  db: Session = Depends(get_db)) -> dict:
    m = _medium(db, art, mid)
    _sperren(m, art, blocked)
    db.add(models.AdminAudit(admin_id=admin.id, action=f"{art}_block" if blocked else f"{art}_unblock", target_type=art, target_id=mid))
    db.commit()
    return {"ok": True, "blocked": bool(m.blocked)}


@router.post("/admin/media/{art}/{mid}/dismiss")
def admin_erledigt(art: str, mid: int, admin: models.User = Depends(current_admin), db: Session = Depends(get_db)) -> dict:
    """Meldungen als erledigt markieren (bleiben fuer die Historie stehen; neue Meldungen erscheinen wieder)."""
    _medium(db, art, mid)
    jetzt = datetime.now(timezone.utc)
    n = db.query(models.MediaReport).filter_by(art=art, media_id=mid).filter(models.MediaReport.erledigt_at.is_(None)) \
        .update({models.MediaReport.erledigt_at: jetzt})
    db.add(models.AdminAudit(admin_id=admin.id, action="media_reports_dismiss", target_type=art, target_id=mid, detail=str(n)))
    db.commit()
    return {"ok": True, "erledigt": n}
