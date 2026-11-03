"""Erster Lauf-Start und letztes Lauf-Ende je Session als echte Zeitpunkte (03.11.2026).

Early Bird / Nachteule (api/community.py `_time_rows`) brauchen genau diese zwei Zeitpunkte. Bisher dekodierte jede
Rekord-Abfrage dafuer `segments_json` ALLER Community-Sessions — linear wachsend mit dem Bestand. Jetzt schreibt
`run_analysis` sie in `analysis_results.lauf_start_at`/`lauf_ende_at` (UTC); die Ortszeit rechnet die Abfrage,
weil der Ort einer neuen Session erst NACH der Analyse feststeht (`_geocode_place` im Hintergrund).

Segment-Zeiten sind auf den Trim-Beginn re-based (docs/DATA-PIPELINE.md) -> `trim_start_ms` dazurechnen.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta


def zeitpunkte(started_at: datetime | None, trim_start_ms: float | None, segs: list | None):
    """(erster Lauf-Start, letztes Lauf-Ende) oder (None, None) ohne Laeufe."""
    if started_at is None or not segs:
        return None, None
    off = float(trim_start_ms or 0)
    erst = min(float(x.get("t_start_ms") or 0) for x in segs)
    letzt = max(float(x.get("t_end_ms") or 0) for x in segs)
    return started_at + timedelta(milliseconds=off + erst), started_at + timedelta(milliseconds=off + letzt)


def setzen(session, result) -> bool:
    """Spalten aus den gespeicherten Laeufen setzen. True, wenn sich etwas geaendert hat."""
    try:
        segs = json.loads(result.segments_json or "[]")
    except (ValueError, TypeError):
        segs = []
    a, e = zeitpunkte(session.started_at, session.trim_start_ms, segs)
    if (result.lauf_start_at, result.lauf_ende_at) == (a, e):
        return False
    result.lauf_start_at, result.lauf_ende_at = a, e
    return True
