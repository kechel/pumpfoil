"""Boards des Nutzers — KEIN Katalog, sondern eigene Einträge (Name + optional Volumen/Länge).

Begründung (s. docs/setup-and-watch-layouts.md): eine Board-Datenbank über alle Hersteller zu
pflegen wäre viel Aufwand bei kleinem Nutzen — Nutzer tippen ihr Board einmal selbst ein.
Ansonsten verhält sich ein Board wie ein Foil: Liste + ein Default (settings_json.board_id),
je Session überschreibbar (Session.board_id).
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/boards", tags=["boards"])


class BoardIn(BaseModel):
    name: str
    volume_l: float | None = None
    length_cm: float | None = None


def _out(b: models.Board) -> dict:
    return {"id": b.id, "name": b.name, "volume_l": b.volume_l, "length_cm": b.length_cm}


def _clean(v: float | None, lo: float, hi: float) -> float | None:
    if v is None:
        return None
    try:
        return round(max(lo, min(hi, float(v))), 1)
    except (TypeError, ValueError):
        return None


@router.get("")
def list_boards(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(models.Board).filter_by(user_id=user.id).order_by(models.Board.name).all()
    return [_out(b) for b in rows]


@router.post("")
def create_board(body: BoardIn, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    name = (body.name or "").strip()[:80]
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name fehlt")
    b = models.Board(user_id=user.id, name=name,
                     volume_l=_clean(body.volume_l, 0, 400),
                     length_cm=_clean(body.length_cm, 0, 400))
    db.add(b)
    db.commit()
    db.refresh(b)
    return _out(b)


@router.put("/{board_id}")
def update_board(board_id: int, body: BoardIn, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    b = db.query(models.Board).filter_by(id=board_id, user_id=user.id).first()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board nicht gefunden")
    name = (body.name or "").strip()[:80]
    if name:
        b.name = name
    b.volume_l = _clean(body.volume_l, 0, 400)
    b.length_cm = _clean(body.length_cm, 0, 400)
    db.commit()
    db.refresh(b)
    return _out(b)


@router.delete("/{board_id}")
def delete_board(board_id: int, user: models.User = Depends(current_user),
                 db: Session = Depends(get_db)) -> dict:
    b = db.query(models.Board).filter_by(id=board_id, user_id=user.id).first()
    if b is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board nicht gefunden")
    # Sessions, die dieses Board referenzieren, auf „Standard" zurücksetzen (FK sauber halten).
    db.query(models.Session).filter_by(board_id=board_id).update({"board_id": None})
    # War es der Default des Nutzers, den Default ebenfalls leeren.
    if user.settings_json:
        try:
            st = json.loads(user.settings_json) or {}
        except ValueError:
            st = {}
        if st.get("board_id") == board_id:
            st["board_id"] = None
            user.settings_json = json.dumps(st)
    db.delete(b)
    db.commit()
    return {"ok": True}
