"""Heatmap der Spot-Karte: WO auf dem Wasser gepumpt wird (Jan, 15.10.2026).

Jans Vorgaben:
  * „einfach den oeffentlichen Ort anzeigen, also halt Point Nemo auch" — verborgene Aufnahmen
    gehen genauso hinein, wie jeder sie sieht: formtreu nach Point Nemo versetzt (app/ortverbergen.py).
  * „zaehlen wuerde ich nur die Anzahl Sessions, nicht Laeufe" — eine Zelle zaehlt, wie viele
    SESSIONS dort gefahren sind; zehn Laeufe derselben Session durch dieselbe Zelle zaehlen einmal.
  * „inkl. der GPS-Tracks, wo genau gepumpt wurde" — gezeichnet werden nur die erkannten LAEUFE
    (Segmente `foiling`), nicht das Paddeln/Schwimmen dazwischen.
  * „Freunde / spezielle Rechte nicht beachten, exakt das gleiche fuer alle" — deshalb gibt es EINE
    Datei fuer alle, einmal taeglich vorgerechnet (scripts/heatmap-rechnen.py, Timer foil-heatmap).
  * umschaltbar „letzte 30 Tage" / „letztes Jahr".

RASTER: die Kacheln der Webkarte (Web-Mercator, wie OSM/Leaflet/osmdroid/MapKit). Feinste Stufe
z=21: am Aequator 19 m, am Bodensee (47,7°) 13 m, in Mittelfinnland (61°) 9 m — feiner als das
bringt bei 1-Hz-GPS der Uhren nichts mehr. Groebere Stufen bis z=3 entstehen durch Zusammenlegen,
und auch dort zaehlt jede Session je Zelle nur einmal. Die Karte fragt die Stufe ab, deren Zellen
bei ihrem Zoom etwa 16 Pixel gross sind.

Speicher: je Session die Zellen der feinsten Stufe in `data/heatmap/zellen.pkl` (nur neu oder
geaendert wird neu gerechnet — eine Session ist eine Zeile `track_geojson` von ~150 KB), das
Ergebnis je Zeitraum und Stufe als sortierte Arrays in `data/heatmap/heatmap.npz`.
"""
from __future__ import annotations

import json
import math
import os
import pathlib
import pickle
import time
from datetime import datetime, timedelta, timezone

import numpy as np

Z_MAX = 21
Z_MIN = 3
ZEITRAEUME = {"30d": 30, "365d": 365}
# Hoechstens so viele Zellen je Antwort; sonst eine Stufe groeber (s. `abfragen`).
MAX_ZELLEN = 6000

ORDNER = pathlib.Path(__file__).resolve().parent.parent / "data" / "heatmap"
ZELLEN_DATEI = ORDNER / "zellen.pkl"
ERGEBNIS_DATEI = ORDNER / "heatmap.npz"

_SHIFT = 32   # ix in den oberen Bits, iy in den unteren (2^21 < 2^32)
# Zwei Arten: „foil" = wo auf dem Foil gefahren wird (die Laeufe), „start" = wo die Laeufe beginnen.
ARTEN = ("foil", "start")
# Hochzaehlen, wenn sich aendert, was je Session im Cache steht (2: Startzellen dazu).
CACHE_VERSION = 3
# Startpunkte: eine Zelle erscheint erst ab so vielen LAEUFEN, die dort beginnen (Jan, 16.10.2026:
# „nur Zellen ab 2 Laeufen, nicht Sessions"). Ein einzelner Start mitten auf dem Wasser ist fast
# immer ein Ausreisser (GPS-Luecke vor dem Lauf, kurzer Fehlalarm); echte Startplaetze werden
# wiederholt genutzt. Die FARBE zaehlt weiter Sessions, wie bei den Laeufen.
START_MIN_LAEUFE = 2


def _praefix(art: str) -> str:
    """Schluessel in heatmap.npz: „foil" ohne Praefix (wie vor den Startpunkten), „start_" sonst."""
    return "" if art == "foil" else f"{art}_"


def kachel(lon: np.ndarray, lat: np.ndarray, z: int = Z_MAX) -> tuple[np.ndarray, np.ndarray]:
    """Kachel-Koordinaten (Web-Mercator) zu Laenge/Breite in Grad."""
    n = 1 << z
    lat = np.clip(lat, -85.05112878, 85.05112878)
    ix = np.floor((lon + 180.0) / 360.0 * n)
    r = np.radians(lat)
    iy = np.floor((1.0 - np.arcsinh(np.tan(r)) / math.pi) / 2.0 * n)
    return np.clip(ix, 0, n - 1).astype(np.int64), np.clip(iy, 0, n - 1).astype(np.int64)


def _packen(ix: np.ndarray, iy: np.ndarray) -> np.ndarray:
    return (ix.astype(np.int64) << _SHIFT) | iy.astype(np.int64)


