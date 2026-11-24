"""Musik-Mixe der Media-Ansicht speichern, teilen und laden (docs/MEDIA.md, Jan 24.11.2026).

Jan: „eine sound-einstellung auch speicherbar machen unter einer freien bezeichnung und vielleicht auch shareable in der
community und auf knopfdruck laden koennen fuer den eigenen track". Vorbild sind die Uhr-Layouts (api/layouts.py):
eigene Liste, „veroeffentlichen" fuer die Community, Laden zaehlt.

SICHERHEIT: Aus `cfg` erzeugt die Media-Ansicht Strudel-Code, der bei JEDEM laeuft, der den Mix laedt (im
abgeschotteten iframe, aber trotzdem). Deshalb nimmt `pruefe_cfg` nur bekannte Felder mit Werten aus festen Listen
bzw. Zahlen in Grenzen; Freitext (Stimmen-Namen) wird gekuerzt und von Steuerzeichen befreit. Die Listen hier muessen
zu web/src/lib/media/musik.ts passen.
"""
from __future__ import annotations

import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/media/mixe", tags=["media"])

MAX_MIXE = 50            # je Nutzer
MAX_STIMMEN = 24
STILE = {"techno", "klavier", "gitarre", "chiptune", "ambient"}
MUSTER = {"treffer", "anschlag", "melodie", "arpeggio", "akkord", "bass", "beat"}
WANN = {"lauf", "pump", "gleiten", "sprint", "carve", "meter", "immer"}
Q = {"fest", "tempo", "pumpfreq", "puls", "carve", "beschl", "verlauf"}
FX = {"sprintTempo", "riser", "carveWhoosh", "topSpeed", "meter", "kampf", "start", "ende"}
INSTRUMENT = re.compile(r"^(synth:(sawtooth|supersaw|square|triangle|sine|fm|pulse)|kit:(synth|akustik)|pf_[a-z_]{2,30})$")


def _text(s: object, n: int) -> str:
    """Freitext: Steuerzeichen und Zeilenumbrueche raus (sie landen in Code-Kommentaren), gekuerzt."""
    t = re.sub(r"[\x00-\x1f\x7f  ]", " ", str(s or ""))
    return re.sub(r"\s+", " ", t).strip()[:n]


def _zahl(x: object, lo: float, hi: float, standard: float) -> float:
    try:
        v = float(x)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return standard
    return min(hi, max(lo, v)) if v == v else standard


def pruefe_cfg(roh: object) -> dict:
    """Nur bekannte Felder/Werte uebernehmen. Unbekanntes wird verworfen, kaputte Werte fallen auf Standard."""
    if not isinstance(roh, dict):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungueltige Einstellung")
    stimmen = []
    for i, v in enumerate(roh.get("stimmen") or []):
        if not isinstance(v, dict) or len(stimmen) >= MAX_STIMMEN:
            continue
        instr = str(v.get("instrument") or "")
        stimmen.append({
            "id": f"m{i}",
            "name": _text(v.get("name"), 24) or f"Voice {i + 1}",
            "instrument": instr if INSTRUMENT.match(instr) else "synth:triangle",
            "muster": v.get("muster") if v.get("muster") in MUSTER else "melodie",
            "wann": v.get("wann") if v.get("wann") in WANN else "lauf",
            "ton": v.get("ton") if v.get("ton") in Q | {"akkorde"} and v.get("ton") != "fest" else "akkorde",
            "laut": v.get("laut") if v.get("laut") in Q else "fest",
            "farbe": v.get("farbe") if v.get("farbe") in Q else "fest",
            "pan": "carve" if v.get("pan") == "carve" else "mitte",
            "dichte": v.get("dichte") if v.get("dichte") in Q else "fest",
            "oktave": int(_zahl(v.get("oktave"), 1, 6, 4)),
            "lautstaerke": round(_zahl(v.get("lautstaerke"), 0, 1, 0.6), 2),
            "stumm": bool(v.get("stumm")), "solo": bool(v.get("solo")),
        })
    fx_roh = roh.get("fx") if isinstance(roh.get("fx"), dict) else {}
    return {
        "vorlage": roh.get("vorlage") if roh.get("vorlage") in STILE else "techno",
        "stimmen": stimmen,
        "fx": {k: bool(fx_roh.get(k)) for k in FX},
        "fxLaut": round(_zahl(roh.get("fxLaut"), 0, 1, 0.8), 2),
    }


