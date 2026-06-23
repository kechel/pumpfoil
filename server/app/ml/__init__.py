"""Phase-2-Platzhalter: Accel-Feature-Extraktion + ML (Pump/Glide, Pump-Count).

Geplante Pipeline (siehe Plan):
  features.py  — Bandpass 0.3-3 Hz, FFT je ~3-4 s-Fenster (128 Samples),
                 Dominanzfrequenz, Band-Power-Ratio, RMS, Spektral-Entropie.
  pumps.py     — Peak-Detection (min. Prominenz, >=0.5 s Abstand) -> Pump-Count.
  train.py     — Fenster-Features + Labels -> RandomForest, session-level CV.

Aktiviert wird das, sobald genügend gelabelte Sessions vorliegen.
"""
