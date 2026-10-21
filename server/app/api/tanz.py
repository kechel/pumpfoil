"""Tanz-Abschnitte ansehen und korrigieren (nur Besitzer, nur sport == "dance"). Siehe app/tanz.py."""
from __future__ import annotations

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, tanz
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/sessions", tags=["tanz"])


def _eigene_tanz_session(db, sid: int, user) -> models.Session:
    s = db.get(models.Session, sid)
    if s is None or s.deleted or s.user_id != user.id or (s.sport or "") != "dance":
        raise HTTPException(404, "Keine eigene Tanz-Session")
    return s


@router.get("/{sid}/tanz")
def tanz_lesen(sid: int, db: Session = Depends(get_db), user=Depends(current_user)):
    s = _eigene_tanz_session(db, sid, user)
    d = tanz.laden(s.session_uuid) or {"abschnitte": []}
    return {"abschnitte": d.get("abschnitte") or [], "taenze": list(tanz.TAENZE)}


@router.put("/{sid}/tanz")
def tanz_korrigieren(sid: int, body: dict = Body(...), db: Session = Depends(get_db), user=Depends(current_user)):
    s = _eigene_tanz_session(db, sid, user)
    alt = (tanz.laden(s.session_uuid) or {}).get("abschnitte") or []
    neu = tanz.aus_web(body.get("abschnitte"), alt)
    d = tanz.speichern(s.session_uuid, neu, "web")
    return {"abschnitte": d["abschnitte"], "taenze": list(tanz.TAENZE)}
