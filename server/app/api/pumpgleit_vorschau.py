"""Vorschau der Pump-/Gleit-Erkennung pg-1 in der normalen Session-Antwort — NUR LESEND (Admin, `?pumpgleit=1`).

Jan, 23.10.2026: „Vorschau bauen, damit ich Sessions vorher/nachher sehe" (Grundlage fuer Nerd-Artikel Teil 6).
Gleiches Muster wie `?brett=neu` (brett_vorschau.py): die gespeicherte Analyse wird in der Antwort ueberlagert,
nichts wird gespeichert, `run_analysis` bleibt unberuehrt. Laufgrenzen bleiben, ersetzt werden nur Pumps
(`pumps`, `pump_idx`, Kadenz-Felder), Gleitphasen (`glides`, `num_glides`, `avg_glide_s`, `longest_glide_s`),
`pump_count` und `metrics.pumpgleit` = {version, hinschauen, best_glide_s, gleit_s}. Die vorherigen Werte stehen
je Lauf in `*_vorher`. Rechnung: analysis/pumpgleit (docs/PUMP-GLEIT.md).
"""
from __future__ import annotations

from .. import models


def ueberlagern(db, s: models.Session, out) -> bool:
    """`out.analysis` mit pg-1 ueberlagern. False = keine Aussage (Sportart, Brett, ohne Accel, alte Segmente)."""
    from ..analysis import pumpgleit as PG
    a = out.analysis
    if a is None or not a.segments or not PG.zustaendig(s, s.result):
        return False
    coords = (a.track_geojson or {}).get("geometry", {}).get("coordinates") or []
    erg = PG.segmente_ueberlagern(s, a.segments, len(coords))
    if erg is None:
        return False
    a.segments = erg["segments"]
    a.pump_count = erg["pump_count"]
    ft = a.foiling_time_s or 0.0
    a.avg_cadence_hz = round(erg["pump_count"] / ft, 3) if ft > 0 else None
    a.metrics = {**(a.metrics or {}), "avg_pump_hz": a.avg_cadence_hz,
                 "pumpgleit": {"version": PG.version(s), "hinschauen": erg["hinschauen"],
                               "best_glide_s": erg["best_glide_s"], "best_glide_idx": erg["best_glide_idx"],
                               "gleit_s": erg["gleit_s"]}}
    return True