def _entpacken(k: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    return k >> _SHIFT, k & ((1 << _SHIFT) - 1)


def _laeufe(track_geojson: str | dict, segments_json: str | list | None,
            verborgen: bool) -> list[list]:
    """Die Punkte je LAUF (Segmente `foiling`), bei verborgenen Aufnahmen am oeffentlichen Ort."""
    from .ortverbergen import geojson_versetzen
    gj = json.loads(track_geojson) if isinstance(track_geojson, str) else track_geojson
    if verborgen:
        # Die GANZE Spur versetzen und dann die Laeufe herausschneiden — so liegen sie genau dort,
        # wo jeder sie in der Session sieht (der Bezugspunkt ist der Mittelpunkt der ganzen Spur).
        gj = geojson_versetzen(gj)
    koord = (gj or {}).get("geometry", {}).get("coordinates") or []
    segs = json.loads(segments_json) if isinstance(segments_json, str) else (segments_json or [])
    laeufe = []
    for sg in segs:
        if sg.get("type") != "foiling":
            continue
        a, b = sg.get("i_start"), sg.get("i_end")
        if a is None or b is None:
            continue
        pts = [p for p in koord[max(0, int(a)): int(b) + 1]
               if p and len(p) >= 2 and p[0] is not None and p[1] is not None]
        if pts:
            laeufe.append(pts)
    return laeufe


def _zellen(pts: list, eindeutig: bool = True) -> np.ndarray:
    if not pts:
        return np.zeros(0, dtype=np.int64)
    arr = np.asarray(pts, dtype=float)[:, :2]
    ix, iy = kachel(arr[:, 0], arr[:, 1])
    k = _packen(ix, iy)
    return np.unique(k) if eindeutig else np.sort(k)


def zellen_der_session(track_geojson: str | dict, segments_json: str | list | None,
                       verborgen: bool) -> np.ndarray:
    """Die Zellen (Stufe Z_MAX, gepackt, eindeutig), durch die die LAEUFE dieser Session fuehren."""
    return _zellen([p for lauf in _laeufe(track_geojson, segments_json, verborgen) for p in lauf])


def startzellen_der_session(track_geojson: str | dict, segments_json: str | list | None,
                            verborgen: bool) -> np.ndarray:
    """Die Zellen, in denen die Laeufe dieser Session BEGINNEN — der erste Punkt je Lauf (Jan,
    16.10.2026: Heatmap umschaltbar „on-foil" / „starting positions"). EINE Zelle JE LAUF, also
    mit Wiederholungen: gebraucht fuer die Schwelle START_MIN_LAEUFE."""
    return _zellen([lauf[0] for lauf in _laeufe(track_geojson, segments_json, verborgen)],
                   eindeutig=False)


def _cache_laden() -> dict:
    try:
        with open(ZELLEN_DATEI, "rb") as f:
            return pickle.load(f)
    except (OSError, pickle.UnpicklingError, EOFError):
        return {}


def _atomar(pfad: pathlib.Path, schreiben) -> None:
    ORDNER.mkdir(parents=True, exist_ok=True)
    tmp = pfad.with_suffix(pfad.suffix + ".tmp")
    with open(tmp, "wb") as f:
        schreiben(f)
    os.replace(tmp, pfad)


def rechnen(db, jetzt: datetime | None = None, log=print) -> dict:
    """Alles neu aggregieren; Zellen je Session nur fuer neue/geaenderte Sessions neu rechnen.
    Liest nur — schreibt nichts in die Datenbank."""
    from sqlalchemy import func
    from .api.community import AR, S, U, _community
    from .ortverbergen import ist_verborgen, profil_verbirgt

    jetzt = jetzt or datetime.now(timezone.utc)
    t0 = time.time()
    seit = jetzt - timedelta(days=max(ZEITRAEUME.values()))
    # viewer_id=None: genau die Sessions, die die Community fuer ALLE zeigt (keine Freunde,
    # keine eigenen versteckten). accel_only=False: auch GPS-Aufnahmen haben Laeufe.
    rows = (_community(db.query(S.id, S.started_at, S.ort_sichtbarkeit, S.user_id, AR.id,
                                AR.algo_version, func.length(AR.track_geojson)),
                       viewer_id=None, accel_only=False, sport="pumpfoil")
            .filter(S.started_at >= seit, AR.track_geojson.isnot(None))
            .all())
    profil = {}
    cache = _cache_laden()
    neu_cache: dict = {}
    neu_gerechnet = 0
    for sid, gestartet, sicht, uid, ar_id, algo, laenge in rows:
        if uid not in profil:
            profil[uid] = profil_verbirgt(db.get(U, uid))
        verborgen = ist_verborgen(type("S", (), {"ort_sichtbarkeit": sicht})(), profil[uid])
        fp = (CACHE_VERSION, ar_id, algo, laenge, verborgen)
        alt = cache.get(sid)
        if alt is not None and alt[0] == fp:
            zellen, starts = alt[1], alt[3]
        else:
            gj, segs = db.query(AR.track_geojson, AR.segments_json).filter(AR.id == ar_id).one()
            try:
                zellen = zellen_der_session(gj, segs, verborgen)
                starts = startzellen_der_session(gj, segs, verborgen)
            except (ValueError, TypeError, KeyError) as e:   # kaputte Spur -> leer, nicht abbrechen
                log(f"Session {sid}: Spur unlesbar ({e})")
                zellen = starts = np.zeros(0, dtype=np.int64)
            neu_gerechnet += 1
        g = gestartet if gestartet.tzinfo else gestartet.replace(tzinfo=timezone.utc)
        neu_cache[sid] = (fp, zellen, g, starts)
    _atomar(ZELLEN_DATEI, lambda f: pickle.dump(neu_cache, f, protocol=pickle.HIGHEST_PROTOCOL))

    ausgabe: dict[str, np.ndarray] = {}
    bilanz = {}
    for art, spalte in (("foil", 1), ("start", 3)):
        for name, tage in ZEITRAEUME.items():
            grenze = jetzt - timedelta(days=tage)
            listen = [e[spalte] for e in neu_cache.values() if e[2] >= grenze and len(e[spalte])]
            if art == "foil":
                bilanz[name] = len(listen)
            for z in range(Z_MIN, Z_MAX + 1):
                d = Z_MAX - z
                if listen:
                    je, roh = [], []
                    for zl in listen:
                        ix, iy = _entpacken(zl)
                        grob = _packen(ix >> d, iy >> d)
                        je.append(np.unique(grob))   # je Session einmal je Zelle
                        roh.append(grob)
                    k, n = np.unique(np.concatenate(je), return_counts=True)
                    if art == "start":
                        # Laeufe je Zelle (mit Wiederholungen) -> Schwelle START_MIN_LAEUFE
                        kr, nr = np.unique(np.concatenate(roh), return_counts=True)
                        m = nr[np.searchsorted(kr, k)] >= START_MIN_LAEUFE
                        k, n = k[m], n[m]
                else:
                    k, n = np.zeros(0, dtype=np.int64), np.zeros(0, dtype=np.int64)
                ausgabe[f"{_praefix(art)}{name}_{z}_k"] = k
                ausgabe[f"{_praefix(art)}{name}_{z}_n"] = n.astype(np.int32)
    ausgabe["stand"] = np.array([jetzt.timestamp()])
    ausgabe["sessions"] = np.array([bilanz[n] for n in ZEITRAEUME])
    _atomar(ERGEBNIS_DATEI, lambda f: np.savez_compressed(f, **ausgabe))
    erg = {"sessions": bilanz, "neu_gerechnet": neu_gerechnet, "sekunden": round(time.time() - t0, 1)}
    log(f"Heatmap: {erg}")
    return erg


# --- Abfrage (je Worker gecacht, neu geladen, sobald die Datei sich aendert) ---------------------
_GELADEN: dict = {"mtime": None, "daten": None}


def _daten():
    try:
        mt = ERGEBNIS_DATEI.stat().st_mtime
    except OSError:
        return None
    if _GELADEN["mtime"] != mt:
        with np.load(ERGEBNIS_DATEI) as f:
            _GELADEN["daten"] = {k: f[k] for k in f.files}
        _GELADEN["mtime"] = mt
    return _GELADEN["daten"]


def abfragen(zeitraum: str, zoom: int, w: float, s: float, e: float, n: float,
             art: str = "foil") -> dict:
    """Zellen im Ausschnitt fuer den Kartenzoom `zoom`. Zellen etwa 16 Pixel (Stufe zoom+4); bei zu
    vielen eine Stufe groeber. `max` ist die Skala fuer die Farbe: das 98. Perzentil der GANZEN
    Stufe, damit sich die Farben beim Verschieben nicht aendern."""
    d = _daten()
    if d is None or zeitraum not in ZEITRAEUME or art not in ARTEN \
            or f"{_praefix(art)}{zeitraum}_{Z_MAX}_k" not in d:
        return {"z": None, "cells": [], "max": 1, "stand": None, "sessions": 0}
    stufe = max(Z_MIN, min(Z_MAX, int(zoom) + 4))
    while True:
        k, cnt = d[f"{_praefix(art)}{zeitraum}_{stufe}_k"], d[f"{_praefix(art)}{zeitraum}_{stufe}_n"]
        ix, iy = _entpacken(k)
        x0, y1 = kachel(np.array([w]), np.array([s]), stufe)
        x1, y0 = kachel(np.array([e]), np.array([n]), stufe)
        if w <= e:
            mx = (ix >= x0[0]) & (ix <= x1[0])
        else:   # ueber die Datumsgrenze
            mx = (ix >= x0[0]) | (ix <= x1[0])
        m = mx & (iy >= y0[0]) & (iy <= y1[0])
        if int(m.sum()) <= MAX_ZELLEN or stufe <= Z_MIN:
            break
        stufe -= 1
    skala = int(np.percentile(cnt, 98)) if len(cnt) else 1
    zellen = np.stack([ix[m], iy[m], cnt[m]], axis=1).tolist() if m.any() else []
    i = list(ZEITRAEUME).index(zeitraum)
    return {"z": stufe, "cells": zellen, "max": max(1, skala),
            "stand": datetime.fromtimestamp(float(d["stand"][0]), timezone.utc).isoformat(),
            "sessions": int(d["sessions"][i])}
