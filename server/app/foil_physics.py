"""Minimaler Port der Hydrofoil-Physik (web/src/lib/foilPhysics.ts, identisch zur
verifizierten FoilPhysics.kt) — nur so viel, wie für Auto-Alarm-Schwellen nötig:
Min-Viable-Speed (Min-Alarm) und Optimal-Speed (Max-Alarm), je Foil + Reitergewicht.

Einheiten: Länge cm/mm, Speed km/h, Gewicht kg.
"""
from __future__ import annotations

import math

RHO_WATER = 1000.0
MU_WATER = 0.001
G = 9.81
_MEAN_TO_ROOT_CHORD = 0.70


def _ar(span_cm: float, area_cm2: float) -> float:
    span_m = span_cm / 100.0
    area_m2 = area_cm2 / 10000.0
    return span_m * span_m / area_m2


def _mean_chord(area_cm2: float, ar: float) -> float:
    return math.sqrt((area_cm2 / 10000.0) / ar)


def _thickness_ratio(thickness_mm: float, area_cm2: float, ar: float) -> float:
    root_chord_m = _mean_chord(area_cm2, ar) / _MEAN_TO_ROOT_CHORD
    return (thickness_mm / 1000.0) / root_chord_m


def _reynolds(chord_m: float, speed_kmh: float) -> float:
    v = speed_kmh / 3.6
    return RHO_WATER * v * chord_m / MU_WATER


def _critical_reynolds(ar: float, tr: float) -> float:
    c = 80000.0
    if ar > 12:
        c += (ar - 12) * 15000.0
    if ar > 16:
        c += (ar - 16) * 20000.0
    if tr < 0.15:
        c += 80000.0
    if tr < 0.10:
        c += 60000.0
    return min(c, 400000.0)


def _clmax(ar: float, thickness_mm: float, area_cm2: float, speed_kmh: float = 15.0) -> float:
    chord_m = _mean_chord(area_cm2, ar)
    tr = _thickness_ratio(thickness_mm, area_cm2, ar)
    base = 1.4
    ar_factor = max(0.8, 1.3 - ar * 0.02)
    thickness_factor = 0.8 + tr * 2
    reynolds = _reynolds(chord_m, speed_kmh)
    critical_re = _critical_reynolds(ar, tr)
    reynolds_factor = 1.0
    if reynolds < critical_re:
        reynolds_factor = 0.3 + 0.7 * (reynolds / critical_re)
    profile_factor = 1.0
    if ar > 15 and tr < 0.12:
        profile_factor = 0.8
    return base * ar_factor * thickness_factor * reynolds_factor * profile_factor


def _total_weight_n(weight_kg: float, equip_kg: float) -> float:
    return (weight_kg + equip_kg) * G


def _min_viable_speed(area_cm2: float, clmax: float, weight_kg: float, equip_kg: float) -> float:
    area_m2 = area_cm2 / 10000.0
    practical_cl = clmax * 0.8
    return math.sqrt((2 * _total_weight_n(weight_kg, equip_kg)) / (RHO_WATER * area_m2 * practical_cl)) * 3.6


def _stall_speed(area_cm2: float, clmax: float, weight_kg: float, equip_kg: float) -> float:
    area_m2 = area_cm2 / 10000.0
    return math.sqrt((2 * _total_weight_n(weight_kg, equip_kg)) / (RHO_WATER * area_m2 * clmax)) * 3.6


def alarm_speeds(
    span_cm: float, area_cm2: float, thickness_mm: float,
    weight_kg: float, equip_kg: float = 10.0,
) -> tuple[int, int]:
    """(min_kmh, max_kmh) für den Auto-Alarm: Min = 1 km/h ÜBER der Min-Viable-Speed
    (Vorwarnung, bevor man wirklich absackt), Max = Optimal-Speed (≈1,75× Stall,
    bestes Gleiten). Beide gerundet."""
    if area_cm2 <= 0 or span_cm <= 0:
        return (0, 0)
    ar = _ar(span_cm, area_cm2)
    clmax = _clmax(ar, thickness_mm, area_cm2, 15.0)
    stall = _stall_speed(area_cm2, clmax, weight_kg, equip_kg)
    min_v = max(stall, _min_viable_speed(area_cm2, clmax, weight_kg, equip_kg))
    optimal = round(stall * 1.75)
    return (round(min_v) + 1, int(optimal))
