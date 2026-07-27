"""Nutzer-Einstellungen (frei als JSON), z. B. Farbskala-Grenzen."""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db
from .deps import current_user

router = APIRouter(prefix="/api/settings", tags=["settings"])

# Gültige Datenfeld-IDs (gemeinsamer Katalog mit Web + Uhr). 0 = leer/aus.
VALID_FIELD_IDS = set(range(0, 21))  # 0-13 Live-Felder, 14-20 Lauf-Felder
# Default: eine Ansicht mit Speed(3s) + Puls.
DEFAULTS = {
    "speed_min": 8, "speed_max": 25, "speed_auto": True, "views": [[1, 2, 0]],
    "colorByValue": False,
    # Auto-Start der Aufnahme, sobald man losfährt (GPS-Geschwindigkeit). Default an.
    "auto_start": True,
    # Aufzeichnungsmodus: full | lite | gps (für speicherarme Uhren).
    "record_mode": "full",
    # Aktivitätstyp der Garmin-FIT-Session (Garmin-Connect-Kategorie): surfing | openwater.
    "activity_type": "surfing",
    # Vibrationsalarm bei Speed-Schwellen (km/h, 0 = aus).
    "alarm_enabled": False,
    "speed_high": 0, "speed_low": 0,
    "alarm_pattern_high": "short2", "alarm_pattern_low": "long2",
    "alarm_repeat": "once",  # "once" = einmalig beim Überschreiten | "continuous" = dauerhaft
    "alarm_default": "foil",  # Uhr-Vorwahl bei aktivem Alarm: "foil" = Standard-Foil | "fixed" = feste Werte
    # Push-Benachrichtigungen je Typ (Default: alle an). Erweiterbar.
    "notify_prefs": {"like": True, "analyzed": True, "record": True},
    # Start-Erfolgsquote: ein erkannter Lauf UNTER dieser Distanz zählt als (misslungener)
    # Startversuch, darüber als erfolgreich. Subjektiv -> pro Nutzer einstellbar.
    "start_threshold_m": 20,
    # Off-Foil-Screen (kurz nach Lauf-Ende): Uhrzeit + letzter-Lauf-Distanz + -Dauer.
    "off_foil_view": [12, 17, 16],
    # Pausen-Ansicht (Dümpeln ZWISCHEN den Läufen, nach dem Off-Foil-Screen):
    # Uhrzeit + Läufe-Anzahl + Puls. War auf allen Uhren hartcodiert -> jetzt konfigurierbar.
    "pause_view": [12, 20, 2],
    # Seitenreihenfolge der On-Foil-Ansichten, klassische 3-Feld-Seiten und eigene Layouts
    # FREI GEMISCHT (Jan): ein Eintrag ist entweder [a,b,c] (3 Feld-IDs) oder eine Zahl
    # (watch_layouts.id). `views` bleibt daneben als reine 3-Feld-Liste bestehen — alte Clients
    # (Uhr-Apps) lesen weiter nur die und sehen dadurch nie halbe Layouts.
    "pages": None,
    # Off-Foil-/Pausen-Screen alternativ als eigenes Layout statt 3 Datenfelder (null = Felder).
    # LEGACY: tragen ab F3 nur noch den ERSTEN Screen des jeweiligen Satzes — 1.0.66 im Store liest
    # genau einen Eintrag, eine Liste würde dort als Feld-ID gelesen und Müll zeichnen.
    "off_foil_layout_id": None,
    "pause_layout_id": None,
    # F3: beliebig viele Screens JE ZUSTAND, gemischt wie `pages` (3-Feld-Seite oder Layout-ID).
    # off_foil = Aufnahme läuft, aber kein Lauf (inkl. Dümpeln); pause = MANUELL pausiert.
    "off_foil_pages": None,
    "pause_pages": None,
    # Darf man in off_foil/pause auch die übrigen Seiten durchblättern? Default JA — sonst verliert
    # ein Nutzer, der nichts konfiguriert hat, Seiten, die er heute erreicht (Einwand Jan).
    # Aus = strenges Modell: je Zustand nur die zugehörigen Screens.
    "browse_all_pages": True,
    # Not-Aus für die dynamischen Layouts auf der Uhr (Stufe 3 des Sicherheitsnetzes, pro Nutzer).
    # Aus = die Uhr fährt die alte statische Logik, ohne App-Update.
    "layouts_enabled": True,
    # Eigene Foils (Foil.ids) + Standard-Foil (eine davon). foil_id je Session überschreibbar.
    "my_foils": [],
    "foil_id": None,
    # Restliches Setup — jede Komponente 1:1 wie Foils: „meine" markieren + einen Default,
    # je Session überschreibbar. KEIN kombiniertes Setup-Objekt (man wechselt real meist nur
    # Stab oder Shim). Stab = Katalog (stabs), Mast/Shim = reine Werte, Board = eigene Einträge
    # (Tabelle boards, deshalb hier nur der Default).
    "my_stabs": [],
    "stab_id": None,
    "my_masts": [],       # Mastlängen in cm, z. B. [75, 85]
    "mast_len_cm": None,
    "my_shims": [],       # Shim-Gradzahlen, z. B. [-1, 0, 0.5, 1, 2]
    "shim_deg": None,
    "board_id": None,
    # Homespot (Spot-Name). "" -> automatisch Spot der letzten Session.
    "homespot": "",
    # Körpergewicht (kg) — optional, für spätere Leistungsberechnung. 0 = nicht angegeben.
    "weight_kg": 0,
}

