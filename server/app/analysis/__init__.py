"""Analyse-Pipeline: GPS-Foile-Erkennung (MVP) + Accel-Pump-Analyse (Phase 2)."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import numpy as np
from sqlalchemy.orm import Session as DbSession

from .. import models, storage
from ..ml.features import magnitude_g, bandpass_fft, vertical_against_gravity, FILTER_BAND
from ..ml.pumps import analyze_accel, find_pumps_cadence
from .gps import analyze_gps

# Eine Pump-Frequenz (max/min) ist erst ab genügend Pumps aussagekräftig. Sehr kurze
# Läufe (z. B. 4 s / 2 Pumps nach einem Sturz) würden sonst Müll-Extrema wie 0,29 Hz
# in die Session-Statistik schreiben. Solche Läufe liefern keine Hz-Extrema.
MIN_PUMPS_FOR_HZ = 4


# Sportarten, bei denen ohne Beschleunigung eine grobe GPS-only-Foil-Erkennung
# versucht wird (Wassersport). Radfahren/Laufen/Ski bewusst NICHT (würden über-erkennen).
GPS_ONLY_SPORTS = {
    "surfing", "windsurfing", "kitesurfing", "wakeboarding", "wakesurfing",
    "sailing", "stand_up_paddleboarding", "paddling", "rowing", "kayaking",
    "open_water", "water_skiing", "generic", "pumpfoil", "foiling",
}


# Untergrenze für die Accel-Auswertung, GEMESSEN (nicht geschätzt). Darunter: gps_only.
#
# Die Schwelle stand bis 13.08. bei 15 Hz — gesetzt wegen der FR55, die 25 Hz meldet und real
# 2,5 Hz liefert. Sie traf damit aber auch SAUBERE 10-Hz-Aufnahmen: der Sparsam-Modus („lite",
# 10 Hz) verlor stillschweigend Pump-Zähler, Kadenz, Gleitphasen und das On-Foil-Modell. Ein
# Nutzer hat genau das gemeldet ("no pump count or the other derived data").
#
# Nachgemessen an 20 Sessions mit >50 Pumps, auf niedrigere Raten heruntergerechnet und durch
# DIESELBE Code-Strecke geschickt (Pumps je Lauf über find_pumps_cadence, On-Foil-Maske über
# predict_foiling_mask):
#     10,0 Hz -> Pumps -0,4 % (schlechteste Session 5 %), Maske 99,9 % identisch
#      8,0 Hz -> Pumps +2,5 % (schlechteste 13 %),        Maske 99,9 %
#      5,0 Hz -> Pumps +9,1 % (schlechteste 25 %),        Maske 99,6 %
#      2,5 Hz -> Pumps -14,3 % (schlechteste 36 %),       Maske 99,5 %
# Bei 2,5 Hz liegt Nyquist bei 1,25 Hz und damit MITTEN im Pump-Band (0,8-2,0 Hz) — dort ist die
# Kadenz physikalisch nicht mehr rekonstruierbar. Bei 8-10 Hz ist sie es. Gegenprobe an echten
# 10-Hz-Daten (nicht simuliert): 9,68 Hz gemessen -> 83 Pumps/min, genau im üblichen Band 80-100.
#
# Die Schwelle arbeitet auf der GEMESSENEN Rate (aus timebase), nicht auf der getaggten. Deshalb
# bleiben die FR55-Sessions mit real 2,5 Hz weiter draußen, obwohl sie 10 oder 25 Hz melden.
MODEL_MIN_ACCEL_HZ = 8.0


def _accel_spans_session(accel, scale) -> bool:
    """Deckt die Accel-Spur die ganze Session ab (bis zum GPS-Ende)? Streckt die Accel auf 20
    Zeit-Bins und vergleicht die Aktivität (|mag−median|-RMS) im letzten Abschnitt mit der Mitte.
    Aktiv am Ende -> spannt die Session (niedrige-aber-volle Rate). Still -> abgebrochen.
    Trennt Raten-Fehltag (samples/GPS-Dauer = wahre Rate) von echtem Aufzeichnungs-Abbruch."""
    if accel.shape[0] < 400:
        return True   # zu kurz für die Statistik -> nicht als Abbruch werten
    act = np.abs(magnitude_g(accel, scale) - 1.0)
    nb, bs = 20, accel.shape[0] // 20
    b = np.array([np.sqrt(np.mean(act[i * bs:(i + 1) * bs] ** 2)) for i in range(nb)])
    mid = float(np.median(b[5:15]))
    if mid <= 1e-9:
        return True   # praktisch keine Aktivität -> nicht als Abbruch interpretieren
    return float(np.median(b[-3:])) / mid > 0.4


def _gps_only_ok(sport) -> bool:
    return (sport or "").lower() in GPS_ONLY_SPORTS


# Bis zu diesem Zeitpunkt wurde ein FEHLGESCHLAGENER Overpass-Abruf als rings_json="" gecacht und
# hiess damit dauerhaft „hier ist kein Wasser" (Fix in 8b6e38f, 2026-08-01 08:34 +02). Solche
# Zeilen sind keine Aussage, sondern Narben einer Stoerung — sie werden EINMAL neu nachgeschlagen
# und dann ueberschrieben. Nichts wird geloescht: die Zeile wird aktualisiert und traegt danach ein
# frisches Datum, wird also nicht wieder angefasst. Stand 11.08.: 384 solche Zeilen, dazu 28 echte
# „kein Wasser" von nach dem Fix und 120 mit Ringen.
_CACHE_NARBEN_BIS = datetime(2026, 8, 1, 6, 34, tzinfo=timezone.utc)

# Nachschlagepunkt: nur Samples in Foil-/Paddel-Geschwindigkeit zaehlen. Darunter steht die Uhr
# (Pause, Auto-Parkplatz, Zuhause), darueber faehrt sie (Auto/Zug auf dem Heimweg).
WATER_POINT_SPEED_MPS = (1.0, 8.0)
WATER_POINT_MIN_SAMPLES = 20


def _water_lookup_point(gps_samples: list) -> tuple[float, float] | None:
    """Ort fuer die Wasser-Abfrage. Median NUR der bewegten Samples statt aller.

    Warum: der Median ALLER Punkte wandert dorthin, wo die Uhr am laengsten lag — nach der Session
    also nach Hause oder auf den Parkplatz. Befund #1328: Polygon bei 47.531,9.743 abgefragt, der
    Spot lag bei 47.510,9.752 -> 0 % Wasseranteil fuer ALLE sechs Laeufe, auch die echten. Die
    Korrektur `_clip_ends_to_water` lief damit ins Leere, ohne Schaden anzurichten, aber auch ohne
    Wirkung. Ein Geschwindigkeitsband trifft den Ort, an dem wirklich gefoilt/gepaddelt wurde, und
    braucht die Segmente noch nicht (die entstehen erst spaeter — Henne-Ei).
    """
    if not gps_samples:
        return None
    lo, hi = WATER_POINT_SPEED_MPS
    bewegt = [g for g in gps_samples
              if len(g) > 3 and g[3] is not None and lo <= float(g[3]) <= hi]
    quelle = bewegt if len(bewegt) >= WATER_POINT_MIN_SAMPLES else gps_samples
    return (float(np.median([g[1] for g in quelle])),
            float(np.median([g[2] for g in quelle])))


def _water_rings_cached(db: DbSession, gps_samples: list):
    """OSM-Wasserfläche (Polygon-Ringe) am Ort der Session, gecacht je ~111-m-Raster.
    rings_json="" = nachgeschlagen, kein Wasser. Netz-/Parse-Fehler -> None."""
    punkt = _water_lookup_point(gps_samples)
    if punkt is None:
        return None
    lat, lon = punkt
    key = f"{round(lat, 3)},{round(lon, 3)}"
    row = db.query(models.WaterPolygon).filter_by(grid_key=key).first()
    if row is not None:
        if row.rings_json:
            return json.loads(row.rings_json)
        erstellt = row.created_at
        if erstellt is not None and erstellt.tzinfo is None:
            erstellt = erstellt.replace(tzinfo=timezone.utc)
        if erstellt is None or erstellt >= _CACHE_NARBEN_BIS:
            return None            # echtes „nachgeschaut, kein Wasser"
        # sonst: Narbe aus der Stoerungszeit -> einmal neu nachschlagen (s. _CACHE_NARBEN_BIS)
    from ..places import OverpassUnavailable, lookup_water_rings

    try:
        rings = lookup_water_rings(lat, lon)
    except OverpassUnavailable:
        # NICHT cachen: ein fehlgeschlagener Abruf ist keine Aussage ueber Wasser.
        return None
    if row is not None:
        row.rings_json = json.dumps(rings) if rings else ""
        row.created_at = datetime.now(timezone.utc)   # frisches Datum -> gilt ab jetzt als Aussage
    else:
        db.add(models.WaterPolygon(grid_key=key, rings_json=json.dumps(rings) if rings else ""))
    db.commit()
    return rings


def _foiling_mask_for_accel(segments: list[dict], n_samples: int, accel_hz: int) -> np.ndarray:
    """Bool-Maske über die Accel-Samples: True, wenn die Sample-Zeit in ein
    Foiling-Segment (GPS) fällt. So werden Pumps nur während des Foilens gezählt."""
    mask = np.zeros(n_samples, dtype=bool)
    if n_samples == 0:
        return mask
    t_ms = np.arange(n_samples) / float(accel_hz) * 1000.0
    for seg in segments:
        mask |= (t_ms >= seg["t_start_ms"]) & (t_ms <= seg["t_end_ms"])
    return mask


def _fill_pump_hz(
    pump_hz: list,
    gps_t: np.ndarray,
    pts: np.ndarray,
    t_start_ms: float,
    t_end_ms: float,
    window_s: float = 5.0,
) -> None:
    """Trägt für jeden Trackpunkt innerhalb [t_start_ms, t_end_ms] die lokale
    Pump-Frequenz (Hz) in pump_hz ein. Frequenz = Pump-Peaks in einem ±window_s/2-
    Fenster, normiert auf die tatsächlich abgedeckte Zeit (Rand-robust). Gefenstert
    statt 1/Intervall -> einzelne Fehl-Peaks sprengen die Skala nicht."""
    if gps_t.size == 0:
        return
    pts = np.sort(np.asarray(pts, dtype=float))
    half = window_s * 1000.0 / 2.0
    i0 = int(np.searchsorted(gps_t, t_start_ms))
    i1 = int(np.searchsorted(gps_t, t_end_ms, side="right"))
    for idx in range(i0, min(i1, gps_t.size)):
        t = gps_t[idx]
        lo = max(t - half, t_start_ms)
        hi = min(t + half, t_end_ms)
        span_s = (hi - lo) / 1000.0
        if span_s <= 0:
            continue
        cnt = int(np.count_nonzero((pts >= lo) & (pts <= hi)))
        pump_hz[idx] = round(cnt / span_s, 3)


# --- Aussortierte Läufe: Zeitfenster statt Lauf-Index ---------------------------------
# Ein Lauf-Index taugt nicht als Anker: jede Neuanalyse nummeriert die Läufe neu (Detektor-
# Update -> „Lauf 18" ist plötzlich ein anderer). Gespeichert wird deshalb das ZEITFENSTER
# des Laufs (ms ab Session-Start, gleiche Basis wie trim_*).
EXCLUDE_MARGIN_MS = 1000  # Sicherheitsrand je Seite: Rand-Samples des Laufs sicher mit raus


def excluded_windows(session: "models.Session") -> list[tuple[int, int]]:
    """Aussortierte Zeitfenster der Session als [(start_ms, end_ms), …] (ms ab Session-Start).
    Kaputtes/leeres JSON -> keine Fenster (die Analyse darf daran nie scheitern)."""
    raw = getattr(session, "excluded_ranges", None)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    out: list[tuple[int, int]] = []
    for item in data if isinstance(data, list) else []:
        try:
            a, b = int(item[0]), int(item[1])
        except (TypeError, ValueError, IndexError):
            continue
        if b > a:
            out.append((max(a, 0), b))
    return sorted(out)


def dump_excluded_windows(wins: list[tuple[int, int]]) -> str | None:
    """Fensterliste -> JSON-Text für sessions.excluded_ranges (leer -> NULL)."""
    return json.dumps([[int(a), int(b)] for a, b in sorted(wins)]) if wins else None


AUTO_TRIM_MARGIN_MS = 15000  # 15 s Puffer vor erstem Start / nach letztem Ende


def maybe_auto_trim(db: DbSession, session: "models.Session") -> bool:
    """Setzt den Zuschnitt automatisch auf [erster Lauf-Start, letztes Lauf-Ende]
    (+ Puffer), wenn noch kein (manueller) Trim gesetzt ist. So fällt z. B. die
    Auto-Heimfahrt vor/nach der Foil-Session raus (auch fürs Veröffentlichen).
    Gibt True zurück, wenn ein Trim gesetzt wurde (-> neu analysieren)."""
    if session.trim_start_ms is not None or session.trim_end_ms is not None:
        return False
    res = db.query(models.AnalysisResult).filter_by(session_id=session.id).first()
    segs = json.loads(res.segments_json) if res and res.segments_json else []
    if not segs:
        return False
    first = min(int(s["t_start_ms"]) for s in segs)
    last = max(int(s["t_end_ms"]) for s in segs)
    new_start = max(0, first - AUTO_TRIM_MARGIN_MS)
    new_end = last + AUTO_TRIM_MARGIN_MS
    # Nur trimmen, wenn dadurch wirklich nennenswert etwas wegfällt (>30 s).
    gps = storage.load_gps(session.session_uuid)
    total_end = int(gps[-1][0]) if gps else new_end
    if new_start < 30000 and new_end > total_end - 30000:
        return False
    session.trim_start_ms = new_start
    session.trim_end_ms = new_end
    db.commit()
    return True


def attempt_distances(gps_samples, gps_hz) -> list:
    """Lauf-Distanzen unter dem 'attempts'-Preset (lockere Startversuch-Erkennung, ab ~8 km/h →
    keine Landgänge) — NUR für die Start-Erfolgsquote-Anzeige. Reine GPS-Segmentierung, erfasst
    auch kurze Fehlstartversuche, die die kanonische On-Foil-Erkennung nicht als Lauf zählt.
    Beeinflusst KEINE anderen Stats/Rekorde/Community."""
    from .gps import SENSITIVITY_PRESETS
    if not gps_samples:
        return []
    try:
        kw = SENSITIVITY_PRESETS.get("attempts") or {}
        r = analyze_gps(gps_samples, gps_hz=gps_hz or 1, **kw)
        return [round(float(s["distance_m"]), 1) for s in (r.get("segments") or [])
                if s.get("distance_m") is not None]
    except Exception:
        return []


def run_analysis(db: DbSession, session: "models.Session", final: bool = True) -> "models.AnalysisResult":
    """Lädt die Rohdaten der Session, rechnet die Analyse und persistiert das Ergebnis.

    final=False: Zwischenanalyse während noch laufender Aufnahme -> Status 'live'
    (Session wächst noch, kann mehrfach neu gerechnet werden). final=True: abgeschlossen.
    """
    gps_samples = storage.load_gps(session.session_uuid)
    accel = storage.load_accel(session.session_uuid)

    # Effektive Accel-Rate GENERISCH aus den Daten bestimmen (quellen-unabhängig): die Accel läuft
    # während der Aufnahme mit dem GPS mit (beide ab Start-Druck), also ist samples/GPS-Dauer die
    # WAHRE Rate — und ihre Verwendung synchronisiert Accel↔GPS exakt (Accel-Ende = GPS-Ende), damit
    # die Pump-Positionen an den richtigen GPS-Zeitpunkten sitzen. Wichtig: das gilt nur, wenn die
    # Accel-Spur die ganze Session abdeckt. Ist sie deutlich zu kurz bei EIGENTLICH modellfähiger
    # Rate (abgebrochene Aufzeichnung), NICHT strecken -> getaggte Rate behalten, Accel deckt nur
    # den Anfang ab (Rest via Accel-Abdeckungs-Cap bei den Gleitphasen).
    # --- EINE Accel-Zeitachse, dann auf ein GLEICHMÄSSIGES Raster ---------------------------
    # Alles Nachgelagerte rechnet `index = t * accel_hz`: die Foiling-Maske
    # (_foiling_mask_for_accel), die Pump-Fenster je Lauf (unten), die ML-Features
    # (foil_model.extract_features) und die Impuls-Erkennung (detect_jumps). Diese Annahme war
    # FALSCH, sobald die echte Rate von einer Durchschnittsrate abweicht — und sie tut das, sobald
    # die Uhr ihre Rate wechselt. Belegt an #1814 (Wear, docs/DATA-PIPELINE.md §9.1/§9.2): echte
    # 50,19 Hz gegen eine Durchschnittsrate von 49,041 Hz ergaben mitten in der Session **124 s**
    # Versatz -> der Detektor las Stillstand zwischen zwei Läufen, dadurch „die Pumps hören mitten
    # im Lauf auf" und eine 45-s-Gleitphase, die es nie gab.
    #
    # Statt die vier Umrechnungsstellen einzeln zu flicken, wird die Annahme hier WAHR gemacht:
    # timebase.py liefert die belastbarste Achse (t0_ms je Chunk > gemessene Rate > getaggte), und
    # der Accel wird auf ein exakt gleichmäßiges Raster dieser Rate gelegt. Wo die Achse schon
    # gleichmäßig war (measured_rate/uncertain — arange(n)/hz), ist das Raster identisch und die
    # Umsetzung ein No-Op; Zahlen ändern sich nur dort, wo die Wahrheit vorher verfehlt wurde.
    #
    # Der Ausschluss (excluded_ranges) wird hier bewusst NICHT an die Achse gegeben: er wirkt
    # weiter nur auf die GPS-Punkte (s. unten), damit der Accel das Trim-Fenster lückenlos
    # abdeckt und `index = t * accel_hz` gilt. Das ist die bisherige Semantik.
    from .timebase import _accel_chunk_counts, build_timebase

    ts0, ts1 = session.trim_start_ms, session.trim_end_ms
    lo = ts0 if ts0 is not None else 0
    hi = ts1 if ts1 is not None else (gps_samples[-1][0] if gps_samples else 0)

    accel_hz = float(session.accel_hz or 0.0)
    timebase_source = "none"
    if accel.shape[0] > 0 and gps_samples:
        _tb = build_timebase(
            gps_samples, accel, session.accel_scale, session.accel_hz,
            chunk_counts=_accel_chunk_counts(session.session_uuid),
            t0_by_index=storage.load_accel_t0(session.session_uuid),
            trim_start_ms=lo, trim_end_ms=hi, excluded_ranges=None,
        )
        timebase_source = _tb.source
        if _tb.has_accel and _tb.accel_hz and _tb.accel_hz > 0:
            accel_hz = round(float(_tb.accel_hz), 3)
            # Raster ab dem Trim-Beginn (= re-basierte Zeit 0), Schritt 1/accel_hz.
            src_ms = _tb.t_accel_ms - float(lo)
            n_grid = int(max(hi - lo, 0) / 1000.0 * accel_hz) + 1
            grid_ms = np.arange(n_grid) / accel_hz * 1000.0
            pick = np.clip(np.searchsorted(src_ms, grid_ms), 0, src_ms.size - 1)
            accel = _tb.accel[pick]
        else:
            accel = accel[0:0]

    # GPS aufs Fenster filtern + auf 0 re-basen -> alle nachfolgenden Berechnungen sehen nur den Teil.
    if (ts0 is not None or ts1 is not None) and gps_samples:
        gps_samples = [[s[0] - lo] + list(s[1:]) for s in gps_samples if lo <= s[0] <= hi]

    # Aussortierte Läufe (excluded_ranges): dieselbe Mechanik wie der Trim, nur mehrere
    # Fenster — und auch MITTEN in der Session (vergessene Stopp-Taste: Autofahrt zwischen
    # zwei Spots, Schleppen durch ein Boot, Kind auf dem Board). Die GPS-Punkte im Fenster
    # fallen weg; die entstehende Zeitlücke wirkt wie ein GPS-Dropout, deshalb trennt sie
    # (GAP_SPLIT_S) die Läufe davor/danach sauber, statt sie zu verbinden. Accel bleibt
    # unangetastet: ihr Index IST die Zeit (index = t * accel_hz), sie bleibt also zu den
    # verbleibenden GPS-Punkten synchron. Kein Detektor-Parameter wird angefasst.
    _excl = excluded_windows(session)
    if _excl and gps_samples:
        _off = (ts0 or 0) if (ts0 is not None or ts1 is not None) else 0  # GPS ist beim Trim auf 0 re-based
        _wins = [(a - _off, b - _off) for a, b in _excl]
        gps_samples = [s for s in gps_samples
                       if not any(a <= s[0] <= b for a, b in _wins)]

    # Accel nur nutzen, wenn die (effektive) Rate hoch genug fürs Modell ist — sonst wie gps_only.
    accel_usable = accel.shape[0] > 0 and accel_hz >= MODEL_MIN_ACCEL_HZ

    # Foiling-Maske: ML-Modell (GPS+Accel), Fallback = GPS-Heuristik in analyze_gps.
    from .foil_model import detect_jumps, predict_foiling_mask

    if accel_usable:
        mask_override = predict_foiling_mask(
            gps_samples, accel, accel_hz, session.accel_scale
        )
        # Präziser Start: nur starke Aufsprung-Impulse (Jump) zum Snappen verwenden.
        impulses = detect_jumps(accel, accel_hz, session.accel_scale)
        detection = "model"
    elif _gps_only_ok(session.sport):
        # Wassersport-FIT ohne Beschleunigung (z. B. Surf-Modus): nur grobe GPS-
        # Heuristik (Speed-Band + Glätte). Über-/Untererkennung möglich -> Warnung.
        mask_override = None  # -> analyze_gps nutzt die GPS-State-Machine
        impulses = None
        detection = "gps_only"
    else:
        # Ohne Beschleunigung lässt sich Foilen NICHT von Radfahren/Ski/Laufen trennen
        # (reines GPS über-erkennt) -> kein Foiling.
        import numpy as _np

        mask_override = _np.zeros(len(gps_samples), dtype=bool)
        impulses = None
        detection = "none"
    # OSM-Wasserfläche (gecacht je Ort) für die End-/Start-Marker-Korrektur. Nur in der
    # finalen Analyse (kein Netz im Live-Pfad); Fehler/kein Treffer -> None (keine Korrektur).
    water_rings = _water_rings_cached(db, gps_samples) if final else None

    # Die vom Besitzer gewählte Empfindlichkeit IST seine maßgebliche Analyse — überall gleich,
    # öffentlich wie privat (Community/Rekorde/Bestenlisten/Listen inklusive). normal =
    # Standardlimits; light/attempts = gelockert (kurze/langsame Startversuche zählen mit).
    from .gps import SENSITIVITY_PRESETS
    _owner = db.get(models.User, session.user_id)
    _sens = (getattr(_owner, "foil_sensitivity", None) or "normal")
    _preset_kw = SENSITIVITY_PRESETS.get(_sens) if _sens != "normal" else None
    # --- Schalter Erkennung v2 (docs/detector-v2.md) ---------------------------------------
    # ADDITIV: ohne DETECTOR_V2 laeuft exakt der bisherige Pfad. v2 baut Zeitachse, Zuschnitt und
    # Ausschluss selbst (Session-Koordinaten) und liefert das Ergebnis in der v1-Konvention
    # zurueck, damit alles Nachgelagerte unveraendert bleibt.
    from .detect_v2 import detector_v2_enabled

    if detector_v2_enabled():
        from .detect_v2 import analyze_session_v2

        # Fremdkraft nur beurteilen, wo PUMPFOIL behauptet wird. Eine vom Menschen als Wingfoil/
        # Efoil/Wake klassifizierte Session hat die Frage schon beantwortet — ihre Laeufe sind
        # gueltige Laeufe IHRER Sportart und gehoeren in die eigenen Statistiken. Befund bei der
        # v2-Einfuehrung: #1175 (owner-klassifiziert wingfoil) verlor sonst alle 4 Laeufe.
        _judge = (session.sport_class or "pumpfoil") == "pumpfoil"
        res = analyze_session_v2(session, judge_fremdkraft=_judge, **(_preset_kw or {}))
        res.pop("windows", None)
        res.pop("timebase", None)
        if detection == "none":
            # Gleiche Schranke wie v1: ohne Accel laesst sich Foilen nicht von Rad/Ski/Laufen
            # trennen -> keine Laeufe, egal was die Fenster sagen.
            res["segments"] = []
            res["foiling_time_s"] = 0.0
            res["foiling_distance_m"] = 0.0
            res["metrics"]["num_segments"] = 0
    else:
        res = analyze_gps(
            gps_samples, gps_hz=session.gps_hz,
            mask_override=mask_override, impulse_times_ms=impulses,
            water_rings=water_rings, **(_preset_kw or {}),
        )
    # Cache der aktiven Preset-Auswertung unter ihrem Schlüssel (für Detail-Overlay/Settings-
    # Vorschau); identisch zu den kanonischen Spalten oben.
    res_personal = res if _sens != "normal" else None
    res.setdefault("metrics", {})["detection"] = detection
    if accel.shape[0] > 0:
        res["metrics"]["accel_hz_effective"] = round(accel_hz, 2)   # tatsächliche Rate (kann != getaggt)
        # Herkunft der Achse, auf der Pumps/Gleitphasen WIRKLICH gerechnet wurden. Vorher log das
        # `time_base` aus dem v2-Block hier daneben (docs/DATA-PIPELINE.md §9.2) — jetzt ist es
        # dieselbe Achse, und dieses Feld belegt es je Session.
        res["metrics"]["accel_axis"] = timebase_source
    # Pumpfoil-Klassifikation:
    #  - mit Accel (model): der Pump/On-Foil-Erkennung vertrauen -> Foil-Läufe genügen.
    #  - ohne Accel (gps_only): zusätzlich Speed-Gate (<=30 km/h), da GPS allein unsicherer;
    #    alles schneller = angetrieben (Kite/Wind/Wake) -> kein Pumpfoil.
    from .gps import PUMPFOIL_GPS_MAX_MPS
    n_runs = len(res.get("segments") or [])
    max_sp = res.get("max_speed_mps") or 0.0
    if detection == "model":
        is_pumpfoil = n_runs > 0
    elif detection == "gps_only":
        is_pumpfoil = n_runs > 0 and max_sp <= PUMPFOIL_GPS_MAX_MPS
    else:
        is_pumpfoil = False
    # Admin-Override (z. B. „Aussortieren" aus der Verdachtsliste) schlägt den Detektor —
    # und überlebt so auch jede Reanalyse. NULL = automatisch.
    if session.pumpfoil_override is not None:
        is_pumpfoil = bool(session.pumpfoil_override)
    res["metrics"]["is_pumpfoil"] = bool(is_pumpfoil)
    session.is_pumpfoil = bool(is_pumpfoil)  # als Spalte persistieren (Listen-Filter)

    # Accel-Analyse (Pump-Count nur innerhalb der Foiling-Segmente).
    accel_res = None
    if accel_usable:
        fs = accel_hz
        mask = _foiling_mask_for_accel(res["segments"], accel.shape[0], accel_hz)
        accel_res = analyze_accel(accel, session.accel_scale, fs, foiling_mask=mask)
        # Pumps + Gleitphasen pro Segment (Glide = Lücke zwischen zwei Pump-Impulsen).
        # v3: Pump-Peaks auf dem VERTIKALEN Signal gegen die Schwerkraft, KADENZ-geführt
        # (find_pumps_cadence): pro lokaler Pump-Periode ein echter Peak. Gegen echte
        # Wahrheit (App-run_pumps + Jans Video-Taps) kalibriert; die alte Amplituden-
        # Schwelle (find_pumps_local) unter-erkannte ~2x (verschluckte kleine Pumps).
        mag = magnitude_g(accel, session.accel_scale)
        vsig = bandpass_fft(vertical_against_gravity(accel, session.accel_scale, fs), fs, *FILTER_BAND)
        t_ms = np.arange(mag.size) / fs * 1000.0
        gps_t = np.array([g[0] for g in gps_samples], dtype=float)  # gps-Zeit je Track-Punkt
        # Pro Trackpunkt eine lokale Pump-Frequenz (Hz) für die Karten-Einfärbung;
        # None außerhalb der Foiling-Läufe (dort gibt es keine Pump-Kadenz).
        pump_hz = [None] * int(gps_t.size)
        for seg in res["segments"]:
            a_lo = max(int(round(seg["t_start_ms"] / 1000.0 * fs)), 0)
            a_hi = min(int(round(seg["t_end_ms"] / 1000.0 * fs)), vsig.size)
            local_idx = find_pumps_cadence(vsig[a_lo:a_hi], fs) if a_hi > a_lo else np.empty(0, dtype=int)
            pts = (a_lo + local_idx) / fs * 1000.0
            seg["pumps"] = int(pts.size)
            # Pump-Positionen als Track-Index (für ein-/ausblendbare Marker auf der Karte).
            if pts.size and gps_t.size:
                idx = np.clip(np.searchsorted(gps_t, pts), 0, gps_t.size - 1)
                seg["pump_idx"] = [int(i) for i in idx]
            else:
                seg["pump_idx"] = []
            _fill_pump_hz(pump_hz, gps_t, pts, seg["t_start_ms"], seg["t_end_ms"])
            # Pump-Frequenz-Kennzahlen des Laufs: Ø (Gesamtschnitt = Pumps/Dauer)
            # sowie max/min aus dem 5s-gefensterten Verlauf.
            dur = seg.get("duration_s") or 0.0
            seg["avg_pump_hz"] = round(seg["pumps"] / dur, 3) if dur > 0 and seg["pumps"] >= 2 else None
            # max/min nur bei genügend Pumps (sonst statistisch sinnlos -> None).
            if seg["pumps"] >= MIN_PUMPS_FOR_HZ:
                seg_vals = [
                    pump_hz[k] for k in range(seg["i_start"], seg["i_end"] + 1)
                    if 0 <= k < len(pump_hz) and pump_hz[k] is not None
                ]
            else:
                seg_vals = []
            seg["max_pump_hz"] = round(max(seg_vals), 3) if seg_vals else None
            seg["min_pump_hz"] = round(min(seg_vals), 3) if seg_vals else None
            # Weitere Pro-Lauf-Insights.
            seg["t_to_first_pump_s"] = (
                round((float(pts.min()) - seg["t_start_ms"]) / 1000.0, 1) if pts.size else None
            )
            seg["dist_per_pump_m"] = (
                round(seg["distance_m"] / seg["pumps"], 1) if seg["pumps"] > 0 else None
            )
            seg["pumps_per_min"] = (
                round(seg["pumps"] / (dur / 60.0), 1) if dur > 0 and seg["pumps"] > 0 else None
            )
            if pts.size >= 1:
                ps = np.sort(pts)
                gaps = list(np.diff(ps) / 1000.0)               # zwischen den Pumps
                # Gleitphasen NUR über den accel-abgedeckten Bereich [a_lo, a_hi]: bricht die
                # Accel-Spur vor dem GPS-Lauf ab (verkürzte/abgebrochene Aufzeichnung), darf der
                # accel-lose Schwanz NICHT als riesige Gleitphase zählen (Befund Session 521).
                acc_start_ms = a_lo / fs * 1000.0
                acc_end_ms = a_hi / fs * 1000.0
                lead = (float(ps[0]) - acc_start_ms) / 1000.0   # Accel-Start -> 1. Pump
                tail = (acc_end_ms - float(ps[-1])) / 1000.0    # letzter Pump -> Accel-Ende
                glides = [g for g in ([lead] + gaps + [tail]) if g > 0]
                seg["num_glides"] = len(glides)
                seg["avg_glide_s"] = round(float(np.mean(glides)), 2) if glides else 0.0
                seg["longest_glide_s"] = round(float(max(glides)), 2) if glides else 0.0
            else:
                seg["num_glides"] = 0
                seg["avg_glide_s"] = 0.0
                seg["longest_glide_s"] = 0.0
        # Pump-Frequenz je Trackpunkt für den Karten-Farbmodus mitgeben.
        res["track_geojson"]["properties"]["pump_hz"] = pump_hz
        # Session-weite Pump-Frequenz-Kennzahlen (Ø = Gesamt-Pumps/Foiling-Zeit,
        # max/min aus den Lauf-Extrema — nur Läufe mit genügend Pumps zählen, damit
        # Mikro-Läufe keine Müll-Werte wie 0,29 Hz in die Session-Stats schreiben).
        seg_max = [s["max_pump_hz"] for s in res["segments"] if s.get("max_pump_hz") is not None]
        seg_min = [s["min_pump_hz"] for s in res["segments"] if s.get("min_pump_hz") is not None]
        total_pumps = sum(int(s.get("pumps", 0) or 0) for s in res["segments"])
        ft = res.get("foiling_time_s") or 0.0
        res.setdefault("metrics", {})
        res["metrics"]["avg_pump_hz"] = round(total_pumps / ft, 3) if ft > 0 else None
        res["metrics"]["max_pump_hz"] = round(max(seg_max), 3) if seg_max else None
        res["metrics"]["min_pump_hz"] = round(min(seg_min), 3) if seg_min else None

    result = db.query(models.AnalysisResult).filter_by(session_id=session.id).first()
    if result is None:
        result = models.AnalysisResult(session_id=session.id)
        db.add(result)

    result.algo_version = res["algo_version"]
    result.total_distance_m = res["total_distance_m"]
    result.foiling_distance_m = res["foiling_distance_m"]
    result.foiling_time_s = res["foiling_time_s"]
    result.max_speed_mps = res["max_speed_mps"]
    result.track_geojson = json.dumps(res["track_geojson"])
    result.segments_json = json.dumps(res["segments"])
    # Start-Erfolgsquote (nur Anzeige, ADDITIV): attempts-Preset-Lauf-Distanzen auf denselben
    # (getrimmten) GPS-Samples. Rührt keine anderen Felder/Stats an.
    result.start_attempts_json = json.dumps(attempt_distances(gps_samples, session.gps_hz))
    # Carve-Cache verwerfen (Segmente/Trim geändert) -> /community/carve-stats rechnet lazy neu.
    result.carve_s = result.carve_m = result.carve_l = None
    # Puls-Anstieg ebenso verwerfen — haengt an denselben Segmenten (api/sessions.py).
    result.hr_by_min_json = None
    # Preset-Cache: kanonisch (oben) bleibt Standard = Community. Das AKTUELLE Preset des Besitzers
    # (falls != normal) wird in sensitivity_json abgelegt; bereits gecachte andere Presets bleiben
    # erhalten -> Umschalten ohne Neurechnung. Der Besitzer sieht daraus v. a. die einzelnen Läufe.
    cache: dict = {}
    if result.sensitivity_json:
        try:
            cache = json.loads(result.sensitivity_json) or {}
        except ValueError:
            cache = {}
    if res_personal is not None:
        cache[_sens] = {
            "foiling_time_s": res_personal["foiling_time_s"],
            "foiling_distance_m": res_personal["foiling_distance_m"],
            "num_runs": int(res_personal.get("metrics", {}).get("num_segments") or len(res_personal.get("segments") or [])),
            "segments": res_personal["segments"],
        }
    result.sensitivity_json = json.dumps(cache) if cache else None
    from .preview import build_track_preview
    result.track_preview = build_track_preview(
        (res.get("track_geojson") or {}).get("geometry", {}).get("coordinates"), res["segments"]
    )
    metrics = res.get("metrics", {})
    result.metrics_json = json.dumps(metrics)

    # Denormalisierte Bestwerte je Kennzahl (Wert + Lauf-Index) für schnelle Aggregate.
    result.detection = metrics.get("detection")
    result.num_runs = int(metrics.get("num_segments") or 0)
    result.max_pump_hz = metrics.get("max_pump_hz")
    seg_key = {"distance": "distance_m", "duration": "duration_s", "speed": "max_speed_mps", "glide": "longest_glide_s"}
    best = {k: (0.0, None) for k in seg_key}
    for j, seg in enumerate(res["segments"]):
        for k, sk in seg_key.items():
            v = seg.get(sk) or 0.0
            if v > best[k][0]:
                best[k] = (v, j)
    result.best_distance_m, result.best_distance_idx = best["distance"]
    result.best_duration_s, result.best_duration_idx = best["duration"]
    result.best_speed_mps, result.best_speed_idx = best["speed"]
    result.best_glide_s, result.best_glide_idx = best["glide"]

    if accel_res is not None:
        # Headline-Pumpzahl = Summe der Segment-Pumps (gleiche v2-Erkennung wie die Marker),
        # nicht der separate analyze_accel-Wert -> Konsistenz zwischen Zahl und Karten-Markern.
        result.pump_count = int(total_pumps)
        result.avg_cadence_hz = res["metrics"].get("avg_pump_hz")
        result.accel_windows_json = json.dumps(accel_res["windows"])
    else:
        result.pump_count = None
        result.avg_cadence_hz = None
        result.accel_windows_json = None

    # --- Automatische Sportart-Einordnung (docs/sport-classification.md) -------------------------
    # NUR in der finalen Analyse und NUR, solange kein Mensch geurteilt hat. Die Maschine ist die
    # schwaechste Quelle: sie faellt kein Urteil ueber `owner`/`admin`, und wo sie unsicher ist,
    # behauptet sie keine Sportart, sondern stellt die Frage (needs_classification).
    # UND NUR, wo ueberhaupt Pumpfoil behauptet wird: der Profil-Standard (default_sport_class,
    # api/ingest.py) setzt die Klasse mit Quelle "default" — wer sein Profil auf Wingfoil/Efoil
    # gestellt hat, dessen Sessions sind schon richtig einsortiert, und ein "sieht nicht nach
    # Pumpfoil aus"-Hinweis waere dort Unsinn (Jan, 01.08.). Die Erkennung prueft die Behauptung
    # Pumpfoil, sie zweifelt keine anderslautende Einstellung an.
    if (final and (session.sport_source or "default") == "default"
            and (session.sport_class or "pumpfoil") == "pumpfoil"):
        from .sportauto import einordnen

        urteil = einordnen(res["segments"], gps_samples)
        if urteil is not None:
            session.sport_auto_json = json.dumps(urteil, ensure_ascii=False)
            session.sport_source = "auto"
            if urteil["sport_class"]:
                session.sport_class = urteil["sport_class"]
            else:
                # Keine belegbare Klasse -> in KEINER Auswertung, bis der Besitzer zuordnet.
                session.needs_classification = True

    session.status = "analyzed" if final else "live"
    db.commit()
    db.refresh(result)
    return result
