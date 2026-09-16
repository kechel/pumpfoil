"""Kartenhintergrund fuer das Teilen-Bild — Kacheln holen, zusammensetzen, zuschneiden.

Freigabe Jan (16.09.2026): „teilen der satteliten Bilder mit leaflet Nennung im Bild wie in der
pwa ist ok". Die Nennung ist deshalb keine Verzierung, sondern die BEDINGUNG — sie wird in
`sharecard.py` fest ins Bild gebrannt, nicht als abschaltbare Option gefuehrt.

Dieselben zwei Ebenen wie in der PWA (`web/src/lib/mapTiles.ts`), damit ein geteiltes Bild so
aussieht wie die Karte, aus der es kommt:
- „satellit" = Esri World Imagery (ohne Schluessel, gegen Namensnennung)
- „karte"    = OpenStreetMap

UNTERSCHIED ZUR PWA: dort holt der BROWSER die Kacheln, hier der SERVER. Der Anbieter sieht also
unsere IP statt der des Nutzers — datenschutzrechtlich die bessere Richtung, aber es macht uns zu
einem Vielabrufer. Deshalb drei Dinge:
- Plattencache (`DATA_DIR/cache/tiles`), damit derselbe Spot nur einmal geholt wird. Spots
  wiederholen sich stark; das ist der Grund, warum das ueberhaupt tragbar ist. Der Ordner liegt
  bewusst unter `cache/`: alles darin ist jederzeit nachladbar und deshalb vom Backup
  ausgenommen (s. deploy/backup-latest.sh) — er waere sonst ueber die Zeit dreistellige MB, die
  taeglich mit ans externe Backup wandern.
- Ein User-Agent, der uns benennt — die OSM-Kachelrichtlinie verlangt das ausdruecklich.
- Harte Zeitgrenze und stiller Rueckfall: bekommen wir die Kacheln nicht, entsteht das Bild eben
  ohne Karte. Ein Teilen-Bild darf NIE an einem fremden Server haengenbleiben.
"""
from __future__ import annotations

import math
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from PIL import Image

from .config import get_settings

KACHEL = 256
MAX_ZOOM = 19          # hoeher liefert Esri nicht nativ (wie `maxNativeZoom` in der PWA)
TIMEOUT = 5.0
UA = "Pumpfoil/1.0 (+https://pumpfoil.org; kartenhintergrund fuer geteilte session-bilder)"

EBENEN = {
    "satellit": {
        "url": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        # Wortgleich mit dem, was die PWA unter der Karte anzeigt.
        "nennung": "Leaflet | © Esri, Maxar, Earthstar Geographics",
    },
    "karte": {
        "url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        "nennung": "Leaflet | © OpenStreetMap",
    },
}

_sitzung = threading.local()


def nennung(ebene: str) -> str:
    return EBENEN[ebene]["nennung"]


def _http() -> requests.Session:
    """Eine Session je Thread — spart den TLS-Handschlag ueber die ~25 Kacheln eines Bildes."""
    s = getattr(_sitzung, "s", None)
    if s is None:
        s = requests.Session()
        s.headers["User-Agent"] = UA
        _sitzung.s = s
    return s


def _cache_pfad(ebene: str, z: int, x: int, y: int) -> Path:
    return get_settings().data_dir / "cache" / "tiles" / ebene / str(z) / str(x) / f"{y}.img"


def _kachel(ebene: str, z: int, x: int, y: int) -> Image.Image | None:
    p = _cache_pfad(ebene, z, x, y)
    if p.exists():
        try:
            return Image.open(p).convert("RGB")
        except Exception:
            p.unlink(missing_ok=True)      # kaputt abgelegt -> neu holen
    url = EBENEN[ebene]["url"].format(z=z, x=x, y=y)
    try:
        r = _http().get(url, timeout=TIMEOUT)
        if r.status_code != 200 or not r.content:
            return None
        bild = Image.open(__import__("io").BytesIO(r.content)).convert("RGB")
    except Exception:
        return None
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(r.content)
    except Exception:
        pass                                # Cache ist Kuer, das Bild haben wir schon
    return bild


