"""Erkennung v3 als VETO (Stand 29.09.2026, NICHT live).

Warum ein Veto und keine eigene Maske: Stufe A als Maske fand 7668 zusaetzliche kurze „Laeufe"
(Median 6 s), die die unabhaengige foil_status-Wahrheit nur zu 37 % bestaetigt — die von v2 und v3
gemeinsam gefundenen dagegen zu 98 %. Stark ist Stufe A beim AUSSORTIEREN (Strasse, Parkplatz,
Autofahrt). Also: v2 findet die Laeufe wie bisher (Grenzen, Pumps, Statistik bleiben), Stufe A
verwirft nur Laeufe, in denen sie im Mittel unter SCHWELLE liegt. Abgestimmt auf einem eigenen Satz
(scripts/v3/abstimmen.py), vermessen im Schattenlauf mit herausgehaltenen Fahrern.
"""
from __future__ import annotations

import numpy as np

from . import stufe_a

SCHWELLE = 0.4
GLAETTEN_S = 5


def pruefen(tb, segmente: list, fahrer: int | None = None, schwelle: float = SCHWELLE):
    """-> (behalten, verworfen). Segmente in Session-ms (`t_start_session_ms` oder `t_start_ms`).
    Ohne Beschleunigung gibt es kein Urteil: alles bleibt."""
    p = stufe_a.wahrscheinlichkeit(tb, fahrer=fahrer)
    if p is None or not segmente:
        return list(segmente), []
    p = stufe_a.glaetten(p, GLAETTEN_S)
    t = tb.t_gps_ms.astype(float)
    behalten, weg = [], []
    for s in segmente:
        a = float(s.get("t_start_session_ms", s["t_start_ms"]))
        b = float(s.get("t_end_session_ms", s["t_end_ms"]))
        m = (t >= a) & (t <= b)
        pm = float(p[m].mean()) if m.any() else 1.0
        s = dict(s)
        s["v3_p"] = round(pm, 3)
        (behalten if pm >= schwelle else weg).append(s)
    return behalten, weg