# Bekannte Push-Typen (Quelle der Wahrheit, auch im Frontend gespiegelt).
NOTIFY_TYPES = ("like", "analyzed", "record")

# Erlaubte Vibrationsmuster + Modi (IDs identisch mit Web + Uhr).
ALARM_PATTERNS = {"short1", "short2", "long2", "lsl"}
ALARM_REPEATS = {"once", "continuous"}
ALARM_DEFAULTS = {"foil", "fixed"}


def _merged(user: models.User) -> dict:
    stored = json.loads(user.settings_json) if user.settings_json else {}
    return {**DEFAULTS, **stored}


def _clean_views(views) -> list | None:
    """Validiert views = Liste von Ansichten, je bis zu 3 Feld-IDs."""
    if not isinstance(views, list):
        return None
    out = []
    for v in views[:12]:  # max 12 Ansichten
        if not isinstance(v, list):
            continue
        fields = [int(x) for x in v[:3] if isinstance(x, (int, float)) and int(x) in VALID_FIELD_IDS]
        while len(fields) < 3:
            fields.append(0)
        if any(f != 0 for f in fields):
            out.append(fields)
    return out or [[1, 2, 0]]


def _clean_view3(v) -> list | None:
    """Validiert EINE Ansicht (Off-Foil / Pause): bis zu 3 gültige Feld-IDs, sonst None."""
    if not isinstance(v, list):
        return None
    out = [int(x) for x in v[:3]
           if isinstance(x, (int, float)) and int(x) in VALID_FIELD_IDS]
    return out or None


def _own_layout_id(db: Session, user: models.User, v, category: str) -> int | None:
    """Layout-ID nur akzeptieren, wenn sie dem Nutzer gehört UND die Kategorie passt."""
    if not isinstance(v, (int, float)):
        return None
    row = (db.query(models.WatchLayout)
           .filter_by(id=int(v), user_id=user.id, category=category).first())
    return row.id if row else None


def _clean_pages(db: Session, user: models.User, raw, category: str = "on_foil") -> list | None:
    """Seitenreihenfolge validieren: jeder Eintrag ist [a,b,c] (3-Feld-Seite) ODER eine
    Layout-ID (eigenes Layout der angegebenen Kategorie). Unbekanntes fliegt raus; leer -> None.

    Dieselbe Funktion für alle drei Zustände (on_foil | off_foil | pause) — F3, s.
    docs/setup-and-watch-layouts.md. Die Kategorie MUSS mitgeprüft werden, sonst könnte man ein
    Fahr-Layout als Pausen-Seite einhängen und die Uhr zeigt es im falschen Zustand."""
    if not isinstance(raw, list):
        return None
    out: list = []
    for item in raw[:12]:
        if isinstance(item, list):
            v = _clean_view3(item)
            if not v or not any(f != 0 for f in v):
                continue                      # „leere" Seite (nur 0) ist keine Seite
            while len(v) < 3:                 # Uhr liest immer 3 Slots -> auffüllen
                v.append(0)
            out.append(v)
        else:
            lid = _own_layout_id(db, user, item, category)
            if lid:
                out.append(lid)
    return out or None


def _visible_stab_ids(db: Session, user: models.User, ids: set[int | None]) -> set[int]:
    """Von diesen Stab-IDs die auswählbaren: globaler Katalog + eigene Einträge."""
    wanted = {int(i) for i in ids if i is not None}
    if not wanted:
        return set()
    from sqlalchemy import or_
    rows = db.query(models.Stab.id).filter(
        models.Stab.id.in_(wanted),
        or_(models.Stab.user_id.is_(None), models.Stab.user_id == user.id)).all()
    return {i for (i,) in rows}


