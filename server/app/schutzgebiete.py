"""Schutzgebiete fuer die Karten: Naturschutzgebiete und FFH/Natura 2000 (Jan, 16.10.2026).

Quelle ist OpenStreetMap ueber die Overpass-API. Der SERVER holt die Flaechen, nicht der Browser
— die Nutzer fragen damit keinen weiteren fremden Dienst an (die OSM-Nennung steht ohnehin auf
jeder Karte). Gespeichert wird je Kachel von KACHEL_GRAD x KACHEL_GRAD Grad unter
`DATA_DIR/cache/schutzgebiete` fuer CACHE_TAGE Tage; der Ordner liegt unter `cache/` und ist damit
vom Backup ausgenommen (s. maptiles.py).

Welche Gebiete (Jan): Naturschutzgebiete und FFH-Gebiete IMMER anzeigen, Vogelschutzgebiete nicht
(„ich glaub nicht, dass da baden verboten ist"), Landschaftsschutzgebiete auch nicht (fast
ueberall, kaum Einschraenkungen). Schutzgebiet heisst NICHT automatisch Fahrverbot — das sagt die
Karte im Fenster beim Antippen dazu.

Dazu (Jan: „gibt es Badeverbot offiziell als Markierung?") die OSM-Merkmale fuer Verbote an
Wasserflaechen: `swimming=no` (Baden verboten) und `boat=no` (Befahren verboten) — Art „verbot",
deutlicher gezeichnet. Wie vollstaendig das in OSM eingetragen ist, ist offen: am 16.10. waren alle
oeffentlichen Overpass-Server ueberlastet, gezaehlt werden konnte nicht.

Erkennung je Flaeche (`art`):
  * „verbot": swimming=no oder boat=no/canoe=no (vor allen anderen).
  * „vogel" -> weglassen: Titel/Bezeichnung nennt Vogelschutz (SPA, Special Protection Area, Bird).
  * „ffh":   protect_class 97 (Natura 2000) bzw. Titel nennt Habitat/FFH/Natura 2000/SAC/SCI.
  * „nsg":   leisure=nature_reserve bzw. protect_class 1-4 bzw. Titel nennt Naturschutz/Nature
             Reserve/Réserve naturelle.
  * sonst weglassen (Landschaftsschutz, Nationalpark-Umfeld, Wasserschutz …).
"""
from __future__ import annotations

import json
import math
import re
import time
from pathlib import Path

import requests

from .config import get_settings

KACHEL_GRAD = 0.1
CACHE_TAGE = 30
FEHLER_CACHE_S = 600          # nach einem Overpass-Fehler so lange nicht erneut fragen
MAX_KACHELN = 30              # groessere Ausschnitte: nichts (die Karte ist dann weit weg)
# Der Reihe nach probieren: die oeffentlichen Server sind oft ueberlastet (502/504).
OVERPASS = ("https://overpass-api.de/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter",
            "https://overpass.private.coffee/api/interpreter")
UA = "Pumpfoil/1.0 (+https://pumpfoil.org; schutzgebiete fuer die spotkarte)"
TIMEOUT = 20
MAX_NEU = 2                   # je Anfrage hoechstens so viele Kacheln neu holen (Rest beim naechsten Mal)

_VOGEL = re.compile(r"vogel|bird|special protection|\bSPA\b|oiseaux|uccelli", re.I)
_FFH = re.compile(r"habitat|\bFFH\b|natura ?2000|\bSAC\b|\bSCI\b", re.I)
_NSG = re.compile(r"naturschutz|nature reserve|r[ée]serve naturelle|riserva naturale|natuurreservaat", re.I)
_fehler_bis: dict[str, float] = {}


def art_von(tags: dict) -> str | None:
    if tags.get("swimming") == "no" or tags.get("boat") == "no" or tags.get("canoe") == "no":
        return "verbot"
    titel = " ".join(str(tags.get(k, "")) for k in ("protection_title", "designation", "name", "protect_title"))
    if _VOGEL.search(titel):
        return None
    pc = str(tags.get("protect_class", "")).strip().lower()
    if pc == "97" or _FFH.search(titel):
        return "ffh"
    if tags.get("leisure") == "nature_reserve" or pc in ("1", "1a", "1b", "2", "3", "4") or _NSG.search(titel):
        return "nsg"
    return None


def _ringe(teile: list[list[list[float]]]) -> list[list[list[float]]]:
    """Wegstuecke (je [[lat, lon], …]) zu geschlossenen Ringen verketten."""
    offen = [t[:] for t in teile if len(t) >= 2]
    ringe = []
    while offen:
        ring = offen.pop(0)
        weiter = True
        while ring[0] != ring[-1] and weiter:
            weiter = False
            for i, t in enumerate(offen):
                if t[0] == ring[-1]:
                    ring += t[1:]
                elif t[-1] == ring[-1]:
                    ring += t[::-1][1:]
                elif t[-1] == ring[0]:
                    ring = t[:-1] + ring
                elif t[0] == ring[0]:
                    ring = t[::-1][:-1] + ring
                else:
                    continue
                offen.pop(i)
                weiter = True
                break
        if len(ring) >= 4 and ring[0] == ring[-1]:
            ringe.append(ring)
    return ringe


