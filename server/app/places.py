"""Gewässer-Namen per OpenStreetMap (Overpass) auflösen.

Reverse-Geocoding (Nominatim) trifft auf Wasser meist daneben; daher suchen wir
die nächste/umgebende Wasserfläche (natural=water) via Overpass und nehmen deren
Namen. Best-effort mit kurzem Timeout — Fehler/kein Treffer -> None.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request

from .config import get_settings

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def _ua() -> str:
    return get_settings().osm_user_agent


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
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(OVERPASS_URL, data=data, headers={"User-Agent": _ua()})
            with urllib.request.urlopen(req, timeout=sock) as resp:
                payload = json.loads(resp.read().decode())
        except Exception:  # noqa: BLE001  (diese Abfrage als Fehlschlag werten, nächste versuchen)
            continue
        if i == 0:
            isin_ok = True   # der Punkt-in-Polygon-Test lief -> „kein Treffer" ist belastbar
        for el in payload.get("elements", []):
            name = (el.get("tags") or {}).get("name")
            if name:
                return name[:120]
    # "" nur cachen, wenn der is_in-Test lief (sonst könnte er den großen See noch finden -> None = retry).
    return "" if isin_ok else None
