"""Advanced Uhr-Layouts (frei positionierbare Datenfelder) — Server-Teil von F2 P1.

Design: docs/setup-and-watch-layouts.md. Ein Layout = EINE Seite. Kategorie sagt, wann sie gilt:
`on_foil` (während des Laufs, beliebig viele Seiten), `off_foil` (nach dem Lauf, eine), `pause`
(Dümpeln zwischen den Läufen, eine).

Das Element-Format ist absichtlich kompakt und rein positionell — `[typ, x, y, size, color, flags,
extra…]`, keine Dicts mit String-Keys: die Uhr cached das Server-JSON im Object Store, und
Object-Store-Volllauf ist ein bekannter Fehlerpfad (s. garmin-watch-fieldtest-gotchas).

    typ 1  Wert          extra: [6] = Feld-ID (0…20)
    typ 2  Label         extra: [6] = Feld-ID — der ÜBERSETZTE Feldname (i18n-Key `f.*` auf der Uhr)
    typ 3  Freitext      extra: [6] = Text (max. 12 Zeichen, wird NIE übersetzt)
    typ 4  Trennlinie    extra: [6] = x2, [7] = y2 (size = Dicke)
    typ 5  REC-Indikator (roter Punkt + „REC")
    typ 6  Seiten-Punkte (Anzahl bleibt dynamisch, gespeichert werden nur Position/Farbe)

x/y sind **relativ 0…1000** (die Uhr rechnet aus `dc.getWidth/getHeight`) → tragfähig über alle
Auflösungen (176×176 … 454×454) und Formen (round/rect/semioctagon). `size` ist eine **Stufe**
(0…4), weil Garmin-Fonts diskret sind. `color` ist ein Index in die kuratierte Palette (MIP-Displays
können keine beliebigen Farben).

`authored_w/h/shape` = wo das Layout entworfen wurde: Hinweis/Filter, **keine Schranke** — kopieren
und anpassen darf man jedes Layout, auch von anderer Größe/Form.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/layouts", tags=["layouts"])

CATEGORIES = ("on_foil", "off_foil", "pause")
SHAPES = ("round", "rect", "semioctagon")

# Kuratierte Palette (Index = `color` im Element und `bg_color` am Layout). MIP-Displays können
# keine beliebigen Farben; diese hier zeichnen alle Garmin-Uhren sauber. 0 = Standard (die Uhr
# entscheidet: Werte weiß, Labels hellgrau — heutiges Verhalten).
PALETTE = [
    "auto", "#ffffff", "#d0d0d0", "#808080", "#000000",
    "#ff0000", "#ff5500", "#ffaa00", "#ffff00",
    "#00ff00", "#00aa00", "#00ffff", "#22d3ee", "#0055ff",
    "#aa00ff", "#ff00aa",
]
MAX_COLOR = len(PALETTE) - 1
# Größenstufen = die eingebauten Garmin-Fonts (FONT_XTINY … FONT_NUMBER_THAI_HOT). Ab Stufe 5
# sind es NUMBER-Fonts, die nur Ziffern enthalten -> nur Wert-Elemente dürfen dort hoch.
MAX_SIZE_STEP = 8
MAX_TEXT_STEP = 4
MAX_ELEMENTS = 24          # Uhr-Speicher + Object Store: bewusst knapp
MAX_LAYOUTS = 40           # pro Nutzer
MAX_TEXT_LEN = 12          # Freitext: die Uhr hat wenig Platz UND wenig Object Store
VALID_FIELD_IDS = set(range(0, 21))
ELEMENT_TYPES = (1, 2, 3, 4, 5, 6)


class LayoutIn(BaseModel):
    name: str = ""
    category: str = "on_foil"
    shape: str = "round"
    bg_color: int = 0
    elements: list = []
    authored_w: int | None = None
    authored_h: int | None = None
    authored_shape: str | None = None


def _clamp(v, lo: int, hi: int, default: int = 0) -> int:
    try:
        return max(lo, min(hi, int(round(float(v)))))
    except (TypeError, ValueError):
        return default


def _clean_text(v) -> str:
    """Freitext: Steuerzeichen raus, Länge kappen. Nicht darstellbare Zeichen (CJK/Emoji) warnt
    der Editor an — hier NICHT filtern, sonst verschwindet Text stillschweigend."""
    s = str(v or "").replace("\n", " ").replace("\t", " ")
    s = "".join(ch for ch in s if ch.isprintable())
    return s.strip()[:MAX_TEXT_LEN]


def _clean_element(e) -> list | None:
    """Ein Element validieren. Gibt die normalisierte Liste zurück oder None (= verwerfen)."""
    if not isinstance(e, (list, tuple)) or len(e) < 6:
        return None
    typ = _clamp(e[0], 0, 9, 0)
    if typ not in ELEMENT_TYPES:
        return None
    # Größenstufe = ein echter Garmin-Font (0 = FONT_XTINY … 8 = FONT_NUMBER_THAI_HOT).
    # Die NUMBER-Fonts (ab Stufe 5) enthalten NUR Ziffern -> nur für Wert-Elemente zulassen,
    # Labels/Freitexte werden auf FONT_LARGE (4) gekappt, sonst wären sie unsichtbar.
    max_step = MAX_SIZE_STEP if typ == 1 else MAX_TEXT_STEP
    out = [
        typ,
        _clamp(e[1], 0, 1000),           # x
        _clamp(e[2], 0, 1000),           # y
        _clamp(e[3], 0, max_step, 2),    # size-Stufe (bei Linie: Dicke, s. unten)
        _clamp(e[4], 0, MAX_COLOR),      # Palette-Index
        _clamp(e[5], 0, 7),              # flags: 1 = linksbündig, 2 = rechtsbündig, 4 = colorByValue
    ]
    if typ in (1, 2):               # Wert / übersetztes Label -> Feld-ID
        fid = _clamp(e[6] if len(e) > 6 else 0, 0, 20)
        if fid not in VALID_FIELD_IDS:
            return None
        out.append(fid)
    elif typ == 3:                  # Freitext
        txt = _clean_text(e[6] if len(e) > 6 else "")
        if not txt:
            return None
        out.append(txt)
    elif typ == 4:                  # Trennlinie -> zweiter Punkt
        if len(e) < 8:
            return None
        out += [_clamp(e[6], 0, 1000), _clamp(e[7], 0, 1000)]
        out[3] = _clamp(e[3], 1, 4, 1)   # Dicke mindestens 1
    return out


def _clean_elements(raw) -> list[list]:
    if not isinstance(raw, (list, tuple)):
        return []
    out = []
    for e in raw[:MAX_ELEMENTS * 2]:
        c = _clean_element(e)
        if c is not None:
            out.append(c)
        if len(out) >= MAX_ELEMENTS:
            break
    return out


def _has_freetext(elements: list) -> bool:
    return any(isinstance(e, list) and e and e[0] == 3 for e in elements)


def _out(l: models.WatchLayout, author: str | None = None, copies: int | None = None) -> dict:
    try:
        elements = json.loads(l.elements or "[]")
    except ValueError:
        elements = []
    d = {
        "id": l.id, "name": l.name, "category": l.category, "shape": l.shape,
        "bg_color": l.bg_color, "elements": elements,
        "published": bool(l.published), "copied_from_id": l.copied_from_id,
        "authored_w": l.authored_w, "authored_h": l.authored_h,
        "authored_shape": l.authored_shape,
        # Galerie-Hinweis: „enthält eigene Texte" (nach dem Kopieren evtl. anzupassen).
        "has_freetext": _has_freetext(elements),
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
    }
    if author is not None:
        d["author"] = author
    if copies is not None:
        d["copies"] = copies
    return d


def _apply(l: models.WatchLayout, body: LayoutIn) -> None:
    name = (body.name or "").strip()[:60]
    l.name = name or "Layout"
    l.category = body.category if body.category in CATEGORIES else "on_foil"
    l.shape = body.shape if body.shape in SHAPES else "round"
    l.bg_color = _clamp(body.bg_color, 0, MAX_COLOR)
    l.elements = json.dumps(_clean_elements(body.elements), ensure_ascii=False)
    l.authored_w = _clamp(body.authored_w, 100, 600) if body.authored_w else None
    l.authored_h = _clamp(body.authored_h, 100, 600) if body.authored_h else None
    l.authored_shape = body.authored_shape if body.authored_shape in SHAPES else None
    l.updated_at = datetime.now(timezone.utc)


@router.get("/meta")
def meta(_user: models.User = Depends(current_user)) -> dict:
    """Palette + Grenzen — eine Quelle für PWA (und später Uhr), damit nichts auseinanderläuft."""
    return {
        "palette": PALETTE, "categories": list(CATEGORIES), "shapes": list(SHAPES),
        "max_elements": MAX_ELEMENTS, "max_layouts": MAX_LAYOUTS, "max_text_len": MAX_TEXT_LEN,
        "max_size_step": MAX_SIZE_STEP, "max_text_step": MAX_TEXT_STEP,
        "element_types": {"value": 1, "label": 2, "text": 3, "line": 4, "rec": 5, "dots": 6},
    }


@router.get("")
def list_layouts(
    category: str | None = Query(None),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    q = db.query(models.WatchLayout).filter_by(user_id=user.id)
    if category in CATEGORIES:
        q = q.filter_by(category=category)
    rows = q.order_by(models.WatchLayout.category, models.WatchLayout.id).all()
    return [_out(x) for x in rows]


@router.get("/community")
def community(
    category: str | None = Query(None), shape: str | None = Query(None),
    w: int | None = Query(None), h: int | None = Query(None),
    limit: int = Query(60, ge=1, le=200),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Veröffentlichte Layouts anderer (+ eigene). Größe/Form filtern ist ein **Komfort-Filter**,
    keine Schranke: kopieren darf man jedes Layout (Koordinaten sind relativ)."""
    copies = (db.query(models.WatchLayout.copied_from_id, func.count().label("n"))
              .filter(models.WatchLayout.copied_from_id.isnot(None))
              .group_by(models.WatchLayout.copied_from_id).all())
    copy_count = {cid: n for cid, n in copies}
    q = (db.query(models.WatchLayout, models.User.display_name)
         .join(models.User, models.User.id == models.WatchLayout.user_id)
         .filter(models.WatchLayout.published.is_(True)))
    if category in CATEGORIES:
        q = q.filter(models.WatchLayout.category == category)
    if shape in SHAPES:
        q = q.filter(models.WatchLayout.authored_shape == shape)
    if w:
        q = q.filter(models.WatchLayout.authored_w == _clamp(w, 100, 600))
    if h:
        q = q.filter(models.WatchLayout.authored_h == _clamp(h, 100, 600))
    rows = q.order_by(models.WatchLayout.updated_at.desc()).limit(limit).all()
    return [_out(l, author=name or "?", copies=copy_count.get(l.id, 0)) for l, name in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_layout(
    body: LayoutIn, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    n = db.query(func.count(models.WatchLayout.id)).filter_by(user_id=user.id).scalar() or 0
    if n >= MAX_LAYOUTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zu viele Layouts")
    l = models.WatchLayout(user_id=user.id)
    _apply(l, body)
    db.add(l)
    db.commit()
    db.refresh(l)
    return _out(l)


@router.put("/{layout_id}")
def update_layout(
    layout_id: int, body: LayoutIn,
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    l = db.query(models.WatchLayout).filter_by(id=layout_id, user_id=user.id).first()
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout nicht gefunden")
    _apply(l, body)
    db.commit()
    db.refresh(l)
    return _out(l)


@router.post("/{layout_id}/publish")
def publish_layout(
    layout_id: int, published: bool = Query(True),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    l = db.query(models.WatchLayout).filter_by(id=layout_id, user_id=user.id).first()
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout nicht gefunden")
    l.published = bool(published)
    l.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(l)
    return _out(l)


@router.post("/{layout_id}/copy", status_code=status.HTTP_201_CREATED)
def copy_layout(
    layout_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> dict:
    """Fremdes (veröffentlichtes) oder eigenes Layout ins eigene Profil kopieren — ausdrücklich
    OHNE Größen-/Form-Schranke. Die Kopie ist unveröffentlicht und merkt sich die Herkunft."""
    src = db.get(models.WatchLayout, layout_id)
    if src is None or (src.user_id != user.id and not src.published):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout nicht gefunden")
    n = db.query(func.count(models.WatchLayout.id)).filter_by(user_id=user.id).scalar() or 0
    if n >= MAX_LAYOUTS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Zu viele Layouts")
    l = models.WatchLayout(
        user_id=user.id, name=src.name[:60], category=src.category, shape=src.shape,
        bg_color=src.bg_color, elements=src.elements, published=False,
        copied_from_id=src.id,
        # Entstehungs-Angabe bleibt die des Originals — das Badge soll die Wahrheit sagen, bis
        # der Nutzer das Layout im Editor auf seine Uhr umbaut.
        authored_w=src.authored_w, authored_h=src.authored_h, authored_shape=src.authored_shape)
    db.add(l)
    db.commit()
    db.refresh(l)
    return _out(l)


@router.delete("/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_layout(
    layout_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> None:
    l = db.query(models.WatchLayout).filter_by(id=layout_id, user_id=user.id).first()
    if l is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Layout nicht gefunden")
    # Kopien anderer Nutzer bleiben erhalten, verlieren aber die Herkunft (FK sauber halten).
    db.query(models.WatchLayout).filter_by(copied_from_id=layout_id).update({"copied_from_id": None})
    # Verweise in den eigenen Einstellungen mit aufräumen — sonst bleibt eine Seite in `pages`
    # bzw. ein Off-Foil-/Pausen-Screen auf ein gelöschtes Layout zeigen.
    if user.settings_json:
        try:
            st = json.loads(user.settings_json) or {}
        except ValueError:
            st = {}
        touched = False
        pages = st.get("pages")
        if isinstance(pages, list):
            cleaned = [p for p in pages if not (isinstance(p, (int, float)) and int(p) == layout_id)]
            if len(cleaned) != len(pages):
                st["pages"] = cleaned or None
                touched = True
        for key in ("off_foil_layout_id", "pause_layout_id"):
            if st.get(key) == layout_id:
                st[key] = None
                touched = True
        if touched:
            user.settings_json = json.dumps(st)
    db.delete(l)
    db.commit()
