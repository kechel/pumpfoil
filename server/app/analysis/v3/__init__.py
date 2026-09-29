"""Erkennung v3 (in Arbeit, NICHT live). Plan: docs/DETECTION-V3.md.

Stufe A ersetzt nur die On-Foil-Maske (`mask_override`) — Lauf-Segmentierung, Pump-Zaehlung und
Fremdkraft-Urteil bleiben die von v2. Nichts hier wird von `run_analysis` aufgerufen; die Module
werden nur von scripts/v3/ benutzt, bis Jan das Umschalten freigibt.
"""
