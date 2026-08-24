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

# Mehrere Overpass-Instanzen, der Reihe nach. Grund: die Haupt-Instanz weist uns seit unbekannter
# Zeit ab (01.08.2026 gemessen: overpass-api.de IPv4 -> Connection refused, sehr wahrscheinlich
# unsere IP gesperrt, weil pro Session angefragt wurde). Folge war, dass Wasserflaechen UND
# Ufer-Namen gar nicht mehr ankamen — unbemerkt, weil der Aufrufer bei None einfach weitermacht.
# kumi.systems antwortet normal. Reihenfolge = Vorliebe; bei Erfolg wird die Instanz gemerkt,
# damit nicht jeder Abruf erneut in den gesperrten Host laeuft.
# (URL, global?) — REGIONALE Instanzen sind gefaehrlich: overpass.osm.ch antwortet fuer Frankreich
# brav mit "nichts gefunden" statt mit einem Fehler. Ein leeres Ergebnis von dort ist deshalb KEIN
# Beweis, dass es kein Wasser gibt (siehe _overpass_empty_is_truth).
OVERPASS_URLS = [
    ("https://overpass.kumi.systems/api/interpreter", True),
    ("https://overpass-api.de/api/interpreter", True),
    ("https://overpass.private.coffee/api/interpreter", True),
    ("https://overpass.osm.ch/api/interpreter", False),   # nur Schweiz + Grenzregion
]
OVERPASS_URL = OVERPASS_URLS[0][0]   # Rueckwaertskompatibel (falls jemand direkt darauf zeigt)
_last_good: str | None = None

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


def _overpass(q: str, timeout: float, tries: int = 2):
    """Overpass-Request ueber mehrere Instanzen mit Retry/Backoff. -> payload | None.
    Die zuletzt erfolgreiche Instanz wird bevorzugt (siehe OVERPASS_URLS)."""
    import time
    global _last_good
    urls = list(OVERPASS_URLS)
    if _last_good:                              # zuletzt erfolgreiche zuerst
        urls.sort(key=lambda u: u[0] != _last_good)
    data = urllib.parse.urlencode({"data": q}).encode()
    for url, ist_global in urls:
        for attempt in range(tries):
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": _ua()})
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    payload = json.loads(resp.read().decode())
                _last_good = url
                payload["_global"] = ist_global   # der Aufrufer muss ein leeres Ergebnis einordnen
                return payload
            except Exception:  # noqa: BLE001
                if attempt < tries - 1:
                    time.sleep(2 * (attempt + 1))
    return None


class OverpassUnavailable(RuntimeError):
    """Abruf fehlgeschlagen (Netz/Instanz) — NICHT „kein Wasser gefunden"."""


def lookup_water_rings(lat: float, lon: float, timeout: float = 12.0) -> list | None:
    """Polygon-Ringe (Liste von [[lat,lon],...]) der umgebenden Wasserfläche, oder None.
    Für Point-in-Polygon (Land/Wasser). Nimmt den nächstgelegenen benannten Wasser-Way."""
    for radius in (60, 200, 600):
        q = (
            "[out:json][timeout:20];("
            f'way(around:{radius},{lat},{lon})["natural"="water"];'
            ");out geom;"
        )
        payload = _overpass(q, timeout)
        if payload is None:
            # Unterschied zu „nichts gefunden" ist wichtig: der Aufrufer darf einen FEHLSCHLAG
            # nicht als „hier ist kein Wasser" in den Cache schreiben (siehe _water_rings_cached).
            raise OverpassUnavailable("Overpass nicht erreichbar")
        ways = [e for e in payload.get("elements", []) if e.get("type") == "way" and e.get("geometry")]
        if not ways:
            if not payload.get("_global", True):
                # Regionale Instanz kennt die Gegend evtl. gar nicht -> kein Beweis fuer "kein Wasser"
                raise OverpassUnavailable("nur regionale Instanz erreichbar, Ergebnis nicht belastbar")
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


