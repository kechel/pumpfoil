"""Vorschau der Brett-Regeln in der normalen Session-Antwort — NUR LESEND (Admin, `?brett=neu`).

Jan, 10.10.2026: vor dem Umschalten wollte er die Regeln an echten Sessions sehen, in der
Vergleichsansicht wie zwei normale Sessions (alt gegen neu). Seit die Regeln live sind
(analysis/brett_anwenden.py), tut das nur noch etwas fuer Sessions, deren gespeicherte Analyse die
Regeln noch nicht traegt (`metrics.brett_regel` fehlt) — sonst wuerde ein schon gekuerzter Lauf ein
zweites Mal gekuerzt.
"""
from __future__ import annotations

from .. import models


def ueberlagern(db, s: models.Session, out) -> bool:
    """`out` (SessionOut mit Analyse) nach den Brett-Regeln umschreiben. False = nichts gemacht."""
    from ..analysis.brett_anwenden import anwenden
    from ..analysis.brett_regeln import REGEL_VERSION
    a = out.analysis
    if a is None or not a.segments or s.placement != "board" or (a.metrics or {}).get("brett_regel"):
        return False
    coords = (a.track_geojson or {}).get("geometry", {}).get("coordinates") or []
    erg = anwenden(db, s, a.segments, len(coords))
    if erg is None:
        return False
    a.segments = erg["segments"]
    a.foiling_time_s = erg["foiling_time_s"]
    a.pump_count = erg["pump_count"]
    a.avg_cadence_hz = erg["avg_cadence_hz"]
    if a.metrics is not None:
        a.metrics = {**a.metrics, "avg_pump_hz": erg["avg_cadence_hz"], "brett_regel": REGEL_VERSION,
                     "gleit_s": erg["gleit_s"]}
    return True
