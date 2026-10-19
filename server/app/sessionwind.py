"""Wind am Spot waehrend einer Session (19.10.2026, Stand-Buch: wind_am_spot).

Fuer Wind-Sportarten zeigt die Session-Seite, wie der Wind am Spot war, und spaeter brauchen
Wenden/Halsen die Windrichtung (Bug durch den Wind = Wende, Heck = Halse). Quelle Open-Meteo
(keyless, CC-BY, wie `weather.py`), stuendliche Modellwerte in 10 m Hoehe — KEINE Messung am
Wasser, sondern das Wettermodell fuer diese Koordinate. Das steht so auch in der Anzeige.

Abruf nur serverseitig (kein Dritt-Skript im Browser, s. CLAUDE.md Datenschutz). Uebertragen werden
die Spot-Koordinate (auf 2 Nachkommastellen gerundet, ~1 km) und der Tag — wie beim Spot-Wetter.

- Sessions der letzten ~80 Tage: Forecast-API mit start_date/end_date (liefert Vergangenheit).
- Aelter: Archiv-API (ERA5), die hinkt ein paar Tage hinterher.

Das Ergebnis haengt nur an Ort und Zeit, aendert sich also nicht mehr -> Datei-Cache je Session
unter data/wind/<id>.json. Ein leeres Ergebnis wird NICHT gespeichert (naechster Aufruf versucht
es erneut, z. B. wenn das Archiv den Tag noch nicht hatte).
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timedelta, timezone

import httpx

from .config import get_settings

FORECAST = "https://api.open-meteo.com/v1/forecast"
ARCHIVE = "https://archive-api.open-meteo.com/v1/archive"
_UA = {"User-Agent": "pumpfoil.org session wind"}
_FORECAST_TAGE = 80


def _cache_pfad(session_id: int):
    d = get_settings().data_dir / "wind"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{session_id}.json"


def _abrufen(lat: float, lon: float, start: datetime, ende: datetime) -> list[dict]:
    alt = (datetime.now(timezone.utc) - start) > timedelta(days=_FORECAST_TAGE)
    params = {
        "latitude": round(lat, 2), "longitude": round(lon, 2),
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "start_date": start.date().isoformat(), "end_date": ende.date().isoformat(),
        "wind_speed_unit": "kmh", "timezone": "UTC",
    }
    r = httpx.get(ARCHIVE if alt else FORECAST, params=params, headers=_UA, timeout=8.0)
    if r.status_code != 200:
        return []
    h = (r.json() or {}).get("hourly") or {}
    out = []
    # Die volle Stunde VOR dem Start bis zur vollen Stunde NACH dem Ende — eine 40-min-Session
    # bekommt so mindestens zwei Werte.
    von = start.replace(minute=0, second=0, microsecond=0)
    bis = ende.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    for t, v, d, g in zip(h.get("time", []), h.get("wind_speed_10m", []),
                          h.get("wind_direction_10m", []), h.get("wind_gusts_10m", [])):
        ts = datetime.fromisoformat(t).replace(tzinfo=timezone.utc)
        if von <= ts <= bis and v is not None and d is not None:
            out.append({"t": ts.isoformat(), "kmh": round(float(v), 1), "richtung": round(float(d)),
                        "boeen_kmh": round(float(g), 1) if g is not None else None})
    return out


def _mittel(stunden: list[dict]) -> dict | None:
    if not stunden:
        return None
    kmh = [s["kmh"] for s in stunden]
    # Richtung als Vektor mitteln (350 Grad und 10 Grad ergeben 0, nicht 180).
    x = sum(math.cos(math.radians(s["richtung"])) for s in stunden)
    y = sum(math.sin(math.radians(s["richtung"])) for s in stunden)
    boeen = [s["boeen_kmh"] for s in stunden if s["boeen_kmh"] is not None]
    return {"kmh_min": min(kmh), "kmh_max": max(kmh), "kmh_mittel": round(sum(kmh) / len(kmh), 1),
            "richtung": round(math.degrees(math.atan2(y, x))) % 360,
            "boeen_max_kmh": max(boeen) if boeen else None}


def session_wind(session_id: int, lat: float | None, lon: float | None,
                 start: datetime | None, ende: datetime | None) -> dict | None:
    """{quelle, stunden: [...], mittel: {...}} oder None (kein Ort/keine Zeit/kein Ergebnis)."""
    if lat is None or lon is None or start is None:
        return None
    pfad = _cache_pfad(session_id)
    try:
        return json.loads(pfad.read_text())
    except (OSError, ValueError):
        pass
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    ende = ende or start
    if ende.tzinfo is None:
        ende = ende.replace(tzinfo=timezone.utc)
    try:
        stunden = _abrufen(lat, lon, start.astimezone(timezone.utc), ende.astimezone(timezone.utc))
    except Exception:  # noqa: BLE001  — best effort wie weather.py
        return None
    if not stunden:
        return None
    erg = {"quelle": "Open-Meteo", "stunden": stunden, "mittel": _mittel(stunden)}
    try:
        pfad.write_text(json.dumps(erg))
    except OSError:
        pass
    return erg
