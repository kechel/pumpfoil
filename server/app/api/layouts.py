"""Advanced Uhr-Layouts (frei positionierbare Datenfelder) — Server-Teil von F2 P1.

Design: docs/setup-and-watch-layouts.md. Ein Layout = EINE Seite. Kategorie sagt, wann sie gilt:
`on_foil` (Lauf läuft), `off_foil` (Aufnahme läuft, gerade kein Lauf) und `pause` (Aufnahme MANUELL
pausiert). Seit F3 hat JEDER Zustand beliebig viele Seiten — s. `settings.off_foil_pages`/`pause_pages`
und den Abschnitt „F3" im Design-Doc.

Das Element-Format ist absichtlich kompakt und rein positionell — `[typ, x, y, size, color, flags,
extra…]`, keine Dicts mit String-Keys: die Uhr cached das Server-JSON im Object Store, und
Object-Store-Volllauf ist ein bekannter Fehlerpfad (s. garmin-watch-fieldtest-gotchas).

    typ 1  Wert          extra: [6] = Feld-ID (0…21)
    typ 2  Label         extra: [6] = Feld-ID — der ÜBERSETZTE Feldname (i18n-Key `f.*` auf der Uhr)
    typ 3  Freitext      extra: [6] = Text (max. 12 Zeichen, wird NIE übersetzt)
    typ 4  Trennlinie    extra: [6] = x2, [7] = y2 (size = Dicke)
    typ 5  REC-Indikator (roter Punkt + „REC")
    typ 6  Seiten-Punkte (Anzahl bleibt dynamisch, gespeichert werden nur Position/Farbe)
    typ 7  „Pausiert"-Anzeige — NUR in Kategorie `pause`, dort PFLICHT: verschiebbar, aber nicht
           entfernbar (s. _enforce_paused_hint). Klein gehalten (Stufe max. 2).

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
# 21 = Max-Puls des letzten Laufs (Wunsch ThermikDreher 15.08. „Letzter Lauf Max HR", Jan 17.08.
# auf alle Uhren erweitert). Der Session-Max-Puls ist ID 9 und gab es schon.
VALID_FIELD_IDS = set(range(0, 22))
ELEMENT_TYPES = (1, 2, 3, 4, 5, 6, 7)


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
    # Typ 7 („Pausiert"-Anzeige) wird bewusst KLEIN gehalten: sie ist ein Hinweis, um den man
    # herum gestaltet, kein Hauptelement (Jan: „aber nicht zu gross").
    max_step = MAX_SIZE_STEP if typ == 1 else (2 if typ == 7 else MAX_TEXT_STEP)
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


def _usage_stats(db: Session) -> tuple[dict[int, set[int]], dict[int, int]]:
    """Wie oft ein Layout **tatsächlich benutzt** wird — ohne jede Zusatz-Buchführung, allein aus
    vorhandenen Daten (Jans Wunsch: „vielleicht geht das aber auch einfach jederzeit mit einer
    SQL-Abfrage ganz ohne unser Zutun").

    Zwei Zahlen je Original:
      * `users`  = verschiedene Nutzer, die das Original ODER eine Kopie davon in ihren
                   Einstellungen eingebunden haben (Seitenliste, Off-Foil, Pause). Eingebunden =
                   die Uhr zeigt es wirklich; eine bloß gespeicherte Kopie zählt nicht.
      * `unchanged` = wie viele dieser Kopien **unverändert** sind (gleiche Elemente + gleicher
                   Hintergrund wie das Original).

    Bewusst in Python statt in SQL: `users.settings_json` ist TEXT (kein JSONB), und die Nutzerzahl
    ist klein. Wird das je teuer, ist der Umstieg auf JSONB + Index die Stelle.
    """
    rows = db.query(models.WatchLayout.id, models.WatchLayout.copied_from_id,
                    models.WatchLayout.elements, models.WatchLayout.bg_color).all()
    origin: dict[int, int] = {}      # Layout-ID -> ID des Originals (oder sich selbst)
    body: dict[int, tuple[str, int]] = {}
    for lid, src, els, bg in rows:
        origin[lid] = src or lid
        try:
            body[lid] = (json.dumps(json.loads(els or "[]"), separators=(",", ":")), int(bg or 0))
        except ValueError:
            body[lid] = ("[]", int(bg or 0))

    users: dict[int, set[int]] = {}
    for uid, sj in db.query(models.User.id, models.User.settings_json).filter(
            models.User.settings_json.isnot(None)).all():
        try:
            st = json.loads(sj or "{}")
        except ValueError:
            continue
        used: set[int] = set()
        # In `pages` ist eine Layout-Seite eine NACKTE ID; eine Liste ist eine klassische
        # 3-Feld-Seite (s. settings._clean_pages) — bool vor int prüfen, True ist sonst 1.
        for p in st.get("pages") or []:
            if isinstance(p, int) and not isinstance(p, bool) and p > 0:
                used.add(p)
        for key in ("off_foil_layout_id", "pause_layout_id"):
            v = st.get(key)
            if isinstance(v, int) and v:
                used.add(v)
        for lid in used:
            root = origin.get(lid)
            if root:
                users.setdefault(root, set()).add(uid)

    unchanged: dict[int, int] = {}
    for lid, src, _els, _bg in rows:
        if src and src in body and body.get(lid) == body.get(src):
            unchanged[src] = unchanged.get(src, 0) + 1
    return users, unchanged


def _out(l: models.WatchLayout, author: str | None = None, copies: int | None = None,
         used_by: int | None = None, unchanged: int | None = None) -> dict:
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
    if used_by is not None:
        d["used_by"] = used_by
    if unchanged is not None:
        d["unchanged_copies"] = unchanged
    return d


def _drop_layout_refs(user: models.User, layout_id: int, *, drop_page: bool = True,
                      drop_off: bool = True, drop_pause: bool = True) -> None:
    """Verweise auf ein Layout aus den Einstellungen des Nutzers entfernen (Seitenliste und/oder
    Off-Foil-/Pausen-Wahl). Kein Commit — der Aufrufer committed."""
    if not user.settings_json:
        return
    try:
        st = json.loads(user.settings_json) or {}
    except ValueError:
        return
    touched = False
    if drop_page and isinstance(st.get("pages"), list):
        cleaned = [p for p in st["pages"]
                   if not (isinstance(p, (int, float)) and int(p) == layout_id)]
        if len(cleaned) != len(st["pages"]):
            st["pages"] = cleaned or None
            touched = True
    for key, do in (("off_foil_layout_id", drop_off), ("pause_layout_id", drop_pause)):
        if do and st.get(key) == layout_id:
            st[key] = None
            touched = True
    if touched:
        user.settings_json = json.dumps(st)


def _enforce_paused_hint(els: list[list], category: str) -> list[list]:
    """In PAUSEN-Layouts steckt der „Pausiert"-Hinweis (Typ 7) fest drin: **verschiebbar, aber nicht
    entfernbar** (Jan, 2026-07-27). Grund: ein eigenes Layout weiß nicht, dass die Aufnahme pausiert
    ist und wie man sie fortsetzt — ohne den Hinweis sitzt jemand in einer pausierten Aufnahme fest
    und hält es für einen Absturz. Hier serverseitig erzwungen, nicht nur in der PWA, sonst hebelt
    ein direkter API-Aufruf die Zusicherung aus.

    In den anderen Kategorien wird Typ 7 entfernt: „Pausiert" während der Fahrt wäre eine Lüge."""
    others = [e for e in els if e and e[0] != 7]
    if category != "pause":
        return others
    hints = [e for e in els if e and e[0] == 7]
    if not hints:
        # Standardposition oben mittig — dort liegt in den Vorlagen sonst nur der REC-Punkt, und
        # die Mitte bleibt für Werte frei.
        hints = [[7, 500, 150, 1, 0, 0]]
    return others + hints[:1]


def _apply(l: models.WatchLayout, body: LayoutIn) -> None:
    name = (body.name or "").strip()[:60]
    l.name = name or "Layout"
    l.category = body.category if body.category in CATEGORIES else "on_foil"
    l.shape = body.shape if body.shape in SHAPES else "round"
    l.bg_color = _clamp(body.bg_color, 0, MAX_COLOR)
    l.elements = json.dumps(_enforce_paused_hint(_clean_elements(body.elements), l.category),
                            ensure_ascii=False)
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
    limit: int = Query(60, ge=1, le=200), sort: str = Query("used"),
    user: models.User = Depends(current_user), db: Session = Depends(get_db),
) -> list[dict]:
    """Veröffentlichte Layouts anderer (+ eigene). Größe/Form filtern ist ein **Komfort-Filter**,
    keine Schranke: kopieren darf man jedes Layout (Koordinaten sind relativ).

    `sort=used` (Standard) rankt nach **tatsächlicher Nutzung** (verschiedene Nutzer, die das
    Layout oder eine Kopie eingebunden haben, s. `_usage_stats`) — damit steht oben, was sich in
    der Praxis bewährt hat, ohne dass jemand Ränge pflegen muss. `sort=new` = neueste zuerst."""
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
    rows = q.order_by(models.WatchLayout.updated_at.desc()).all()
    used, unchanged = _usage_stats(db)
    # „von ANDEREN Nutzern genutzt" — den Autor rausrechnen, sonst rankt sich jeder selbst hoch.
    out = [_out(l, author=name or "?", copies=copy_count.get(l.id, 0),
                used_by=len(used.get(l.id, set()) - {l.user_id}),
                unchanged=unchanged.get(l.id, 0))
           for l, name in rows]
    if sort != "new":
        # Nutzung zuerst, dann Kopien, dann neu — die Reihenfolge aus `rows` (updated_at desc) ist
        # der stabile Gleichstand-Entscheid.
        out.sort(key=lambda d: (d["used_by"], d["copies"]), reverse=True)
    return out[:limit]


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
    was = l.category
    _apply(l, body)
    # Kategorie umgestellt? Dann passen bestehende Verweise nicht mehr: ein Layout, das jetzt
    # „pause" ist, darf keine On-Foil-Seite mehr sein (und umgekehrt). Sonst zeigte die
    # Seitenliste auf ein Layout der falschen Sorte, bis der Nutzer zufällig neu speichert.
    if was != l.category:
        _drop_layout_refs(user, layout_id,
                          drop_page=(l.category != "on_foil"),
                          drop_off=(l.category != "off_foil"),
                          drop_pause=(l.category != "pause"))
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
    _drop_layout_refs(user, layout_id)
    db.delete(l)
    db.commit()
