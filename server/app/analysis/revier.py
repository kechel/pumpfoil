"""Liegt ein Lauf dort, wo andere schon gepumpt haben? — Gegenbeweis zur Fremdkraft-Regel ohne Accel.

Jan, 11.11.2026 (Session #934, ein Fahrer mit sehr effizientem Foil am Kanal): zwei lange Laeufe mit 12,7 und 14,3 km/h
wurden als „Fremdkraft" aussortiert, weil der Puls kaum stieg — die Grundlinie lag nach dem Rueckweg zu Fuss schon hoch.
„na wir haben zumindest eine heatmap zum vergleichen um auto auszuschliessen oder?"

Die Heatmap (app/heatmap.py) enthaelt nur GEZAEHLTE Laeufe. Liegt ein Lauf ueberwiegend auf Zellen, in denen andere
Sessions Pumpfoil-Laeufe haben, faehrt dort kein Auto auf einer Strasse. Gemessen am 11.11.2026 (z19, ~50 m): die
bestaetigten Autofahrten aus data/ground-truth/runs.json liegen zu 0-1 % auf solchen Zellen, die beiden Stuecke aus #934
zu 92 und 100 %. Umgekehrt beweist FEHLENDE Abdeckung nichts (ein echter Pumpfoil-Lauf an einem Spot, wo sonst niemand
faehrt, liegt bei 0 %) — der Gegenbeweis wirkt deshalb nur in eine Richtung.

Nur Pumpfoil-Sessions zaehlen als Revier: die Heatmap enthaelt auch Wing/Kite, und auf dem Wasser kann Fremdkraft
Schlepp/Motor/Wind sein. Dazu kommt in der Regel das Pumpfoil-Tempo (detect_v2).
"""
from __future__ import annotations

import numpy as np

Z = 19                 # Stufe der Webkarten-Kacheln (~50 m in Mitteleuropa)
_STAND: dict = {"mtime": None, "zaehler": None, "je_session": None}


def _laden():
    from .. import heatmap as H
    try:
        mt = H.ZELLEN_DATEI.stat().st_mtime
    except OSError:
        return None, None
    if _STAND["mtime"] != mt:
        cache = H._zellen_cache()
        d = H.Z_MAX - Z
        zaehler: dict[int, int] = {}
        je_session: dict = {}
        for sid, e in cache.items():
            if not len(e[1]) or e[4] != "pumpfoil":
                continue
            ix, iy = H._entpacken(e[1])
            zellen = set(H._packen(ix >> d, iy >> d).tolist())
            je_session[sid] = zellen
            for k in zellen:
                zaehler[k] = zaehler.get(k, 0) + 1
        _STAND.update(mtime=mt, zaehler=zaehler, je_session=je_session)
    return _STAND["zaehler"], _STAND["je_session"]


def anteil_auf_revier(lat: np.ndarray, lon: np.ndarray, session_id: int | None) -> float | None:
    """Anteil der Punkte (0..1), die auf Pumpfoil-Zellen ANDERER Sessions liegen. None ohne Heatmap."""
    if lat.size == 0:
        return None
    zaehler, je_session = _laden()
    if not zaehler:
        return None
    from .. import heatmap as H
    eigen = je_session.get(session_id, set()) if session_id is not None else set()
    ix, iy = H.kachel(lon, lat, Z)
    kk = H._packen(ix, iy).tolist()
    return float(np.mean([zaehler.get(k, 0) - (1 if k in eigen else 0) > 0 for k in kk]))
