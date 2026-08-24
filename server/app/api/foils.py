"""Foil-Katalog (Stammdaten). Abgeleitete Größen werden hier berechnet."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import models
from ..gearsearch import wort_bedingung
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/foils", tags=["foils"])


def _out(f: models.Foil) -> dict:
    ar = round((f.span_cm ** 2) / f.area_cm2, 2) if f.area_cm2 else None       # Aspect Ratio b²/S
    chord = round(f.area_cm2 / f.span_cm, 1) if f.span_cm else None             # mittlere Chord [cm]
    return {
        "id": f.id, "brand": f.brand, "model": f.model, "size": f.size,
        "span_cm": f.span_cm, "area_cm2": f.area_cm2,
        # 0 = unbekannt. In der DB darf die Dicke NULL sein (echte Luecke, s. models.Foil),
        # auf der Leitung bleibt es 0 — dieselbe Konvention wie bei span/area, und die
        # ausgelieferten Apps dekodieren `null` in diesem Feld NICHT (Android: Double mit
        # Default, iOS: nicht-optionales Double -> beide wuerfen beim Parsen).
        "thickness_mm": f.thickness_mm or 0,
        "thickness_estimated": bool(f.thickness_estimated),
        "specs_estimated": bool(f.specs_estimated),
        "aspect_ratio": ar, "mean_chord_cm": chord, "is_baseline": f.is_baseline,
        # MITGELIEFERT, aber nicht zum Anzeigen: die Weboberflaeche filtert lokal und braucht die
        # Zweitbezeichnungen deshalb im Datensatz. Kein Client stellt sie dar.
        "aliases": f.aliases or None,
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
        # Wortweise suchen (Reihenfolge egal), Groesse und Aliase mit: Nutzer tippen die Zahl von
        # ihrem Material („375", „1300") und die Worte in ihrer eigenen Reihenfolge — „axis png 1300
        # v2" muss `AXIS PNG V2 1300` finden. Siehe app/gearsearch.py: wer sein Teil nicht findet,
        # legt einen privaten Eintrag an, und das Teil steht zweimal im Katalog (Befund 17.08.).
        bed = wort_bedingung(q, [models.Foil.brand, models.Foil.model, models.Foil.size,
                                 models.Foil.aliases])
        if bed is not None:
            query = query.filter(bed)
    rows = query.order_by(models.Foil.brand, models.Foil.model, models.Foil.area_cm2).all()
    return [_out(f) for f in rows]


@router.get("/brands")
def brands(_user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[str]:
    return [b for (b,) in db.query(models.Foil.brand).distinct().order_by(models.Foil.brand).all()]
