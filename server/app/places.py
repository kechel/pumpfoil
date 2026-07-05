"""Gewässer-Namen per OpenStreetMap (Overpass) auflösen.

Reverse-Geocoding (Nominatim) trifft auf Wasser meist daneben; daher suchen wir
die nächste/umgebende Wasserfläche (natural=water) via Overpass und nehmen deren
Namen. Best-effort mit kurzem Timeout — Fehler/kein Treffer -> None.
"""
from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request

from .config import get_settings

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Land-Features, nach denen man einen Launch-Spot benennt (konservative Whitelist —
# nur eindeutige „Venue"-artige Tags, KEINE Restaurants/Schulen/Regionen).
_SHORE_TAGS = [
    ("leisure", "sports_centre"), ("leisure", "marina"), ("leisure", "water_park"),
    ("leisure", "beach_resort"), ("leisure", "slipway"), ("natural", "beach"),
    ("man_made", "pier"),
]


def _hav_m(lat1, lon1, lat2, lon2) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371000.0 * math.asin(min(1.0, math.sqrt(h)))


def _ua() -> str:
    return get_settings().osm_user_agent


def _overpass(q: str, timeout: float, tries: int = 3):
    """Overpass-Request mit Retry/Backoff (die API ist flaky). -> payload | None."""
    import time
    for attempt in range(tries):
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": _ua()})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode())
        except Exception:  # noqa: BLE001
            if attempt < tries - 1:
                time.sleep(2 * (attempt + 1))
    return None


def lookup_water_rings(lat: float, lon: float, timeout: float = 12.0) -> list | None:
    """Polygon-Ringe (Liste von [[lat,lon],...]) der umgebenden Wasserfläche, oder None.
    Für Point-in-Polygon (Land/Wasser). Nimmt den nächstgelegenen benannten Wasser-Way."""
    for radius in (60, 200, 600):
        q = (
            "[out:json][timeout:20];("
            f'way(around:{radius},{lat},{lon})["natural"="water"];'
            ");out geom;"
        )
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": _ua()})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode())
        except Exception:  # noqa: BLE001
            return None
        ways = [e for e in payload.get("elements", []) if e.get("type") == "way" and e.get("geometry")]
        if not ways:
            continue
        # größten Ring (meiste Punkte) nehmen — der See, nicht ein kleiner Tümpel.
        ways.sort(key=lambda w: len(w["geometry"]), reverse=True)
        return [[[p["lat"], p["lon"]] for p in ways[0]["geometry"]]]
    return None


def lookup_shore_name(lat: float, lon: float, timeout: float = 25.0) -> str | None:
    """Best-Guess-Ufer-/Venue-Name nahe (lat,lon): das NÄCHSTE benannte Feature aus der
    konservativen Whitelist (_SHORE_TAGS) im Umkreis. Fehlertolerant — bei Netz-/Parse-
    Fehler oder keinem eindeutigen Treffer -> None (Aufrufer faellt auf den Gewaessernamen
    zurueck). Bewusst eng, damit kein Restaurant/keine Region als Spot-Name landet.
    Läuft als Background-Task -> großzügiger Timeout + Retries (Overpass ist flaky)."""
    q = f'[out:json][timeout:25];(nwr(around:300,{lat},{lon})["name"];);out tags center 80;'
    payload = _overpass(q, timeout, tries=3)
    if payload is None:
        return None
    best = None
    for el in payload.get("elements", []):
        tags = el.get("tags") or {}
        name = tags.get("name")
        if not name or not any(tags.get(k) == v for k, v in _SHORE_TAGS):
            continue
        c = el.get("center") or {"lat": el.get("lat"), "lon": el.get("lon")}
        if c.get("lat") is None:
            continue
        d = _hav_m(lat, lon, c["lat"], c["lon"])
        if best is None or d < best[0]:
            best = (d, name)
    return best[1][:120] if best else None


def lookup_place_name(lat: float, lon: float, radius_m: int = 3500, timeout: float = 20.0) -> str | None:
    """Nächste echte Ortschaft (place=village|town|city) im Umkreis — Locals benennen
    Spots an großen Gewässern oft nach dem Ort (z. B. „Immenstaad am Bodensee"). BEWUSST
    ohne suburb/neighbourhood/hamlet (das liefert bei Städten Mikro-Viertel-Müll, siehe Paris).
    Fehlertolerant -> None."""
    q = (f'[out:json][timeout:25];(node(around:{radius_m},{lat},{lon})'
         '["place"~"^(village|town|city)$"]["name"];);out center 60;')
    payload = _overpass(q, timeout, tries=3)
    if payload is None:
        return None
    best = None
    for el in payload.get("elements", []):
        name = (el.get("tags") or {}).get("name")
        la = el.get("lat") or (el.get("center") or {}).get("lat")
        lo = el.get("lon") or (el.get("center") or {}).get("lon")
        if not name or la is None:
            continue
        d = _hav_m(lat, lon, la, lo)
        if best is None or d < best[0]:
            best = (d, name)
    return best[1][:120] if best else None


def lookup_water_name(lat: float, lon: float, timeout: float = 7.0) -> str | None:
    """Name der Wasserfläche um (lat, lon). Tri-State, damit der Aufrufer einen
    transienten Fehlschlag NICHT als Endergebnis cacht (sonst „kein Spot" für immer):
      - str  : Gewässername gefunden.
      - ""   : Abfrage lief, aber definitiv kein benanntes Gewässer in Reichweite.
      - None : Abfrage fehlgeschlagen (Netz/Timeout/Parse) -> später erneut versuchen.

    Zuerst is_in (Punkt-in-Polygon): findet die UMSCHLIESSENDE benannte Wasserfläche
    unabhängig von der Größe — bei großen Seen (z. B. Bodensee) ist das Ufer >600 m weg,
    da verfehlt ein reiner around-Radius das Gewässer. around (60/200/600 m) bleibt Fallback
    für ufernahe/kleine Features."""
    # (Query, Socket-Timeout). is_in braucht mehr Zeit (Overpass baut Areas) -> großzügiger.
    queries = [(
        f"[out:json][timeout:25];is_in({lat},{lon})->.a;("
        'way(pivot.a)["natural"="water"]["name"];'
        'relation(pivot.a)["natural"="water"]["name"];'
        ");out tags 1;", max(timeout, 18.0),
    )]
    for radius in (60, 200, 600):
        queries.append((
            "[out:json][timeout:10];("
            f'way(around:{radius},{lat},{lon})["natural"="water"]["name"];'
            f'relation(around:{radius},{lat},{lon})["natural"="water"]["name"];'
            ");out tags 1;", timeout,
        ))
    isin_ok = False
    for i, (q, sock) in enumerate(queries):
        payload = _overpass(q, sock, tries=3)
        if payload is None:
            continue
        if i == 0:
            isin_ok = True   # der Punkt-in-Polygon-Test lief -> „kein Treffer" ist belastbar
        for el in payload.get("elements", []):
            name = (el.get("tags") or {}).get("name")
            if name:
                return name[:120]
    # "" nur cachen, wenn der is_in-Test lief (sonst könnte er den großen See noch finden -> None = retry).
    return "" if isin_ok else None
