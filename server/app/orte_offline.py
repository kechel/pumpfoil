"""Naechste Ortschaft OHNE Netz — Rueckfall fuer die Spot-Benennung (Jan, 06.10.2026).

Anlass: Spots auf dem Meer blieben namenlos (13 Spots, 49 Sessions, auf der Karte unsichtbar).
Der Mittelpunkt liegt auf dem Wasser, oft auch der Startpunkt — Nominatim antwortet dort nur mit
„France métropolitaine", und die Umkreissuche ueber Overpass erreicht die VM nur noch ueber einen
Spiegel (places.OVERPASS_URLS). Diese Tabelle macht „naechster Ort" vom Netz unabhaengig.

Daten: GeoNames „cities1000" (alle Orte ab 1.000 Einwohner, ~171.000), Lizenz CC BY 4.0 — Nennung
im Impressum. Vorbereitet per scripts/orte-offline-bauen.py nach server/data/geo/orte.npz
(gitignored). Fehlt die Datei, liefert `naechster_ort` None und es aendert sich nichts.
"""
from __future__ import annotations

import math
import pathlib
import threading

import numpy as np

GEO = pathlib.Path(__file__).resolve().parents[1] / "data" / "geo"
QUELLE = GEO / "cities1000.txt"
DATEI = GEO / "orte.npz"
_BAUM = None
_NAMEN: list[str] = []
_LOCK = threading.Lock()


def _xyz(lat, lon):
    la, lo = np.radians(lat), np.radians(lon)
    return np.c_[np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)]


def bauen() -> int:
    """cities1000.txt (Tab-getrennt: id, name, asciiname, altnames, lat, lon, …) -> orte.npz."""
    namen, lat, lon = [], [], []
    with open(QUELLE, encoding="utf-8") as f:
        for zeile in f:
            t = zeile.rstrip("\n").split("\t")
            if len(t) < 6 or not t[1]:
                continue
            namen.append(t[1])
            lat.append(float(t[4]))
            lon.append(float(t[5]))
    np.savez_compressed(DATEI, xyz=_xyz(np.array(lat), np.array(lon)).astype(np.float32),
                        namen=np.array(namen, dtype=object))
    return len(namen)


def naechster_ort(lat: float, lon: float, max_km: float = 25.0) -> tuple[str, float] | None:
    """(Name, Abstand in km) der naechsten Ortschaft ab 1.000 Einwohnern, oder None (weiter als
    `max_km` oder Datei fehlt)."""
    global _BAUM, _NAMEN
    if _BAUM is None:
        with _LOCK:
            if _BAUM is None:
                if not DATEI.exists():
                    _BAUM = False
                else:
                    from scipy.spatial import cKDTree
                    d = np.load(DATEI, allow_pickle=True)
                    _NAMEN = list(d["namen"])
                    _BAUM = cKDTree(d["xyz"].astype(np.float64))
    if _BAUM is False:
        return None
    dist, i = _BAUM.query(_xyz(np.array([lat]), np.array([lon]))[0])
    km = 2 * math.asin(min(1.0, dist / 2)) * 6371.0
    if km > max_km:
        return None
    return str(_NAMEN[int(i)]), round(km, 1)
