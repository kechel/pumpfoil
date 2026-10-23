"""Anzeige-Schalter fuer die Pump-/Gleit-Erkennung pg-1 (Weg B, Jan 23.10.2026).

Gespeichert wird pg-1 ZUSAETZLICH (analysis_results.pg_* und je Lauf `pg_*` in segments_json, s.
analysis/pumpgleit.stufe); die alten Werte bleiben unangetastet. Ob die Ausgaben die neuen oder die alten
Zahlen zeigen, entscheidet allein dieser Schalter: env `PUMPGLEIT_ANZEIGE` (server/.env), Standard AUS.

Ist er an, liefern alle Lesestellen die pg-Werte an Stelle der alten — wo pg fehlt (Session oder Lauf nicht
zustaendig: andere Sportart, ohne Accel, am Brett, noch nicht nachgetragen), die alten. Ein Schalter fuer
alles, damit Detail, Liste, Rekorde, Statistik, Sharecard und MCP nie verschiedene Zahlen zeigen.
"""
from __future__ import annotations

import os

from sqlalchemy import func

AN = (os.environ.get("PUMPGLEIT_ANZEIGE") or "").strip().lower() in ("1", "true", "an", "on", "ja", "yes")

# Lauf-Felder, die pg-1 ersetzt (Schluessel im Lauf: "pg_" + Name).
SEG_FELDER = ("pumps", "pump_idx", "avg_pump_hz", "pumps_per_min", "dist_per_pump_m", "t_to_first_pump_s",
              "glides", "num_glides", "avg_glide_s", "longest_glide_s")


def an() -> bool:
    return AN


def etag_teil() -> str:
    """Zusatz fuers ETag: wechselt der Schalter, sind alle zwischengespeicherten Antworten veraltet."""
    return "-pgA" if AN else ""


def seg(g: dict) -> dict:
    """Ein Lauf fuer die Ausgabe: mit Schalter an und vorhandenem pg-Ergebnis die pg-Werte."""
    if not AN or not isinstance(g, dict) or g.get("pg_pumps") is None:
        return g
    out = dict(g)
    for k in SEG_FELDER:
        if "pg_" + k in g:
            out[k] = g["pg_" + k]
    return out


def segs(gs):
    return [seg(g) for g in gs] if AN and gs else gs


def _pg_da(ar) -> bool:
    return AN and ar is not None and getattr(ar, "pg_version", None) is not None


def pump_count(ar):
    return ar.pg_pump_count if _pg_da(ar) else (ar.pump_count if ar is not None else None)


def avg_cadence_hz(ar):
    return ar.pg_avg_cadence_hz if _pg_da(ar) else (ar.avg_cadence_hz if ar is not None else None)


def best_glide_s(ar):
    return ar.pg_best_glide_s if _pg_da(ar) else (ar.best_glide_s if ar is not None else None)


def best_glide_idx(ar):
    return ar.pg_best_glide_idx if _pg_da(ar) else (ar.best_glide_idx if ar is not None else None)


# ---- SQL-Ausdruecke (Rekorde, Summen, Statistik) ------------------------------------------------------

def _AR():
    from .models import AnalysisResult
    return AnalysisResult


def col_pump_count():
    A = _AR()
    return func.coalesce(A.pg_pump_count, A.pump_count) if AN else A.pump_count


def col_avg_cadence_hz():
    A = _AR()
    return func.coalesce(A.pg_avg_cadence_hz, A.avg_cadence_hz) if AN else A.avg_cadence_hz


def col_best_glide_s():
    A = _AR()
    return func.coalesce(A.pg_best_glide_s, A.best_glide_s) if AN else A.best_glide_s


def col_best_glide_idx():
    A = _AR()
    # Index nur aus derselben Quelle wie der Wert: pg, wo pg_best_glide_s gesetzt ist
    from sqlalchemy import case
    return case((A.pg_best_glide_s.isnot(None), A.pg_best_glide_idx), else_=A.best_glide_idx) if AN else A.best_glide_idx
