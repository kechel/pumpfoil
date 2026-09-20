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
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..gearsearch import wort_bedingung
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
        # MITGELIEFERT, aber nicht zum Anzeigen (s. foils.py).
        "aliases": s.aliases or None,
    }


def _vergleichsworte(*teile: str) -> set[str]:
    """Bezeichnung in vergleichbare Worte zerlegen: klein, ohne Satzzeichen, Reihenfolge egal.

    Genau die Sicht, die auch `gearsearch.wort_bedingung` auf eine Eingabe hat — nur eben als
    Menge statt als SQL. „460/60 V2" wird zu {460, 60, v2}, „Stab fluid H" zu {stab, fluid, h}.
    """
    roh = " ".join(t or "" for t in teile).lower()
    return {w for w in re.split(r"[^0-9a-zà-ÿ]+", roh) if w}


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
        # Wortweise suchen (Reihenfolge egal), Groesse und Aliase mit: Nutzer tippen die Zahl von
        # ihrem Material („375", „1300") und die Worte in ihrer eigenen Reihenfolge — „axis png 1300
        # v2" muss `AXIS PNG V2 1300` finden. Siehe app/gearsearch.py: wer sein Teil nicht findet,
        # legt einen privaten Eintrag an, und das Teil steht zweimal im Katalog (Befund 17.08.).
        bed = wort_bedingung(q, [models.Stab.brand, models.Stab.model, models.Stab.size,
                                 models.Stab.aliases])
        if bed is not None:
            query = query.filter(bed)
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
    """Eigene Bezeichnung anlegen — aber erst nachsehen, ob es das Teil schon gibt.

    Zwei Stufen, beide geben den VORHANDENEN Eintrag zurück statt einen neuen anzulegen:

    1. **Zeichengleich** (Marke/Modell/Größe exakt) — die Variante ist DB-weit eindeutig.
    2. **So, als hätte man gesucht und zugeordnet** (Jan, 20.09.2026). Anlass: von zwölf privat
       angelegten Stabs waren zwei Produkte, die längst im Katalog stehen — `Gong Stab Fluid H L`
       (id 263) und `Gong Stab Trail L` (id 24). Wer sein Teil nicht findet, legt es privat an,
       und dann steht dasselbe Produkt zweimal da; genau diese Ursache steht schon über
       `gearsearch.py`.

    Stufe 2 vergleicht WORTWEISE und reihenfolgeunabhängig — dieselbe Sicht, die die Suche auf
    eine Eingabe hat. Zugeordnet wird nur, wenn

      * die MARKE wortgleich ist (nach Normalisierung), und
      * die Worte der Eingabe vollständig in einem Katalogeintrag vorkommen, und
      * **genau ein** Eintrag das erfüllt.

    Das dritte Kriterium ist der Schutz: `Gong / Trail / L` passt auf `Stab Trail L` UND auf drei
    `Tail Wing … Trail L` — mehrdeutig, also wird wie bisher ein privater Eintrag angelegt. Lieber
    ein Duplikat als eine stille Fehlzuordnung ([[catalog-research-checks]], Pflichtprüfung 4:
    nie auf Namensähnlichkeit zusammenführen).

    Was Stufe 2 fängt, an echten Meldungen nachgestellt: `Takoon / Glide 220 / 220` ->
    `TAKOON Foil Stab Glide 220` · `Gong / Stab fluid H L / L` -> `Gong Stab Fluid H L` ·
    `NAISH / 2D / 250` -> `Naish 2D Stabilizer 250`. Ein Vertipper wie `Naich` bleibt ein
    privater Eintrag — das ist richtig so, wir raten nicht.
    """
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
        return _out(dupe) | {"matched": True}

    eingabe = _vergleichsworte(brand, model, size)
    marke = _vergleichsworte(brand)
    treffer = [r for r in _visible(db, user).all()
               if _vergleichsworte(r.brand) == marke
               and eingabe <= _vergleichsworte(r.brand, r.model, r.size)]
    if len(treffer) == 1:
        return _out(treffer[0]) | {"matched": True}

    s = models.Stab(user_id=user.id, brand=brand, model=model, size=size)
    db.add(s)
    db.commit()
    db.refresh(s)
    return _out(s) | {"matched": False}


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
