"""Spot-Wetter (Open-Meteo) + Pegel (PEGELONLINE) — beides keyless & frei.

- Open-Meteo: Wind/Temp/Niederschlag für heute/morgen/übermorgen + aktuell. Wind in
  Knoten (wind_speed_unit=kn). Non-commercial frei, Attribution „Open-Meteo" (CC-BY).
- PEGELONLINE (WSV): nächste Pegelstation im Umkreis + aktueller Wasserstand. Nur
  deutsche Bundeswasserstraßen -> außerhalb (z. B. CH, kleine Seen) oft kein Treffer.

Alles best-effort mit kurzem Timeout; Fehler/kein Treffer -> Teil = None.
Ergebnis wird je Spot 1 h gecacht (gemeinsam für alle Nutzer), s. api/community.py.
"""
from __future__ import annotations

import math
import re

import httpx

OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
PEGEL = "https://www.pegelonline.wsv.de/webservices/rest-api/v2/stations.json"
_UA = {"User-Agent": "pumpfoil.org weather widget"}

# Spot-spezifische Wassertemperatur-Quellen. Aktuell: Illmensee — die örtlichen
# Funkamateure (db0wv.de) messen alle 5 min in ~1 m Tiefe und stellen die Werte als
# plaintemp.txt bereit (Momentan/Min/Max/Mittel, heute + gestern).
SPOT_WATER_SOURCES = {
    "illmensee": "http://www.db0wv.de/wasser-out/plaintemp.txt",
}


def spot_water_temp(spot: str) -> dict | None:
    """Wassertemperatur einer spotspezifischen Quelle (z. B. Illmensee/db0wv).
    Parst plaintemp.txt -> {current, min, max, avg, at, source}. Fehler -> None."""
    url = SPOT_WATER_SOURCES.get((spot or "").strip().lower())
    if not url:
        return None
    try:
        r = httpx.get(url, headers=_UA, timeout=6.0)
        if r.status_code != 200:
            return None
        txt = r.text
    except Exception:  # noqa: BLE001
        return None

    def num(pat):  # noqa: ANN001
        m = re.search(pat, txt)
        try:
            return round(float(m.group(1)), 1) if m else None
        except (TypeError, ValueError):
            return None

    # „Heute"-Block steht zuerst -> erstes Vorkommen je Kennzahl.
    cur = num(r"Momentane Temperatur:\s*([0-9.]+)")
    mn = num(r"Niedrigste Temperatur:\s*([0-9.]+)")
    mx = num(r"H(?:&ouml;|ö)chste Temperatur:\s*([0-9.]+)")
    avg = num(r"Tages\s*Mittelwert:\s*([0-9.]+)")
    tsm = re.search(r"Momentane Temperatur:[^(]*\(([^)]+)\)", txt)
    at = tsm.group(1).strip() if tsm else None
    if cur is None and mx is None:
        return None
    return {"current": cur, "min": mn, "max": mx, "avg": avg, "at": at, "source": "db0wv.de"}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _forecast(lat: float, lon: float) -> dict | None:
    params = {
        "latitude": lat, "longitude": lon,
        "daily": "weather_code,temperature_2m_max,temperature_2m_min,wind_speed_10m_max,"
                 "wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_sum",
        "current": "temperature_2m,wind_speed_10m,wind_direction_10m,weather_code",
        "wind_speed_unit": "kn", "timezone": "auto", "forecast_days": 3,
    }
    try:
        r = httpx.get(OPEN_METEO, params=params, headers=_UA, timeout=6.0)
        if r.status_code != 200:
            return None
        d = r.json()
    except Exception:  # noqa: BLE001
        return None
    daily = d.get("daily") or {}
    times = daily.get("time") or []
    days = []
    for i in range(min(len(times), 3)):
        def g(key):  # noqa: ANN001
            arr = daily.get(key) or []
            return arr[i] if i < len(arr) else None
        days.append({
            "date": times[i],
            "code": g("weather_code"),
            "tmax": g("temperature_2m_max"),
            "tmin": g("temperature_2m_min"),
            "wind_max": g("wind_speed_10m_max"),
            "gust_max": g("wind_gusts_10m_max"),
            "dir": g("wind_direction_10m_dominant"),
            "precip": g("precipitation_sum"),
        })
    cur = d.get("current") or {}
    return {
        "current": {
            "temp": cur.get("temperature_2m"),
            "wind": cur.get("wind_speed_10m"),
            "dir": cur.get("wind_direction_10m"),
            "code": cur.get("weather_code"),
        },
        "days": days,
        "wind_unit": "kn",
    }


def _pegel(lat: float, lon: float, radius_km: int = 25) -> dict | None:
    params = {
        "latitude": lat, "longitude": lon, "radius": radius_km,
        "includeTimeseries": "true", "includeCurrentMeasurement": "true",
    }
    try:
        r = httpx.get(PEGEL, params=params, headers=_UA, timeout=6.0)
        if r.status_code != 200:
            return None
        stations = r.json()
    except Exception:  # noqa: BLE001
        return None
    best = None
    best_km = 1e9
    for st in stations if isinstance(stations, list) else []:
        slat, slon = st.get("latitude"), st.get("longitude")
        if slat is None or slon is None:
            continue
        # Wasserstand-Zeitreihe (W) mit aktuellem Messwert suchen.
        w = next((ts for ts in (st.get("timeseries") or [])
                  if ts.get("shortname") == "W" and ts.get("currentMeasurement")), None)
        if not w:
            continue
        km = _haversine_km(lat, lon, float(slat), float(slon))
        if km < best_km:
            best_km, best = km, (st, w)
    if not best:
        return None
    st, w = best
    cm = w.get("currentMeasurement") or {}
    trend = cm.get("trend")  # -1 fallend / 0 gleich / 1 steigend (PEGELONLINE)
    return {
        "station": (st.get("longname") or st.get("shortname") or "").title(),
        "water": (st.get("water") or {}).get("longname"),
        "value": cm.get("value"),
        "unit": w.get("unit") or "cm",
        "timestamp": cm.get("timestamp"),
        "trend": trend,
        "km": round(best_km, 1),
    }


def spot_weather(lat: float, lon: float) -> dict:
    """Kombinierte Wetter- + Pegel-Antwort für einen Spot. Teile können None sein."""
    return {"lat": lat, "lon": lon, "weather": _forecast(lat, lon), "pegel": _pegel(lat, lon)}