# --- Nominatim-Fallback (ebenfalls OpenStreetMap) --------------------------------------------
# Overpass ist fuer diese VM seit laengerem gesperrt (Haupt-Instanz lehnt die IP ab, die
# erreichbaren Spiegel sind regional) -> 231 von 402 Sessions seit dem 25.07. blieben ohne
# Spot-Namen, und Nutzer dachten, sie muessten Spots selbst anlegen (3 Meldungen).
# Nominatim (nominatim.openstreetmap.org) ist von hier erreichbar und fuer Reverse-Geocoding
# gedacht. Usage-Policy: max. 1 Request/s, aussagekraeftiger User-Agent — beides eingehalten
# (die Benennung laeuft als Hintergrund-Task mit kleinem Volumen, _ua() nennt die Domain).

def _nominatim(params: dict, timeout: float = 8.0):
    import json as _json
    import urllib.parse
    import urllib.request

    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {**params, "format": "jsonv2"})
    req = urllib.request.Request(url, headers={"User-Agent": _ua()})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return _json.loads(r.read().decode("utf-8"))
    except Exception:
        return None


def lookup_area_nominatim(lat: float, lon: float) -> str | None:
    """Unterscheidungs-LABEL fuer einen Spot (nicht sein Name): der Ort, an dem man ins Wasser geht.

    Gegenstueck zur "Paris-Lektion" weiter unten: als NAME waere ein Mikro-Objekt Muell, als
    ZUSATZZEILE ist es genau das, was "Berlin 3" von "Berlin 4" unterscheidet. Zwei Stufen:

      1. Das benannte Objekt AM SPOT-MITTELPUNKT (zoom 18) — Steg, Faehranleger, Marina, Badestelle,
         Parkplatz. Das ist die praeziseste Auskunft und benennt genau die Stelle, an der gestartet
         wird (gemessen: "Berlin Reinickendorf" (Faehranleger) vs "Insel Scharfenberg" (Parkplatz)
         fuer zwei Spots, die beide "Berlin" heissen und 1,1 km auseinander liegen).
      2. Sonst der Stadtteil (zoom 17, suburb/borough) — "Tegel", "Wannsee".

    Reine Anzeige; ohne Treffer None.
    """
    import time as _time

    d = _nominatim({"lat": lat, "lon": lon, "zoom": 18}) or {}
    name = (d.get("name") or "").strip()
    if name and d.get("category") in ("leisure", "amenity", "natural", "man_made", "tourism",
                                      "waterway", "water", "landuse", "place"):
        return name[:120]
    _time.sleep(1.1)
    d = _nominatim({"lat": lat, "lon": lon, "zoom": 17}) or {}
    adr = d.get("address") or {}
    stadt = str(adr.get("city") or adr.get("town") or adr.get("village") or "").lower()
    for k in ("suburb", "borough", "city_district", "county"):
        if adr.get(k):
            wert = str(adr[k])[:120]
            if wert.lower() != stadt:      # "Berlin/Berlin" unterscheidet nichts
                return wert
    return None


def lookup_place_nominatim(lat: float, lon: float) -> tuple[str | None, str | None]:
    """(ortsname, gewaessername) via Nominatim — der Fallback, wenn Overpass nichts liefert.

    Zwei Abfragen mit 1,1 s Abstand (Policy):
      1. zoom=18 direkt am Punkt: liegt er AUF einem benannten Gewaesser, kommt genau das
         zurueck (category natural / type water|bay) -> Gewaessername.
      2. zoom=14: Ortslage. Wie beim Overpass-Pendant BEWUSST nur village/town/city (+municipality
         als Rettung) — suburb/neighbourhood liefert bei Staedten Mikro-Viertel-Muell (Paris-Lektion).
    """
    import time as _time

    water = None
    d = _nominatim({"lat": lat, "lon": lon, "zoom": 18})
    if d and d.get("name") and (
            d.get("category") in ("natural", "water", "waterway")
            or d.get("type") in ("water", "bay", "reservoir", "lake")):
        water = str(d["name"])[:120]
    _time.sleep(1.1)
    d = _nominatim({"lat": lat, "lon": lon, "zoom": 14})
    ort = None
    if d:
        adr = d.get("address") or {}
        for k in ("village", "town", "city", "municipality"):
            if adr.get(k):
                ort = str(adr[k])[:120]
                break
        if not ort and d.get("addresstype") in ("village", "town", "city") and d.get("name"):
            ort = str(d["name"])[:120]
    return ort, water
