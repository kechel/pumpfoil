"""Standard-Datenseiten aus der Community (Jan, 09.10.2026).

Wer nie eigene Seiten eingestellt hat (in `settings_json` fehlen die Schluessel des jeweiligen
Zustands), bekommt statt der alten klassischen 3-Feld-Seiten die meistkopierten veroeffentlichten
Community-Layouts. Ausgewertet am 09.10.2026 (105 Layouts, 828 Nutzer, davon 705 ohne eigene Seiten):

    on_foil   While riding (10 Kopien), BPM + Speed (8), All in (3)
    off_foil  After a run (33 Kopien, 7 Nutzer), All in betwene (2)
    pause     Between runs (6)

Die Layouts liegen als FESTE Kopie in `data/standard_layouts.json` — ein Verweis auf das Original
haette den Standard fuer alle geaendert, sobald der Autor sein Layout bearbeitet oder loescht.
Uhr und Editor kennen sie unter einer NEGATIVEN ID (`-quelle_id`). Erst wenn jemand einen Satz
aendert und speichert, entstehen eigene Kopien (`settings._own_layout_id`). Autor nur als
Nutzer-ID im Repo; den Anzeigenamen liest der Editor zur Laufzeit.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

KATEGORIEN = ("on_foil", "off_foil", "pause")
# Schluessel in settings_json, an denen man erkennt, dass jemand den Zustand SELBST eingestellt hat
EIGENE_SCHLUESSEL = {
    "on_foil": ("pages", "views"),
    "off_foil": ("off_foil_pages", "off_foil_layout_id", "off_foil_view"),
    "pause": ("pause_pages", "pause_layout_id", "pause_view"),
}


@lru_cache(maxsize=1)
def _daten() -> dict:
    return json.loads((Path(__file__).parent / "data" / "standard_layouts.json").read_text())


def liste(kategorie: str) -> list[dict]:
    return list(_daten().get(kategorie) or [])


def ids(kategorie: str) -> list[int]:
    """Die Standard-Seiten eines Zustands als (negative) Seiten-IDs."""
    return [-int(l["quelle_id"]) for l in liste(kategorie)]


def nach_id(lid: int) -> dict | None:
    """Standard-Layout zu einer negativen ID (oder None)."""
    if not isinstance(lid, (int, float)) or lid >= 0:
        return None
    for k in KATEGORIEN:
        for l in liste(k):
            if -int(l["quelle_id"]) == int(lid):
                return {**l, "category": k}
    return None


def payload(l: dict) -> list:
    """Uhr-Form wie devices._layout_payload: [1, bg, [elemente]]."""
    return [1, int(l.get("bg_color") or 0), l.get("elements") or []]


def als_layouts(db, kategorie: str | None = None) -> list[dict]:
    """Die Standard-Layouts in der Form von `GET /api/layouts` (layouts._out), mit negativer ID,
    `standard: True` und dem Anzeigenamen des Autors. So zeigen Web UND die nativen Apps (die nur
    diese Liste kennen) die Standard-Seiten im Editor an, ohne App-Update."""
    from . import models
    alle = [(k, l) for k in KATEGORIEN for l in liste(k) if kategorie in (None, k)]
    namen = {u.id: u.display_name for u in db.query(models.User).filter(
        models.User.id.in_({l["autor_id"] for _, l in alle})).all()} if alle else {}
    return [{
        "id": -int(l["quelle_id"]), "name": l["name"], "category": k, "shape": l.get("shape") or "round",
        "bg_color": int(l.get("bg_color") or 0), "elements": l.get("elements") or [], "published": False,
        "copied_from_id": None, "authored_w": l.get("authored_w"), "authored_h": l.get("authored_h"),
        "authored_shape": l.get("authored_shape"), "has_freetext": False, "updated_at": None,
        "author": namen.get(l["autor_id"]) or "?", "standard": True,
    } for k, l in alle]


def ist_standard(gespeichert: dict, kategorie: str) -> bool:
    """Hat der Nutzer diesen Zustand nie selbst eingestellt?"""
    return not any(k in (gespeichert or {}) for k in EIGENE_SCHLUESSEL[kategorie])
