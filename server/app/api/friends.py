"""Freunde: anfragen, annehmen, ablehnen, beenden, Liste (Jan, 15.10.2026). Regeln: app/freunde.py.

Antworten verraten nichts Ueberfluessiges: eine Ablehnung sieht der Anfragende nie (er bleibt bei
„angefragt"), eine gesperrte Wiederhol-Anfrage antwortet genauso wie eine neue, und ein Ziel, mit
dem keine Freundschaft moeglich ist, ist schlicht 404 — wie ein Konto, das es nicht gibt.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import freunde, models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/friends", tags=["friends"])


def _jetzt() -> datetime:
    return datetime.now(timezone.utc)


def _aware(t: datetime | None) -> datetime | None:
    if t is not None and t.tzinfo is None:
        return t.replace(tzinfo=timezone.utc)
    return t


def _kurz(u: models.User) -> dict:
    return {"user_id": u.id, "name": u.display_name, "avatar_url": u.avatar_url}


def _ziel(db: Session, ich: models.User, user_id: int) -> models.User:
    """Der andere Nutzer — oder 404, wenn mit ihm keine Freundschaft moeglich ist."""
    if not freunde.darf_freunde_haben(ich):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "social_disabled")
    u = db.get(models.User, user_id)
    if u is None or u.id == ich.id or not freunde.darf_freunde_haben(u) or freunde.gesperrt(db, ich.id, u.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")
    return u


@router.get("")
def liste(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Meine Freunde, Anfragen an mich, meine offenen Anfragen (abgelehnte zeigen weiter als offen)
    und wer von meinen Freunden gerade pumpt."""
    F = models.Friendship
    freund, eingehend, ausgehend = [], [], []
    for z in db.query(F).filter(or_(F.user_lo == user.id, F.user_hi == user.id)).all():
        anderer = db.get(models.User, z.user_hi if z.user_lo == user.id else z.user_lo)
        if not freunde.darf_freunde_haben(anderer):
            continue
        if z.status == "accepted":
            freund.append({**_kurz(anderer), "seit": _aware(z.responded_at or z.created_at).isoformat()})
        elif z.status == "withdrawn":
            continue
        elif z.requester_id == user.id:
            ausgehend.append({**_kurz(anderer), "am": _aware(z.created_at).isoformat()})
        elif z.status == "pending":
            eingehend.append({**_kurz(anderer), "am": _aware(z.created_at).isoformat()})
    freund.sort(key=lambda x: (x["name"] or "").lower())
    eingehend.sort(key=lambda x: x["am"], reverse=True)
    ausgehend.sort(key=lambda x: x["am"], reverse=True)
    return {"freunde": freund, "eingehend": eingehend, "ausgehend": ausgehend,
            "aktiv": freunde.aktive_freunde(db, user.id)}


@router.get("/active")
def aktiv(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Nur „wer von meinen Freunden pumpt gerade wo" — fuer die Zeile neben der Begruessung auf der
    Startseite (Jan, 15.10.2026). Leichter als die ganze Liste, weil die Startseite es alle zwei
    Minuten nachfragt."""
    if not freunde.darf_freunde_haben(user):
        return []
    return freunde.aktive_freunde(db, user.id)


@router.get("/count")
def anzahl(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Offene Anfragen an mich — fuer das Abzeichen am Knopf „Freunde verwalten"."""
    F = models.Friendship
    n = 0
    for z in db.query(F).filter(F.status == "pending", F.requester_id != user.id,
                                or_(F.user_lo == user.id, F.user_hi == user.id)).all():
        if freunde.darf_freunde_haben(db.get(models.User, z.requester_id)):
            n += 1
    return {"incoming": n}


@router.post("/{user_id}/request")
def anfragen(user_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    ziel = _ziel(db, user, user_id)
    z = freunde.zeile(db, user.id, ziel.id)
    jetzt = _jetzt()
    if z is not None:
        if z.status == "accepted":
            return {"status": "freund"}
        if z.status == "pending" and z.requester_id != user.id:
            # Der andere hat schon gefragt -> beide wollen: das IST die Bestaetigung.
            return _annehmen(db, user, ziel, z)
        if z.status == "pending":
            return {"status": "angefragt"}
        # declined/withdrawn: der Anfragende darf erst nach der Sperre erneut — und merkt davon
        # nichts. Eine zurueckgezogene, vorher abgelehnte Anfrage steht dann wieder als offen da.
        if z.requester_id == user.id and jetzt - _aware(z.responded_at or z.created_at) < freunde.SPERRE_NACH_ABLEHNUNG:
            z.status = "declined"
            db.commit()
            return {"status": "angefragt"}
        db.delete(z)
        db.flush()
    F = models.Friendship
    heute = (db.query(F.id).filter(F.requester_id == user.id, F.created_at > jetzt - timedelta(days=1)).count())
    if heute >= freunde.ANFRAGEN_JE_TAG:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_requests")
    lo, hi = sorted((user.id, ziel.id))
    db.add(models.Friendship(user_lo=lo, user_hi=hi, requester_id=user.id, status="pending", created_at=jetzt))
    db.commit()
    freunde.push(db, ziel.id, "anfrage", "/friends", n=user.display_name or "?")
    return {"status": "angefragt"}


def _annehmen(db: Session, ich: models.User, anderer: models.User, z: models.Friendship) -> dict:
    z.status = "accepted"
    z.responded_at = _jetzt()
    db.commit()
    freunde.push(db, anderer.id, "angenommen", f"/foiler/{ich.id}", n=ich.display_name or "?")
    return {"status": "freund"}


@router.post("/{user_id}/accept")
def annehmen(user_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    ziel = _ziel(db, user, user_id)
    z = freunde.zeile(db, user.id, ziel.id)
    if z is None or z.status != "pending" or z.requester_id == user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no_request")
    return _annehmen(db, user, ziel, z)


@router.post("/{user_id}/decline")
def ablehnen(user_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Still: der andere erfaehrt es nicht (s. Kopfzeile)."""
    z = freunde.zeile(db, user.id, user_id)
    if z is None or z.status != "pending" or z.requester_id == user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "no_request")
    z.status = "declined"
    z.responded_at = _jetzt()
    db.commit()
    return {"status": None}


@router.delete("/{user_id}")
def beenden(user_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Freundschaft beenden oder eigene Anfrage zurueckziehen — ohne Nachricht an den anderen.
    Eine ABGELEHNTE Zeile bleibt als Sperre stehen (sonst liesse sich die Sperre gegen sofortiges
    Neu-Anfragen durch Zurueckziehen umgehen); zieht der Anfragende sie zurueck, wird sie nur fuer
    ihn ausgeblendet (`withdrawn`)."""
    z = freunde.zeile(db, user.id, user_id)
    if z is None:
        return {"status": None}
    if z.status in ("declined", "withdrawn"):
        if z.requester_id == user.id:
            z.status = "withdrawn"
            db.commit()
        return {"status": None}
    db.delete(z)
    db.commit()
    return {"status": None}
