"""Die EINE Liste der Sportarten (data/sportarten.json) — Server, Web, Apps und Uhren lesen daraus.

Jan, 25.10.2026: „eigentlich sollte das eine einzige zentrale liste sein der sportarten fuer alle apps/uhren/web …
mit flags welche detections / analysen / regeln gelten". Bis dahin stand die Liste an rund zehn Stellen doppelt
(sessions.SPORTS, sportprofil, gps.SPORT_GRENZEN, autofahrt, sportrekorde, Uhren-Namen, Web, Android, iOS), und ein Test
hielt sie nur gleich. Jetzt leiten sich diese Stellen hiervon ab; GET /api/app/sports liefert die Liste an die Clients.

Reines Modul (nur json), damit es aus der Analyse ohne Kreis-Import geladen werden kann.
"""
from __future__ import annotations

import json
from pathlib import Path

_DATEI = Path(__file__).parent / "data" / "sportarten.json"
_DOC = json.loads(_DATEI.read_text(encoding="utf-8"))

EINTRAEGE: list[dict] = _DOC["sportarten"]
JE_ID: dict[str, dict] = {e["id"]: e for e in EINTRAEGE}

# Zuordenbare Werte in Anzeige-Reihenfolge (`other` letzter) und stillgelegte (nicht mehr zuordenbar, Altbestand sichtbar).
SPORTS: tuple[str, ...] = tuple(e["id"] for e in EINTRAEGE)
SPORTS_LEGACY: tuple[str, ...] = tuple(e["id"] for e in _DOC.get("stillgelegt", []))

# Gruppe je Sportart (pump|wind|welle|motor); Sportarten ohne Gruppe (other) fehlen hier und gelten als pump.
GRUPPE: dict[str, str] = {e["id"]: e["gruppe"] for e in EINTRAEGE if e.get("gruppe")}

STANDARD_PROFIL: dict = _DOC["standard_profil"]
GRUPPEN_PROFIL: dict[str, dict] = _DOC.get("gruppen_profil", {})
SPORT_PROFIL: dict[str, dict] = {e["id"]: e["profil"] for e in EINTRAEGE if e.get("profil")}

# (Bandgrenze m/s, Lauf-Spitze km/h) fuer Sportarten mit eigenen Grenzen; alle anderen nehmen die Pumpfoil-Werte.
GRENZEN: dict[str, tuple[float, float]] = {
    e["id"]: (float(e["grenzen"]["band_kmh"]) / 3.6, float(e["grenzen"]["lauf_max_kmh"]))
    for e in EINTRAEGE if e.get("grenzen")}

# Autofahrt-Erkennung: eigene Spitze je Sportart, Standard, und die Sportarten ganz ohne (autofahrt_kmh: null).
AUTOFAHRT_STANDARD_KMH: float = float(_DOC.get("autofahrt_standard_kmh", 55.0))
AUTOFAHRT_KMH: dict[str, float] = {e["id"]: float(e["autofahrt_kmh"]) for e in EINTRAEGE
                                   if e.get("autofahrt_kmh") is not None}
OHNE_AUTOFAHRT: set[str] = {e["id"] for e in EINTRAEGE if "autofahrt_kmh" in e and e["autofahrt_kmh"] is None}

# Name auf der Uhr (englisch, kurz); wer keinen hat, ist auf der Uhr nicht waehlbar.
UHR_NAMEN: dict[str, str] = {e["id"]: e["uhr"] for e in EINTRAEGE if e.get("uhr")}

# Rekord-Satz je Sportart (Name -> Metriken in sportrekorde.py).
REKORDE: dict[str, str] = {e["id"]: e["rekorde"] for e in EINTRAEGE if e.get("rekorde")}

# Gibt es bei der Sportart On-Foil-Fahren? (False: keine Foil-Begriffe, kein Foil-Anteil, keine Foil-Ausruestung)
FOIL: dict[str, bool] = {e["id"]: bool(e.get("foil", True)) for e in EINTRAEGE}


def name(sport_id: str, lang: str = "en") -> str:
    e = JE_ID.get(sport_id) or next((x for x in _DOC.get("stillgelegt", []) if x["id"] == sport_id), None)
    if not e:
        return sport_id
    n = e.get("namen") or {}
    return n.get(lang) or n.get("en") or sport_id


def fuer_clients() -> dict:
    """Die Liste fuer Web, Apps und Uhren (GET /api/app/sports): je Sportart Gruppe, Kennzeichen, fertiges Anzeige-Profil
    und Namen in allen Sprachen. `version` aendert sich mit dem Inhalt (Cache-Schluessel der Clients)."""
    from .sportprofil import profil
    sp = [{"id": e["id"], "gruppe": e.get("gruppe") or "pump", "foil": FOIL[e["id"]], "uhr": e.get("uhr"),
           "rekorde": e.get("rekorde"), "profil": profil(e["id"]), "namen": e.get("namen") or {}} for e in EINTRAEGE]
    alt = [{"id": e["id"], "namen": e.get("namen") or {}} for e in _DOC.get("stillgelegt", [])]
    import hashlib
    version = hashlib.sha1(_DATEI.read_bytes()).hexdigest()[:12]
    return {"version": version, "sportarten": sp, "stillgelegt": alt}
