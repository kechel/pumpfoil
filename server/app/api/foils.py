"""Foil-Katalog (Stammdaten). Abgeleitete Größen werden hier berechnet."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/foils", tags=["foils"])


def _out(f: models.Foil) -> dict:
    ar = round((f.span_cm ** 2) / f.area_cm2, 2) if f.area_cm2 else None       # Aspect Ratio b²/S
    chord = round(f.area_cm2 / f.span_cm, 1) if f.span_cm else None             # mittlere Chord [cm]
    return {
        "id": f.id, "brand": f.brand, "model": f.model, "size": f.size,
        "span_cm": f.span_cm, "area_cm2": f.area_cm2, "thickness_mm": f.thickness_mm,
        "aspect_ratio": ar, "mean_chord_cm": chord, "is_baseline": f.is_baseline,
    }


@router.get("")
def list_foils(
    q: str | None = Query(None), brand: str | None = Query(None),
    _user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Katalog (optional gefiltert nach Freitext q und/oder Marke)."""
    query = db.query(models.Foil)
    if brand:
        query = query.filter(models.Foil.brand == brand)
    if q:
        like = f"%{q.lower()}%"
        from sqlalchemy import func, or_
        query = query.filter(or_(
            func.lower(models.Foil.brand).like(like),
            func.lower(models.Foil.model).like(like),
        ))
    rows = query.order_by(models.Foil.brand, models.Foil.model, models.Foil.area_cm2).all()
    return [_out(f) for f in rows]


@router.get("/brands")
def brands(_user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[str]:
    return [b for (b,) in db.query(models.Foil.brand).distinct().order_by(models.Foil.brand).all()]