def _runde(ring):
    return [[round(a, 5), round(b, 5)] for a, b in ring]


def _flaechen(antwort: dict) -> list[dict]:
    raus = []
    for e in antwort.get("elements", []):
        tags = e.get("tags") or {}
        art = art_von(tags)
        if art is None:
            continue
        if e["type"] == "way":
            geo = [[p["lat"], p["lon"]] for p in e.get("geometry") or []]
            aussen, innen = _ringe([geo]), []
        else:
            mitglieder = [m for m in e.get("members") or [] if m.get("type") == "way" and m.get("geometry")]
            teile = lambda rolle: [[[p["lat"], p["lon"]] for p in m["geometry"]]  # noqa: E731
                                   for m in mitglieder if (m.get("role") or "outer") == rolle]
            aussen, innen = _ringe(teile("outer")), _ringe(teile("inner"))
        if not aussen:
            continue
        raus.append({"id": f"{e['type'][0]}{e['id']}", "art": art, "name": tags.get("name") or "",
                     "titel": tags.get("protection_title") or "",
                     "aussen": [_runde(r) for r in aussen], "innen": [_runde(r) for r in innen]})
    return raus


def _kachel_pfad(ix: int, iy: int) -> Path:
    return get_settings().data_dir / "cache" / "schutzgebiete" / f"{ix}_{iy}.json"


def _aus_cache(ix: int, iy: int) -> list[dict] | None:
    pfad = _kachel_pfad(ix, iy)
    try:
        if time.time() - pfad.stat().st_mtime < CACHE_TAGE * 86400:
            return json.loads(pfad.read_text())
    except (OSError, ValueError):
        pass
    return None


def _kachel(ix: int, iy: int) -> list[dict] | None:
    """Flaechen einer Kachel; None, wenn sie gerade nicht zu holen war."""
    pfad = _kachel_pfad(ix, iy)
    alt = _aus_cache(ix, iy)
    if alt is not None:
        return alt
    schl = f"{ix}_{iy}"
    if _fehler_bis.get(schl, 0) > time.time():
        return None
    s, w = iy * KACHEL_GRAD, ix * KACHEL_GRAD
    bbox = f"{s:.4f},{w:.4f},{s + KACHEL_GRAD:.4f},{w + KACHEL_GRAD:.4f}"
    abfrage = (f"[out:json][timeout:{TIMEOUT - 5}];("
               f'way["leisure"="nature_reserve"]({bbox});relation["leisure"="nature_reserve"]({bbox});'
               f'way["boundary"="protected_area"]({bbox});relation["boundary"="protected_area"]({bbox});'
               f'way["swimming"="no"]({bbox});relation["swimming"="no"]({bbox});'
               f'way["boat"="no"]["natural"="water"]({bbox});relation["boat"="no"]["natural"="water"]({bbox});'
               f");out geom;")
    flaechen = None
    for url in OVERPASS:
        try:
            r = requests.post(url, data={"data": abfrage}, headers={"User-Agent": UA}, timeout=TIMEOUT)
            r.raise_for_status()
            flaechen = _flaechen(r.json())
            break
        except (requests.RequestException, ValueError):
            continue
    if flaechen is None:
        _fehler_bis[schl] = time.time() + FEHLER_CACHE_S
        return None
    pfad.parent.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_suffix(".tmp")
    tmp.write_text(json.dumps(flaechen))
    tmp.replace(pfad)
    return flaechen


def im_ausschnitt(w: float, s: float, e: float, n: float) -> dict:
    """Alle Flaechen (eindeutig) der Kacheln, die den Ausschnitt beruehren. Hoechstens MAX_NEU
    Kacheln werden je Anfrage neu geholt (Overpass ist langsam und oft ueberlastet, die Anfrage
    soll nicht minutenlang haengen); fehlt etwas, steht `unvollstaendig` drin und die Karte fragt
    spaeter nach."""
    x0, x1 = math.floor(w / KACHEL_GRAD), math.floor(e / KACHEL_GRAD)
    y0, y1 = math.floor(s / KACHEL_GRAD), math.floor(n / KACHEL_GRAD)
    if x1 < x0 or y1 < y0 or (x1 - x0 + 1) * (y1 - y0 + 1) > MAX_KACHELN:
        return {"zu_weit": True, "unvollstaendig": False, "flaechen": []}
    gesehen: dict[str, dict] = {}
    neu = 0
    fehlt = False
    for ix in range(x0, x1 + 1):
        for iy in range(y0, y1 + 1):
            fl = _aus_cache(ix, iy)
            if fl is None:
                if neu >= MAX_NEU:
                    fehlt = True
                    continue
                neu += 1
                fl = _kachel(ix, iy)
                if fl is None:
                    fehlt = True
                    continue
            for f in fl:
                gesehen.setdefault(f["id"], f)
    return {"zu_weit": False, "unvollstaendig": fehlt, "flaechen": list(gesehen.values())}
