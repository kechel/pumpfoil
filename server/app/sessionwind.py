"""Wind am Spot waehrend einer Session (19.10.2026, Stand-Buch: wind_am_spot).

Fuer Wind-Sportarten zeigt die Session-Seite, wie der Wind am Spot war, und spaeter brauchen
Wenden/Halsen die Windrichtung (Bug durch den Wind = Wende, Heck = Halse). Quelle Open-Meteo
(keyless, CC-BY, wie `weather.py`), stuendliche Modellwerte in 10 m Hoehe — KEINE Messung am
Wasser, sondern das Wettermodell fuer diese Koordinate. Das steht so auch in der Anzeige.

Abruf nur serverseitig (kein Dritt-Skript im Browser, s. CLAUDE.md Datenschutz). Uebertragen werden
die Spot-Koordinate (auf 2 Nachkommastellen gerundet, ~1 km) und der Tag — wie beim Spot-Wetter.

- Sessions der letzten ~80 Tage: Forecast-API mit start_date/end_date (liefert Vergangenheit).
- Aelter: Archiv-API (ERA5), die hinkt ein paar Tage hinterher.

Das Ergebnis haengt nur an Ort und Zeit, aendert sich also nicht mehr.

Speicher je SPOT UND TAG (seit 19.10.2026, Jan: „muss ja nicht doppelt das gleiche abgerufen
werden"): data/wind/tage/<lat>_<lon>_<JJJJ-MM-TT>.json mit allen 24 Stunden des UTC-Tages, die
Koordinate auf 2 Nachkommastellen (dieselbe Rundung wie beim Abruf, ~1 km). Zwei Sessions am selben
Spot und Tag teilen sich damit einen Abruf, und spaetere Auswertungen (Windfenster je Spot, Tempo
je Windstaerke) finden den Wind vor. Gespeichert wird sofort, was da ist (Jan, 19.10.2026: „schauen
ob eine session eine uhrzeit danach braucht und dann ggf. aktualisieren, und dafuer immer direkt
speichern was wir schon haben"). Kommende Stunden des laufenden Tages liefert die Forecast-API als
Vorhersage — die werden mit `vorhersage: true` mitgespeichert (Jan: „waere dann die vorhersage nicht
auch schon eine erste Analyse wert?"). Braucht eine Session eine vergangene Stunde, die fehlt ODER
nur als Vorhersage vorliegt, wird der Tag neu geholt und gemerged; echte Werte ersetzen die
Vorhersage. Ist Open-Meteo dann nicht erreichbar, bleibt die Vorhersage als Rueckfall stehen, und
das Ergebnis traegt `vorhersage: true` (die Anzeige sagt es).
Die alten Dateien je Session (data/wind/<id>.json, bis 19.10.) werden weiter zuerst gelesen.
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


def _tag_pfad(lat: float, lon: float, tag):
    d = get_settings().data_dir / "wind" / "tage"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{round(lat, 2):.2f}_{round(lon, 2):.2f}_{tag.isoformat()}.json"


def _tage_holen(lat: float, lon: float, von: datetime, bis: datetime) -> dict:
    """{tag: [stunden]} fuer die UTC-Tage der Stunden von..bis. Aus dem Speicher, solange er jede
    gebrauchte (vergangene) Stunde hat; sonst EIN Abruf fuer die betroffenen Tage, Ergebnis gemerged
    und gleich gespeichert (nur vergangene Stunden)."""
    jetzt = datetime.now(timezone.utc)
    letzte_volle = jetzt.replace(minute=0, second=0, microsecond=0)
    tage, fehlt = {}, []
    t = von.date()
    while t <= bis.date():
        try:
            gespeichert = json.loads(_tag_pfad(lat, lon, t).read_text())
        except (OSError, ValueError):
            gespeichert = []
        tage[t] = gespeichert
        da = {s_["t"] for s_ in gespeichert if not s_.get("vorhersage")}
        # gebrauchte Stunden dieses Tages, soweit sie schon vorbei sind
        h = max(von, datetime(t.year, t.month, t.day, tzinfo=timezone.utc))
        ende = min(bis, datetime(t.year, t.month, t.day, 23, tzinfo=timezone.utc), letzte_volle)
        while h <= ende:
            if h.isoformat() not in da:
                fehlt.append(t)
                break
            h += timedelta(hours=1)
        t += timedelta(days=1)
    if not fehlt:
        return tage
    alt = (jetzt.date() - min(fehlt)) > timedelta(days=_FORECAST_TAGE)
    params = {
        "latitude": round(lat, 2), "longitude": round(lon, 2),
        "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m",
        "start_date": min(fehlt).isoformat(), "end_date": max(fehlt).isoformat(),
        "wind_speed_unit": "kmh", "timezone": "UTC",
    }
    try:
        r = httpx.get(ARCHIVE if alt else FORECAST, params=params, headers=_UA, timeout=8.0)
    except Exception:  # noqa: BLE001 — nicht erreichbar: mit dem weiter, was gespeichert ist
        return tage
    if r.status_code != 200:
        return tage
    h = (r.json() or {}).get("hourly") or {}
    neu: dict = {}
    for ts_s, v, d, g in zip(h.get("time", []), h.get("wind_speed_10m", []),
                             h.get("wind_direction_10m", []), h.get("wind_gusts_10m", [])):
        if v is None or d is None:
            continue
        ts = datetime.fromisoformat(ts_s).replace(tzinfo=timezone.utc)
        e = {"t": ts.isoformat(), "kmh": round(float(v), 1), "richtung": round(float(d)),
             "boeen_kmh": round(float(g), 1) if g is not None else None}
        if ts > letzte_volle:      # kommende Stunde: Vorhersage, als solche markiert
            e["vorhersage"] = True
        neu.setdefault(ts.date(), {})[ts.isoformat()] = e
    for tag in set(fehlt):
        if tag not in neu:
            continue
        zusammen = {s_["t"]: s_ for s_ in tage.get(tag, [])}
        for k, e in neu[tag].items():
            # Vorhersage ueberschreibt nie einen echten Wert
            if e.get("vorhersage") and k in zusammen and not zusammen[k].get("vorhersage"):
                continue
            zusammen[k] = e
        tage[tag] = [zusammen[k] for k in sorted(zusammen)]
        try:
            _tag_pfad(lat, lon, tag).write_text(json.dumps(tage[tag]))
        except OSError:
            pass
    return tage


def _abrufen(lat: float, lon: float, start: datetime, ende: datetime) -> list[dict]:
    # Die volle Stunde VOR dem Start bis zur vollen Stunde NACH dem Ende — eine 40-min-Session
    # bekommt so mindestens zwei Werte.
    von = start.replace(minute=0, second=0, microsecond=0)
    bis = ende.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    tage = _tage_holen(lat, lon, von, bis)
    out = []
    for tag in sorted(tage):
        for s_ in tage[tag]:
            ts = datetime.fromisoformat(s_["t"])
            if von <= ts <= bis:
                out.append(s_)
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
    if any(s_.get("vorhersage") for s_ in stunden):
        erg["vorhersage"] = True
    return erg


def vorholen(session_id: int) -> None:
    """Wind fuer eine Wind-Session gleich holen und cachen (Jan, 19.10.2026: „wir holen die wenn eine
    entsprechende session hochgeladen wird fuer einen spot … oder halt wenn jemand eine sportart auf
    eine wind-sportart umstellt nachtraeglich"). NICHT auf Vorrat fuer alle Spots und Tage. Eigene
    DB-Session, wirft nie — laeuft im Hintergrund nach Upload/Import/Umstellen."""
    try:
        from . import models, sportprofil
        from .db import SessionLocal
        db = SessionLocal()
        try:
            s = db.get(models.Session, session_id)
            if s is None or s.deleted or sportprofil.profil(s.sport_class)["gruppe"] != "wind":
                return
            session_wind(s.id, s.place_lat, s.place_lon, s.started_at, s.ended_at)
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — best effort
        pass
