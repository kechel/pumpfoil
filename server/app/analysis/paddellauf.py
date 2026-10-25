"""Fahrten-Erkennung fuer Paddeln OHNE Foil (Gruppe paddel: SUP, spaeter Rudern) — 25.10.2026.

Jan, 25.10.2026: „SUP (ohne foil) fehlt noch, das ist wie Rudern". Es gibt kein On-Foil und keine Pumps; eine Fahrt
ist Paddeln in Bewegung, eine Pause (Treiben, Stehen am Ufer) beendet sie. Also wie bei Wind (windlauf.py) die
GPS-Zustandsmaschine von v2 OHNE Handgelenk-Modell, aber mit festen, langsamen Schwellen: SUP wird mit 5-8 km/h
gepaddelt, Treiben liegt bei 0-2 km/h. Die Schlaege zaehlt app/paddel.py ueber die ganze Session.

Die Schwellen sind ANNAHMEN, noch an keiner Session gemessen (es gibt keine).
"""
from __future__ import annotations

VERSION = "paddel-1"
# Start/Ende/Verweildauer wie bei Wind; dazu die Boeden, die fuer Pumpfoil auf ~7-10 km/h stehen (MOVE_FLOOR_MPS,
# MIN_SEG_AVG_SPEED) und eine Mindestdauer: unter 30 s ist es Rangieren am Ufer, keine Fahrt.
SCHWELLEN = {"start_kmh": 3.0, "ende_kmh": 2.0, "ende_halte_s": 15.0, "boden_kmh": 2.0, "schnitt_min_kmh": 3.0,
             "min_s": 30.0, "quelle": "fest", "version": VERSION}


def v2_parameter() -> dict:
    """Die Schwellen als Parameter fuer analyze_session_v2 / detect_v2 (m/s, ohne Modell)."""
    return {"use_model": False, "enter_speed": SCHWELLEN["start_kmh"] / 3.6, "exit_speed": SCHWELLEN["ende_kmh"] / 3.6,
            "exit_dwell_s": SCHWELLEN["ende_halte_s"], "move_floor_mps": SCHWELLEN["boden_kmh"] / 3.6,
            "min_seg_avg_speed": SCHWELLEN["schnitt_min_kmh"] / 3.6, "min_segment_s": SCHWELLEN["min_s"]}
