"""Stabilizer-/Rear-Wing-Bezeichnungen — Katalog + eigene Einträge.

Absichtlich nur Marke/Modell/Größe: genau die Bezeichnung, die der Nutzer auswählt und angezeigt
bekommt („GONG Stab Trail L"). Es wird nichts damit gerechnet (die Analyse nutzt auch die
Foil-Geometrie nicht), deshalb pflegen wir keine Maße.

`Stab.user_id` NULL = globaler Katalog (geseedet, sichtbar für alle). Gesetzt = privater Eintrag
dieses Nutzers — die Hersteller-Landschaft ist zu groß, um auf einen vollständigen Katalog zu
warten. Gute private Einträge übernehmen wir später von Hand in den globalen Katalog.
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/stabs", tags=["stabs"])


class StabIn(BaseModel):
    brand: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=80)
    size: str = Field(default="", max_length=20)


def _out(s: models.Stab) -> dict:
    return {
        "id": s.id, "brand": s.brand, "model": s.model, "size": s.size,
        "is_own": s.user_id is not None,
        # Maße nur mitschicken, wenn sie wirklich gepflegt sind (0 = nie eingetragen). Bis 2026-07-31
        # standen sie bei ALLEN Katalog-Stabs auf 0 und fehlten deshalb hier ganz — beim Nachtragen
        # der Gong-Tabellen fiel auf, dass die Zahlen dadurch nirgends ankamen.
        "span_cm": s.span_cm or None,
        "area_cm2": s.area_cm2 or None,
        "specs_estimated": bool(getattr(s, "specs_estimated", False)),
    }


def _visible(db: Session, user: models.User):
    """Globaler Katalog + eigene Einträge (fremde private Einträge bleiben unsichtbar)."""
    return db.query(models.Stab).filter(
        or_(models.Stab.user_id.is_(None), models.Stab.user_id == user.id))


@router.get("")
def list_stabs(
    q: str | None = Query(None), brand: str | None = Query(None),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Auswahlliste (optional gefiltert nach Freitext q und/oder Marke)."""
    query = _visible(db, user)
    if brand:
        query = query.filter(models.Stab.brand == brand)
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func
        # Groesse MIT durchsuchen: Nutzer suchen zuerst nach der Zahl auf ihrem Material
        # („375", „1450"), nicht nach dem Modellnamen. Fehlte bis 07.08. — die Weboberflaeche
        # filtert lokal (dort war die Groesse dabei), jeder API-Nutzer fand aber nichts.
        query = query.filter(or_(
            func.lower(models.Stab.brand).like(like),
            func.lower(models.Stab.model).like(like),
            func.lower(models.Stab.size).like(like),
        ))
    rows = query.order_by(models.Stab.brand, models.Stab.model, models.Stab.size).all()
    return [_out(s) for s in rows]


@router.get("/brands")
def brands(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[str]:
    rows = _visible(db, user).with_entities(models.Stab.brand).distinct().order_by(models.Stab.brand).all()
    return [b for (b,) in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_stab(
    body: StabIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Eigene Bezeichnung anlegen. Gibt es die Variante schon (Katalog oder eigene), kommt
    genau diese zurück — kein Duplikat (die Variante ist DB-weit eindeutig)."""
    brand, model, size = body.brand.strip(), body.model.strip(), body.size.strip()
    if not brand or not model:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Marke und Modell sind nötig")
    dupe = db.query(models.Stab).filter(
        models.Stab.brand == brand, models.Stab.model == model, models.Stab.size == size).first()
    if dupe is not None:
        # Fremder privater Eintrag mit gleicher Bezeichnung: nicht verraten, aber auch nicht
        # kollidieren lassen -> als Treffer behandeln wäre falsch, also 409.
        if dupe.user_id not in (None, user.id):
            raise HTTPException(status.HTTP_409_CONFLICT, "Bezeichnung bereits vergeben")
        return _out(dupe)
    s = models.Stab(user_id=user.id, brand=brand, model=model, size=size)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _out(s)


@router.delete("/{stab_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stab(
    stab_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> None:
    """Nur eigene Einträge. Sessions, die darauf zeigen, verlieren die Zuordnung (NULL)."""
    s = db.get(models.Stab, stab_id)
    if s is None or s.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nicht gefunden")
    # Sessions, die darauf zeigen, auf „Standard" zurücksetzen (FK sauber halten).
    db.query(models.Session).filter_by(stab_id=stab_id).update({"stab_id": None})
    if user.settings_json:
        try:
            st = json.loads(user.settings_json) or {}
        except ValueError:
            st = {}
        touched = False
        if st.get("stab_id") == stab_id:
            st["stab_id"] = None
            touched = True
        if stab_id in (st.get("my_stabs") or []):
            st["my_stabs"] = [x for x in st["my_stabs"] if x != stab_id]
            touched = True
        if touched:
            user.settings_json = json.dumps(st)
    db.delete(s)
    db.commit()