@router.get("")
def get_settings(user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    m = _merged(user)
    # Nie konfiguriert -> Seitenreihenfolge = die klassischen 3-Feld-Ansichten (so wie heute).
    if not m.get("pages"):
        m["pages"] = [list(v) for v in (m.get("views") or [])]
    # Homespot ist namensbasiert (mit Apps geteilt); zusätzlich die spot_id für neue Clients.
    from ..spots import spot_id_by_name
    m["homespot_id"] = spot_id_by_name(db, m["homespot"]) if m.get("homespot") else None
    return m


@router.put("")
def update_settings(
    patch: dict,
    user: models.User = Depends(current_user),
    db: Session = Depends(get_db),
) -> dict:
    current = json.loads(user.settings_json) if user.settings_json else {}
    for k in ("speed_min", "speed_max"):
        if k in patch:
            try:
                current[k] = max(0, min(50, float(patch[k])))
            except (TypeError, ValueError):
                pass
    if "speed_auto" in patch:
        current["speed_auto"] = bool(patch["speed_auto"])
    if "colorByValue" in patch:
        current["colorByValue"] = bool(patch["colorByValue"])
    if "layouts_enabled" in patch:
        current["layouts_enabled"] = bool(patch["layouts_enabled"])
    if "auto_start" in patch:
        current["auto_start"] = bool(patch["auto_start"])
    if "record_mode" in patch and patch["record_mode"] in ("full", "lite", "gps"):
        current["record_mode"] = patch["record_mode"]
    if "activity_type" in patch and patch["activity_type"] in ("surfing", "openwater", "pumpfoil"):
        current["activity_type"] = patch["activity_type"]
    if "homespot" in patch:
        v = patch["homespot"]
        # id ODER Name akzeptieren -> kanonisch als Name speichern (mit Apps geteilt).
        if v in (None, ""):
            current["homespot"] = ""
        else:
            from ..spots import canon_spot_name
            current["homespot"] = str(canon_spot_name(db, v))[:120]
    if "weight_kg" in patch:
        try:
            current["weight_kg"] = max(0, min(300, round(float(patch["weight_kg"]))))
        except (TypeError, ValueError):
            pass
    if "my_foils" in patch and isinstance(patch["my_foils"], list):
        current["my_foils"] = sorted({int(x) for x in patch["my_foils"] if isinstance(x, (int, float))})
    if "foil_id" in patch:  # Standard-Foil (null = keins)
        v = patch["foil_id"]
        current["foil_id"] = int(v) if isinstance(v, (int, float)) else None
    # Default muss zu den eigenen Foils gehören; Default impliziert Mitgliedschaft.
    mf = set(current.get("my_foils") or [])
    if current.get("foil_id"):
        mf.add(int(current["foil_id"]))
        current["my_foils"] = sorted(mf)
    # --- Restliches Setup (Stab / Mast / Shim / Board), je 1:1 wie Foils ---
    if "my_stabs" in patch and isinstance(patch["my_stabs"], list):
        ids = {int(x) for x in patch["my_stabs"] if isinstance(x, (int, float))}
        current["my_stabs"] = sorted(_visible_stab_ids(db, user, ids))
    if "stab_id" in patch:
        v = patch["stab_id"]
        sid = int(v) if isinstance(v, (int, float)) else None
        # Nur Katalog oder EIGENER Eintrag (fremde private Bezeichnungen sind nicht wählbar).
        current["stab_id"] = sid if sid in _visible_stab_ids(db, user, {sid}) else None
    ms = set(current.get("my_stabs") or [])
    if current.get("stab_id"):   # Default impliziert Mitgliedschaft (wie beim Foil)
        ms.add(int(current["stab_id"]))
        current["my_stabs"] = sorted(ms)
    if "my_masts" in patch and isinstance(patch["my_masts"], list):
        current["my_masts"] = sorted({
            int(x) for x in patch["my_masts"]
            if isinstance(x, (int, float)) and 30 <= int(x) <= 130})
    if "mast_len_cm" in patch:
        v = patch["mast_len_cm"]
        current["mast_len_cm"] = (
            max(30, min(130, round(float(v)))) if isinstance(v, (int, float)) else None)
    mm = set(current.get("my_masts") or [])
    if current.get("mast_len_cm"):
        mm.add(int(current["mast_len_cm"]))
        current["my_masts"] = sorted(mm)
    if "my_shims" in patch and isinstance(patch["my_shims"], list):
        current["my_shims"] = sorted({
            round(float(x), 1) for x in patch["my_shims"]
            if isinstance(x, (int, float)) and -5 <= float(x) <= 5})
    if "shim_deg" in patch:
        v = patch["shim_deg"]
        current["shim_deg"] = (
            round(max(-5.0, min(5.0, float(v))), 1) if isinstance(v, (int, float)) else None)
    sh = set(current.get("my_shims") or [])
    if current.get("shim_deg") is not None:   # 0° ist ein gültiger Wert -> nicht auf Truthiness prüfen
        sh.add(round(float(current["shim_deg"]), 1))
        current["my_shims"] = sorted(sh)
    if "board_id" in patch:   # Eigentümer-Prüfung: nur eigene Boards
        v = patch["board_id"]
        bid = int(v) if isinstance(v, (int, float)) else None
        if bid is not None:
            own = db.query(models.Board).filter_by(id=bid, user_id=user.id).first()
            bid = bid if own else None
        current["board_id"] = bid
    if "views" in patch:
        cleaned = _clean_views(patch["views"])
        if cleaned:
            current["views"] = cleaned
    # Off-Foil-Screen (kurz nach Lauf-Ende) + Pausen-Ansicht (dazwischen): je eine View
    # aus bis zu 3 Feld-IDs.
    for key in ("off_foil_view", "pause_view"):
        if key in patch:
            v = _clean_view3(patch[key])
            if v:
                current[key] = v
    # Statt der 3 Felder kann dort auch ein eigenes Layout stehen (null = wieder Felder).
    # Die Feld-Variante bleibt gespeichert, damit das Zurückschalten nichts verliert.
    for key, cat in (("off_foil_layout_id", "off_foil"), ("pause_layout_id", "pause")):
        if key in patch:
            current[key] = _own_layout_id(db, user, patch[key], cat)
    # F3: Seiten-Sätze für off_foil und pause. Die Alt-Schlüssel werden mitgeführt (erster
    # Eintrag), damit im Store befindliche Uhren (1.0.66) unverändert weiterlaufen.
    for key, cat, legacy_view, legacy_layout in (
            ("off_foil_pages", "off_foil", "off_foil_view", "off_foil_layout_id"),
            ("pause_pages", "pause", "pause_view", "pause_layout_id")):
        if key not in patch:
            continue
        lst = _clean_pages(db, user, patch[key], cat)
        current[key] = lst
        if lst:
            first = lst[0]
            if isinstance(first, list):
                current[legacy_view] = first
                current[legacy_layout] = None
            else:
                current[legacy_layout] = first
    if "browse_all_pages" in patch:
        current["browse_all_pages"] = bool(patch["browse_all_pages"])
    # Freie Seitenreihenfolge (3-Feld-Seiten und Layouts gemischt). `views` wird daraus
    # abgeleitet, damit alte Uhr-Apps weiter eine gültige 3-Feld-Liste bekommen.
    if "pages" in patch:
        pages = _clean_pages(db, user, patch["pages"])
        current["pages"] = pages
        if pages:
            classic = [p for p in pages if isinstance(p, list)]
            if classic:
                current["views"] = classic
    # Vibrationsalarm
    if "alarm_enabled" in patch:
        current["alarm_enabled"] = bool(patch["alarm_enabled"])
    for k in ("speed_high", "speed_low"):
        if k in patch:
            try:
                current[k] = max(0, min(60, round(float(patch[k]))))
            except (TypeError, ValueError):
                pass
    for k in ("alarm_pattern_high", "alarm_pattern_low"):
        if k in patch and patch[k] in ALARM_PATTERNS:
            current[k] = patch[k]
    if patch.get("alarm_repeat") in ALARM_REPEATS:
        current["alarm_repeat"] = patch["alarm_repeat"]
    if patch.get("alarm_default") in ALARM_DEFAULTS:
        current["alarm_default"] = patch["alarm_default"]
    # Teilen-Card-Defaults (Track-Farbe + gewaehlte Stats) — Foto ist NICHT dabei.
    if isinstance(patch.get("share"), dict):
        sh = dict(current.get("share") or {})
        p = patch["share"]
        if p.get("color") in ("cyan", "speed", "hr"):
            sh["color"] = p["color"]
        if isinstance(p.get("stats"), list):
            sh["stats"] = [str(x) for x in p["stats"] if isinstance(x, str)][:8]
        if isinstance(p.get("dim"), (int, float)):
            sh["dim"] = max(0.0, min(0.9, float(p["dim"])))
        if isinstance(p.get("track"), bool):
            sh["track"] = p["track"]
        if p.get("shade") in ("light", "dark"):
            sh["shade"] = p["shade"]
        current["share"] = sh
    if "start_threshold_m" in patch:
        try:
            current["start_threshold_m"] = max(5, min(200, round(float(patch["start_threshold_m"]))))
        except (TypeError, ValueError):
            pass
    if isinstance(patch.get("notify_prefs"), dict):
        prefs = dict(current.get("notify_prefs") or {})
        for k, v in patch["notify_prefs"].items():
            if k in NOTIFY_TYPES:
                prefs[k] = bool(v)
        current["notify_prefs"] = prefs
    user.settings_json = json.dumps(current)
    db.commit()
    return {**DEFAULTS, **current}
