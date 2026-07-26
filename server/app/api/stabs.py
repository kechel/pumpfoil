"""Stabilizer-/Rear-Wing-Katalog (Stammdaten) — read-only, Aufbau wie api/foils.py.

Anders als bei Foils sind die Maße oft nicht dokumentiert: span_cm/area_cm2 dürfen fehlen,
`specs_estimated` markiert geschätzte Werte (UI kennzeichnet das). Rein informativ — es wird
nichts damit gerechnet (die Analyse nutzt auch die Foil-Geometrie nicht).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/stabs", tags=["stabs"])


def _out(s: models.Stab) -> dict:
    # Aspect Ratio nur, wenn beide Maße vorliegen (sonst null — kein Raten).
    ar = round((s.span_cm ** 2) / s.area_cm2, 2) if (s.span_cm and s.area_cm2) else None
    return {
        "id": s.id, "brand": s.brand, "model": s.model, "size": s.size,
        "span_cm": s.span_cm, "area_cm2": s.area_cm2,
        "specs_estimated": bool(s.specs_estimated),
        "aspect_ratio": ar,
    }


@router.get("")
def list_stabs(
    q: str | None = Query(None), brand: str | None = Query(None),
    _user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Katalog (optional gefiltert nach Freitext q und/oder Marke)."""
    query = db.query(models.Stab)
    if brand:
        query = query.filter(models.Stab.brand == brand)
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func, or_
        query = query.filter(or_(
            func.lower(models.Stab.brand).like(like),
            func.lower(models.Stab.model).like(like),
        ))
    rows = query.order_by(models.Stab.brand, models.Stab.model, models.Stab.size).all()
    return [_out(s) for s in rows]


@router.get("/brands")
def brands(_user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[str]:
    return [b for (b,) in db.query(models.Stab.brand).distinct().order_by(models.Stab.brand).all()]
