"""Was der Fahrer an einer Session VON HAND eingestellt hat — und dass es beim Verknuepfen nie verloren geht (13.11.2026).

Jan: „manuelle eintraege des fahrers immer uebernommen werden, egal in welcher richtung zusammengefuehrt wird".
Anlass: Garmin Connect und unsere App liefern dieselbe Fahrt; eine der beiden Sessions ist zuerst sichtbar, der Fahrer
ordnet sie ein oder stellt Foil/Stab/Board ein, dann kommt die zweite und eine geht in der anderen auf. Bis heute
gewann dabei der Stand der Uhr — auch ueber eine spaetere Korrektur von Hand. `sport_source = "owner"` taugt nicht als
Merkmal: es steht auch fuer die Wahl auf der Uhr und die „zaehlt als"-Zuordnung beim Import.

`sessions.manuell_json` = {gruppe: ISO-Zeit der letzten Aenderung von Hand}. Gesetzt in den Endpunkten, mit denen
Besitzer oder Admin etwas einstellen (Einordnung, Ausruestung, Lage, Zuschnitt, aussortierte und zurueckgeholte Laeufe).
Beim Verknuepfen (`uebernehmen`) gewinnt je Gruppe die juengere Aenderung von Hand; was nie von Hand gesetzt wurde,
verdraengt nichts. Zeitfenster (ms ab Session-Start) werden um den Startversatz der beiden Aufnahmen verschoben.
Kommentare, Likes, Fotos, Videos, Bewertungen und Bildunterschrift wandern ohnehin (garmin.nutzerinhalte_uebertragen).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

# Gruppe -> Spalten, die zusammen gehoeren (eine Einordnung setzt Sportart, Datenqualitaet und Quelle in einem Zug).
GRUPPEN: dict[str, tuple[str, ...]] = {
    "sportart": ("sport_class", "data_quality", "sport_source", "needs_classification", "appeal_text", "appeal_at",
                 "pumpfoil_override"),
    "foil_id": ("foil_id",),
    "stab_id": ("stab_id",),
    "board_id": ("board_id",),
    "mast_len_cm": ("mast_len_cm",),
    "shim_deg": ("shim_deg",),
    "rider_weight_kg": ("rider_weight_kg",),
    "placement": ("placement", "placement_quelle"),
    "ort_sichtbarkeit": ("ort_sichtbarkeit",),
    "attitude_rot_deg": ("attitude_rot_deg",),
    "trim": ("trim_start_ms", "trim_end_ms", "trim_auto"),
    "excluded_ranges": ("excluded_ranges",),
    "fremdkraft_keep": ("fremdkraft_keep",),
}
# Diese Gruppen tragen Zeiten in ms ab Session-Start -> beim Uebertragen um den Startversatz verschieben.
ZEITGRUPPEN = {"trim", "excluded_ranges", "fremdkraft_keep"}


def lesen(s) -> dict[str, str]:
    try:
        d = json.loads(getattr(s, "manuell_json", None) or "{}")
        return d if isinstance(d, dict) else {}
    except (ValueError, TypeError):
        return {}


def merken(s, *gruppen: str) -> None:
    """Die Gruppen als „eben von Hand gesetzt" markieren (vor dem commit des Endpunkts aufrufen)."""
    d = lesen(s)
    jetzt = datetime.now(timezone.utc).isoformat()
    for g in gruppen:
        if g in GRUPPEN:
            d[g] = jetzt
    s.manuell_json = json.dumps(d, sort_keys=True) if d else None


def gruppe_von(feld: str) -> str | None:
    for g, felder in GRUPPEN.items():
        if feld in felder:
            return g
    return None


def _versatz_ms(von, nach) -> int:
    if von.started_at is None or nach.started_at is None:
        return 0
    return int(round((von.started_at - nach.started_at).total_seconds() * 1000))


def _fenster_verschieben(text: str | None, d: int) -> str | None:
    if not text or not d:
        return text
    try:
        wins = json.loads(text)
        return json.dumps([[max(0, int(a) + d), max(0, int(b) + d)] for a, b in wins])
    except (ValueError, TypeError):
        return text


def _wert(von, nach, gruppe: str, feld: str):
    v = getattr(von, feld, None)
    if gruppe not in ZEITGRUPPEN:
        return v
    d = _versatz_ms(von, nach)
    if feld in ("trim_start_ms", "trim_end_ms"):
        return None if v is None else max(0, int(v) + d)
    if feld in ("excluded_ranges", "fremdkraft_keep"):
        return _fenster_verschieben(v, d)
    return v


def neuer(von, nach, gruppe: str) -> bool:
    """Hat `von` diese Gruppe von Hand gesetzt, und juenger als `nach` (oder `nach` gar nicht)?"""
    a, b = lesen(von).get(gruppe), lesen(nach).get(gruppe)
    return bool(a) and (not b or a > b)


def uebernehmen(von, nach) -> list[str]:
    """Alles, was an `von` von Hand gesetzt wurde und an `nach` nicht juenger von Hand steht, nach `nach` kopieren.
    Gibt die uebernommenen Gruppen zurueck. Kein commit."""
    mv, mn = lesen(von), lesen(nach)
    uebernommen = []
    for g, felder in GRUPPEN.items():
        if not neuer(von, nach, g):
            continue
        for f in felder:
            if hasattr(nach, f):
                setattr(nach, f, _wert(von, nach, g, f))
        mn[g] = mv[g]
        uebernommen.append(g)
    if uebernommen:
        nach.manuell_json = json.dumps(mn, sort_keys=True)
    return uebernommen
