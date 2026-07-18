"""Zeitzone eines Spots aus Koordinaten (offline via timezonefinder).

Alle Uhrzeiten im Produkt zeigen die ORTSZEIT DES SPOTS (nicht Browser-/Server-Zeit):
eine 6-Uhr-Session in Helsinki soll überall als 06:00 erscheinen. Clients bekommen
den IANA-Namen (`tz`) im Payload und formatieren damit.
"""
from __future__ import annotations

from functools import lru_cache
from zoneinfo import ZoneInfo

_FALLBACK = "Europe/Berlin"   # Kernmarkt; Sessions ohne Koordinaten (selten)

_tf = None


def _finder():
    global _tf
    if _tf is None:
        from timezonefinder import TimezoneFinder
        _tf = TimezoneFinder()
    return _tf


@lru_cache(maxsize=4096)
def _lookup(lat2: float, lon2: float) -> str:
    try:
        return _finder().timezone_at(lng=lon2, lat=lat2) or _FALLBACK
    except Exception:  # noqa: BLE001
        return _FALLBACK


def tz_name(lat: float | None, lon: float | None) -> str:
    """IANA-Zeitzonenname für Koordinaten; gerundet gecacht (Spots sind Cluster)."""
    if lat is None or lon is None:
        return _FALLBACK
    return _lookup(round(lat, 2), round(lon, 2))


def tz_of(lat: float | None, lon: float | None) -> ZoneInfo:
    return ZoneInfo(tz_name(lat, lon))