def _welt_xy(lat: float, lon: float, z: int) -> tuple[float, float]:
    """Web-Mercator-Weltpixel (Ursprung oben links) bei Zoom `z`."""
    n = KACHEL * 2 ** z
    x = (lon + 180.0) / 360.0 * n
    s = math.sin(math.radians(lat))
    y = (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * n
    return x, y


def hintergrund(lat_oben: float, lat_unten: float, lon_links: float, lon_rechts: float,
                breite: int, hoehe: int, ebene: str) -> Image.Image | None:
    """Kartenausschnitt als Bild in genau `breite` x `hoehe`, oder None wenn nichts zu holen war.

    Die Zuordnung Ausschnitt -> Bild ist LINEAR, nicht pixelgenau mercator-entzerrt. Das ist
    Absicht: das Teilen-Bild zeichnet den Track ueber eine flache Naeherung
    (`x = lon·111320·cos φ`, `y = lat·111320`, s. sharecard.py), und ueber die paar hundert Meter
    eines Spots weicht Mercator davon um rund 0,05 px ab — nachgerechnet, nicht geschaetzt. Wer
    hier einmal grosse Ausschnitte zeichnen will, muss das neu bewerten.
    """
    if ebene not in EBENEN or breite <= 0 or hoehe <= 0:
        return None
    lat_mitte = (lat_oben + lat_unten) / 2.0
    spanne_m = abs(lon_rechts - lon_links) * 111320.0 * math.cos(math.radians(lat_mitte))
    if spanne_m <= 0:
        return None
    # Zoom so, dass eine Kachel-Pixelreihe ungefaehr einer Bild-Pixelreihe entspricht.
    aufloesung = spanne_m / breite                      # Meter je Bildpixel
    z = int(round(math.log2(156543.03392 * math.cos(math.radians(lat_mitte)) / aufloesung)))
    z = max(1, min(MAX_ZOOM, z))

    x0, y0 = _welt_xy(lat_oben, lon_links, z)
    x1, y1 = _welt_xy(lat_unten, lon_rechts, z)
    if x1 <= x0 or y1 <= y0:
        return None
    kx0, ky0 = int(math.floor(x0 / KACHEL)), int(math.floor(y0 / KACHEL))
    kx1, ky1 = int(math.floor((x1 - 1e-6) / KACHEL)), int(math.floor((y1 - 1e-6) / KACHEL))
    n = 2 ** z
    anzahl = (kx1 - kx0 + 1) * (ky1 - ky0 + 1)
    if anzahl > 64:                                     # Reissleine gegen Ausreisser-Tracks
        return None

    mosaik = Image.new("RGB", ((kx1 - kx0 + 1) * KACHEL, (ky1 - ky0 + 1) * KACHEL), (24, 32, 48))
    auftraege = [(kx, ky) for ky in range(ky0, ky1 + 1) for kx in range(kx0, kx1 + 1)]
    with ThreadPoolExecutor(max_workers=8) as pool:
        bilder = list(pool.map(lambda t: _kachel(ebene, z, t[0] % n, t[1]), auftraege))
    if not any(b is not None for b in bilder):
        return None                                     # gar nichts bekommen -> kein Hintergrund
    for (kx, ky), b in zip(auftraege, bilder):
        if b is not None:
            mosaik.paste(b, ((kx - kx0) * KACHEL, (ky - ky0) * KACHEL))

    aus = mosaik.crop((round(x0 - kx0 * KACHEL), round(y0 - ky0 * KACHEL),
                       round(x1 - kx0 * KACHEL), round(y1 - ky0 * KACHEL)))
    return aus.resize((breite, hoehe), Image.LANCZOS)