class MixIn(BaseModel):
    name: str
    cfg: dict
    published: bool | None = None


def _out(m: models.MusikMix, author: str | None = None, eigen: bool = True) -> dict:
    try:
        cfg = json.loads(m.cfg or "{}")
    except ValueError:
        cfg = {}
    return {"id": m.id, "name": m.name, "cfg": cfg, "published": bool(m.published), "geladen": m.geladen or 0,
            "eigen": eigen, "author": author, "updated_at": m.updated_at.isoformat() if m.updated_at else None}


@router.get("")
def meine(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    rows = db.query(models.MusikMix).filter_by(user_id=user.id).order_by(models.MusikMix.updated_at.desc()).all()
    return [_out(m) for m in rows]


@router.get("/community")
def community(sort: str = Query("geladen"), limit: int = Query(60, ge=1, le=200),
              user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> list[dict]:
    """Geteilte Mixe aller (auch die eigenen). `sort=geladen`: am oeftesten von anderen geladen zuerst; `new`: neueste."""
    q = (db.query(models.MusikMix, models.User.display_name)
         .join(models.User, models.User.id == models.MusikMix.user_id)
         .filter(models.MusikMix.published.is_(True)))
    q = q.order_by(models.MusikMix.updated_at.desc()) if sort == "new" else \
        q.order_by(models.MusikMix.geladen.desc(), models.MusikMix.updated_at.desc())
    return [_out(m, author=name or "?", eigen=m.user_id == user.id) for m, name in q.limit(limit).all()]


@router.post("", status_code=status.HTTP_201_CREATED)
def speichern(body: MixIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    n = db.query(models.MusikMix).filter_by(user_id=user.id).count()
    if n >= MAX_MIXE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zu viele Mixe")
    name = _text(body.name, 60)
    if not name:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name fehlt")
    m = models.MusikMix(user_id=user.id, name=name, cfg=json.dumps(pruefe_cfg(body.cfg), ensure_ascii=False),
                        published=bool(body.published))
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(m)


def _eigener(db: Session, mix_id: int, user: models.User) -> models.MusikMix:
    m = db.query(models.MusikMix).filter_by(id=mix_id, user_id=user.id).first()
    if m is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mix nicht gefunden")
    return m


@router.put("/{mix_id}")
def aendern(mix_id: int, body: MixIn, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    m = _eigener(db, mix_id, user)
    name = _text(body.name, 60)
    if name:
        m.name = name
    m.cfg = json.dumps(pruefe_cfg(body.cfg), ensure_ascii=False)
    if body.published is not None:
        m.published = bool(body.published)
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.post("/{mix_id}/publish")
def teilen(mix_id: int, published: bool = Query(True),
           user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    m = _eigener(db, mix_id, user)
    m.published = bool(published)
    m.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(m)
    return _out(m)


@router.post("/{mix_id}/geladen")
def geladen(mix_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    """Jemand hat einen geteilten Mix geladen — zaehlt nur fremde Mixe (eigenes Laden ist kein Zuspruch)."""
    m = db.get(models.MusikMix, mix_id)
    if m is None or (m.user_id != user.id and not m.published):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Mix nicht gefunden")
    if m.user_id != user.id:
        m.geladen = (m.geladen or 0) + 1
        db.commit()
    return {"ok": True, "geladen": m.geladen or 0}


@router.delete("/{mix_id}", status_code=status.HTTP_204_NO_CONTENT)
def loeschen(mix_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> None:
    m = _eigener(db, mix_id, user)
    # Kopien anderer behalten ihren Inhalt, nur die Herkunft faellt weg.
    db.query(models.MusikMix).filter_by(copied_from_id=m.id).update({"copied_from_id": None})
    db.delete(m)
    db.commit()
