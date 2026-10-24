"""Gleit-Erkennung fuer Foil Scoot, Fassung pg-scoot-1 (Jan, 24.10.2026) — getrennt vom Gleit-Modell von pg-1.

Foil Scoot = Pump-Board mit Roller-Lenker, kein Motor. Die Uhr-Hand liegt am Lenker; beim Gleiten pumpt der Arm
teilweise weiter, das Handgelenk-Signal allein trennt Gleiten und Pumpen darum schlecht. Physikalisch bleibt: im
Gleiten reisst der Pump-Takt ab. Regel:
  - Gleiten = Pause zwischen zwei erkannten Pumps >= PAUSE_MIN_S, dazu die Strecke vom letzten Pump bis zum
    Stufen-Ende (Aufsetzen im Puffer bzw. Zonenende) — 6 von 17 Brett-Gleitphasen enden am Aufsetzen.
  - Jede Phase an beiden Raendern um RAND_MS gekuerzt (der Pump selbst ist kein Gleiten), behalten nur
    GLEIT_MIN_S..GLEIT_MAX_S (laengere Pausen sind eher verpasste Pumps).
Die Pump-Zeiten kommen unveraendert aus pg-1 (Zaehlfehler am Scoot-Paar 2,7 %).

Gemessen am Brett-Paar #16729/#16719 (u267, 17 Brett-Gleitphasen, 62 s), Versatz -8 s aus der GPS-Tempo-
Korrelation (r 0,93; die Accel-Ausrichtung lag 15 s daneben): Gleitphasen P 0,67 / R 0,71 / F1 0,69, Gleit-Sekunden
62 erkannt / 62 echt; pg-1-Modell dort F1 0,57 (93 s). Schwelle 2,0-3,0 s alle F1 0,65-0,69. EIN Paar, ein Fahrer,
Schwelle darauf gewaehlt — Feedback von ThermikDreher abwarten, mehr Brett-Paare sammeln.
"""
from __future__ import annotations

VERSION = "pg-scoot-1"
SPORTARTEN = ("foil_scoot",)
PAUSE_MIN_S = 2.5
RAND_MS = 300.0
GLEIT_MIN_S, GLEIT_MAX_S = 1.5, 15.0


def gleiten(abl: list[dict]) -> list[dict]:
    """abl je Lauf {pump_ms, ende, ...} (aus pumpgleit.ableiten) -> dieselben Eintraege mit eigenem `gleit`,
    `longest` und leerem `hinschauen`. Zeiten Session-ms."""
    out = []
    for a in abl:
        p = sorted(float(x) for x in a.get("pump_ms") or [])
        ende = float(a["ende"])
        roh = [(p0 + RAND_MS, p1 - RAND_MS) for p0, p1 in zip(p, p[1:]) if (p1 - p0) / 1000.0 >= PAUSE_MIN_S]
        if p and (ende - p[-1]) / 1000.0 >= PAUSE_MIN_S:
            roh.append((p[-1] + RAND_MS, ende))          # bis zum Aufsetzen: hinten kein Pump, nichts kuerzen
        gl = [(y0, y1) for y0, y1 in roh if GLEIT_MIN_S <= (y1 - y0) / 1000.0 <= GLEIT_MAX_S]
        out.append({**a, "gleit": gl, "hinschauen": [],
                    "longest": round(max([(y - x) / 1000.0 for x, y in gl], default=0.0), 2)})
    return out
