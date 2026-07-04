"""GPS-basierte Foile-Erkennung (MVP).

State-Machine statt nacktem Speed-Threshold:
  Ein Sample gilt als "Kandidat foilend", wenn gleichzeitig
    - geglättete Geschwindigkeit >= ENTER_SPEED  (bzw. >= EXIT_SPEED zum Halten), und
    - die kurzfristige Speed-Varianz niedrig ist (CV < MAX_CV; Gleiten ist glatt,
      Paddeln/Anschieben choppy), und
    - die GPS-Genauigkeit brauchbar ist (h_acc <= MAX_HACC, falls vorhanden).
  Hysterese + Dwell: foilend wird man erst nach ENTER_DWELL_S anhaltender Kandidatur,
  und verlässt den Zustand erst nach EXIT_DWELL_S. Segmente < MIN_SEGMENT_S werden verworfen.

Alle Schwellen sind hier zentral als Konstanten — Tuning erfolgt mit echten Sessions.
"""
from __future__ import annotations

import numpy as np

from .geo import haversine_m, step_distances_m

ALGO_VERSION = "gps-mvp-2"

# --- Tuning-Konstanten (m/s, s, Meter) ---
# Foilen passiert in einem charakteristischen Speed-Band (~8-25 km/h), meist mit
# abruptem Start/Ende. Wir gaten Kandidaten auf dieses Band: zu langsam = paddeln/
# im Wasser, zu schnell = vermutlich GPS-Ausreißer oder andere Fortbewegung.
# Physik: das größte Foil trägt erst ab ~10 km/h; darunter droppt es -> kein Foiling.
ENTER_SPEED = 2.8          # ~10 km/h: untere Schwelle für foile-Kandidat
EXIT_SPEED = 2.5           # ~9 km/h: darunter (gehalten) -> raus (Hysterese)
MAX_FOIL_SPEED = 7.0       # ~25 km/h: obere Bandgrenze (darüber kein Foile-Kandidat)
MAX_CV = 0.25             # max. Variationskoeffizient der Speed im Glättungsfenster
MAX_HACC = 15.0           # max. horizontale GPS-Ungenauigkeit in m (None = ignorieren)
SMOOTH_WINDOW_S = 3        # Median-Glättung der Geschwindigkeit
ENTER_DWELL_S = 3          # so lange Kandidat -> Zustand "foilend"
EXIT_DWELL_S = 3          # so lange kein Kandidat -> Zustand verlassen
MIN_SEGMENT_S = 5          # kürzere Foil-Segmente verwerfen
GAP_SPLIT_S = 15           # GPS-Lücke darüber = Dropout (Sturz/Schwimmen) -> Lauf endet hier
MOVE_FLOOR_MPS = 2.0       # gps_only: Mindest-Positionsbewegung fürs Foilen (~7 km/h)
MAX_STEP_M = 60.0         # Teleport-Ausreißer (GPS-Sprung) clampen
OUTLIER_STEP_M = 25.0     # 1-s-Schritt darüber (~>90 km/h) = GPS-Glitch -> reparieren
# Ein echter Lauf hält ~10-22 km/h; schnelles Gehen an Land nur ~7-8 km/h.
# Segmente mit zu niedrigem Ø-Speed sind keine echten Foil-Läufe -> verwerfen.
MIN_SEG_AVG_SPEED = 2.8   # ~10 km/h
GAP_FILL_S = 2            # ML-Maske: Lücken bis 2 s schließen (Gleit-Pausen)
# Prinzip: ein START setzt voraus, dass man davor langsam/stehend war. Lagen zwischen
# zwei erkannten Läufen NIE ein echter Stopp (Speed blieb über NOSTOP_SPEED) und kein
# GPS-Dropout, ist es in Wahrheit EIN Lauf (Modell-Aussetzer) -> mergen, egal wie lang.
# 1.5 m/s (~5,4 km/h): darunter = echter Stopp (abgesunken/gestanden/gestürzt), darüber nur
# ein Soft-Moment/Touchdown zwischen Pumps (auf dem Foil hält man <5 km/h nicht). Trennt in
# #361 sauber die Soft-Moments (dip 1,9-2,7) von echten Stopps (dip ~0) -> 22 Läufe (Markus'
# Wahrheit); übrige Sessions regressionsgeprüft unverändert. War 2,8 = zu hoch (zerhackte Cruises).
NOSTOP_SPEED = 1.5
IMPULSE_BACK_S = 3        # Aufsprung-Impuls bis 3 s VOR dem erkannten Start suchen
IMPULSE_FWD_S = 2         # ... bis 2 s danach
SPEED_SPIKE_MPS = 2.5     # 1-s-Speed-Abweichung darüber (~9 km/h) = Glitch -> clampen
GLITCH_SPEED_MPS = 90.0 / 3.6   # darüber = sicher GPS-Glitch -> gegen Median ersetzen
# --- Mehrsekündige Doppler-Bursts abfangen (2026-07-04) ---------------------------------
# Befund: GPS-only-Sessions (Polar-Import) enthalten kurze (~3 s) Doppler-Bursts, die WEIT
# über der echten Fahrt liegen, aber UNTER GLITCH_SPEED (90) bleiben. Beispiele:
#   • Session #428 (James): sonst p99=18,6 km/h, aber Sek. 3390-3392 = 56/48/49 km/h.
#   • Session #410 (James): sonst ≤23 km/h, aber ein 3-s-Blip auf 30-33 km/h.
#   • Session #71  (Jan):   221-s-Test, 95 % Stillstand, 2-s-Start-Blip auf 29-30 km/h.
# Ein 3-s-Burst füllt das 3-s- UND 5-s-Median-Fenster -> der geglättete Max bleibt hoch und
# reißt das 30-km/h-Pumpfoil-Gate (unten) -> Session fälschlich als „kein Pumpfoil" aussortiert
# (+ falscher Topspeed-Rekord). Fix: gegen einen robusten 15-s-Median ersetzen, der gegen
# kurze (bis ~halbes Fenster) Bursts unempfindlich ist.
# Zwei Bedingungen, damit KEIN echter Lauf beschnitten wird (validiert über alle 381 Sessions):
#   1) mehr als BURST_MARGIN über dem 15-s-Median  (relativ: isolierter Ausreißer)
#   2) UND absolut über BURST_ABS_MIN (~28 km/h)    (schützt normale Foil-Läufe: ein 20-km/h-
#      Lauf in einer idle-lastigen Session hätte sonst allein über Median+Marge ausgelöst).
# Regressions-Check: nur #428 & #410 (James) kippen korrekt auf pumpfoil=true; #71 (echter
# 2-s-Start-Glitch, keine echte Session) kippt korrekt auf false; sonst keine Klassifikations-
# Änderung, alle betroffenen Topspeeds nur nach unten (Glitch-Bereinigung).
# Kausaler Despike (Beschleunigung): ein Wert, der den Median der letzten Sekunden um mehr
# als SPIKE_JUMP übersteigt UND absolut hoch ist, ist ein physikalisch unmöglicher Sprung
# (GPS-Glitch). Wirkt auch am TRACK-ENDE, wo symmetrische Median-Filter durch Rand-Padding
# versagen — z. B. Session #426 (Jan): letzter Punkt springt 15->33 km/h (+18/s, normal p95 +4).
SPIKE_JUMP_MPS = 4.0            # ~14 km/h über dem Rückwärts-Median = unmöglich
SPIKE_ABS_MIN_MPS = 20.0 / 3.6  # nur oberhalb ~20 km/h prüfen (langsame Übergänge unangetastet)
SPIKE_TRAIL_WIN_S = 5
BURST_MARGIN_MPS = 5.0          # ~18 km/h über 15-s-Median …
BURST_ABS_MIN_MPS = 28.0 / 3.6  # … UND absolut über ~28 km/h (echte Pump-Läufe bleiben unberührt)
BURST_MEDIAN_WIN_S = 15
PUMPFOIL_GPS_MAX_MPS = 30.0 / 3.6   # OHNE Accel: geglätteter Max darüber = angetrieben = kein Pumpfoil
# Ende-Klassifikation: Sturz = abrupter Einbruch von "auf Foil" -> "im Wasser".
FALL_ONFOIL_MPS = 3.0     # ~11 km/h: am Lauf-Ende klar noch auf dem Foil
FALL_WATER_MPS = 1.7      # ~6 km/h: kurz danach praktisch im Wasser
FALL_LOOKAHEAD_S = 3      # Fenster nach dem Lauf-Ende für den Speed-Abfall


def _repair_spikes(lat: np.ndarray, lon: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Einzelpunkt-GPS-Glitches glätten: springt ein Punkt weit von beiden Nachbarn weg,
    während die Nachbarn selbst nah beieinander liegen (raus-und-zurück), wird er durch
    die Mitte der Nachbarn ersetzt. So verschwinden Karten-Spikes + Falsch-Distanzen."""
    lat = lat.copy(); lon = lon.copy()
    n = lat.size
    for i in range(1, n - 1):
        d_prev = float(haversine_m(lat[i - 1], lon[i - 1], lat[i], lon[i]))
        d_next = float(haversine_m(lat[i], lon[i], lat[i + 1], lon[i + 1]))
        d_skip = float(haversine_m(lat[i - 1], lon[i - 1], lat[i + 1], lon[i + 1]))
        if d_prev > OUTLIER_STEP_M and d_next > OUTLIER_STEP_M and d_skip < OUTLIER_STEP_M:
            lat[i] = (lat[i - 1] + lat[i + 1]) / 2.0
            lon[i] = (lon[i - 1] + lon[i + 1]) / 2.0
    return lat, lon


def _running_median(x: np.ndarray, win: int) -> np.ndarray:
    if win <= 1 or x.size == 0:
        return x.astype(float)
    half = win // 2
    padded = np.pad(x.astype(float), half, mode="edge")
    out = np.empty_like(x, dtype=float)
    for i in range(x.size):
        out[i] = np.median(padded[i : i + win])
    return out


def _running_cv(speed: np.ndarray, win: int) -> np.ndarray:
    """Variationskoeffizient (std/mean) in gleitendem Fenster."""
    if speed.size == 0:
        return speed.astype(float)
    half = max(win // 2, 1)
    padded = np.pad(speed.astype(float), half, mode="edge")
    cv = np.empty_like(speed, dtype=float)
    for i in range(speed.size):
        w = padded[i : i + 2 * half + 1]
        m = w.mean()
        cv[i] = (w.std() / m) if m > 1e-6 else 999.0
    return cv


def _close_gaps(mask: np.ndarray, max_gap: int) -> np.ndarray:
    """Schließt False-Lücken bis max_gap, die zwischen True-Bereichen liegen."""
    if mask.size == 0:
        return mask
    out = mask.copy()
    i = 0
    n = out.size
    while i < n:
        if not out[i]:
            j = i
            while j < n and not out[j]:
                j += 1
            if 0 < i and j < n and (j - i) <= max_gap:
                out[i:j] = True
            i = j
        else:
            i += 1
    return out


def _heuristic_mask(speed_s, cv, quality_ok, gps_hz: int) -> np.ndarray:
    """GPS-State-Machine (Hysterese + Dwell) als Fallback, wenn kein ML-Modell da ist."""
    n = speed_s.size
    enter_dwell = max(int(round(ENTER_DWELL_S * gps_hz)), 1)
    exit_dwell = max(int(round(EXIT_DWELL_S * gps_hz)), 1)
    mask = np.zeros(n, dtype=bool)
    foiling = False
    cand_streak = 0
    noncand_streak = 0
    for i in range(n):
        if not foiling:
            cand = ENTER_SPEED <= speed_s[i] <= MAX_FOIL_SPEED and cv[i] < MAX_CV and quality_ok[i]
            cand_streak = cand_streak + 1 if cand else 0
            if cand_streak >= enter_dwell:
                foiling = True
                noncand_streak = 0
                mask[i - enter_dwell + 1 : i + 1] = True
        else:
            hold = EXIT_SPEED <= speed_s[i] <= MAX_FOIL_SPEED and quality_ok[i]
            noncand_streak = 0 if hold else noncand_streak + 1
            if noncand_streak >= exit_dwell:
                foiling = False
                cand_streak = 0
            else:
                mask[i] = True
    return mask


def analyze_gps(samples: list, gps_hz: int = 1, mask_override=None, impulse_times_ms=None,
                water_rings=None) -> dict:
    """samples: Liste von [t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m].

    Gibt dict mit Kennzahlen, Segmenten und GeoJSON-Track zurück.
    """
    if len(samples) < 2:
        return {
            "algo_version": ALGO_VERSION,
            "total_distance_m": 0.0,
            "foiling_distance_m": 0.0,
            "foiling_time_s": 0.0,
            "max_speed_mps": 0.0,
            "track_geojson": _track_geojson([]),
            "segments": [],
        }

    arr = np.array([[s[0], s[1], s[2]] for s in samples], dtype=float)
    t_ms = arr[:, 0]
    lat = arr[:, 1]
    lon = arr[:, 2]
    speed_raw = np.array(
        [s[3] if len(s) > 3 and s[3] is not None else np.nan for s in samples],
        dtype=float,
    )
    hacc = np.array(
        [s[5] if len(s) > 5 and s[5] is not None else np.nan for s in samples],
        dtype=float,
    )
    hr = np.array(
        [s[4] if len(s) > 4 and s[4] is not None else np.nan for s in samples],
        dtype=float,
    )

    # GPS-Glitches reparieren (Spike raus-und-zurück), dann Schrittdistanzen + Clamp.
    # Einzelschritte über OUTLIER_STEP_M (~>90 km/h in 1 s) sind unmöglich (GPS-Catch-up
    # z. B. beim Reinfallen) -> zählen nicht zur Distanz.
    lat, lon = _repair_spikes(lat, lon)
    step = step_distances_m(lat, lon)
    step = np.where(step > OUTLIER_STEP_M, 0.0, step)

    # Fehlende Speed aus Position/Zeit ableiten.
    dt = np.diff(t_ms, prepend=t_ms[0]) / 1000.0
    dt = np.where(dt <= 0, 1.0 / max(gps_hz, 1), dt)
    speed_from_pos = step / dt
    speed = np.where(np.isnan(speed_raw), speed_from_pos, speed_raw)

    # Unmögliche GPS-Spikes (auch mehrsekündige Bursts) gegen einen langen 15-s-Median
    # ersetzen -> echter Max-Speed bleibt erhalten (für die Pumpfoil-Klassifikation).
    over = speed > GLITCH_SPEED_MPS
    if over.any():
        med_long = _running_median(np.where(over, 0.0, speed), max(int(round(15 * gps_hz)), 1))
        speed = np.where(over, med_long, speed)

    # Mehrsekündige Doppler-Bursts (unter GLITCH_SPEED) gegen den robusten 15-s-Median
    # ersetzen. Doppelbedingung (relativ + absolut) — Details/Beispiele/Regressions-Check
    # siehe Konstanten-Block oben (BURST_MARGIN_MPS / BURST_ABS_MIN_MPS, 2026-07-04).
    # Der 15-s-Median ist gegen kurze (≤ ~halbes Fenster) Bursts unempfindlich; echte
    # gehaltene Passagen heben ihn selbst mit an und werden daher NICHT beschnitten.
    med_burst = _running_median(speed, max(int(round(BURST_MEDIAN_WIN_S * gps_hz)), 1))
    burst = (speed > med_burst + BURST_MARGIN_MPS) & (speed > BURST_ABS_MIN_MPS)
    if burst.any():
        speed = np.where(burst, med_burst, speed)

    # Isolierter Despike: ein einzelner Ausreißer, der ÜBER BEIDEN Nachbarn liegt (>SPIKE_JUMP)
    # und absolut hoch ist, ist ein GPS-Glitch (Details/Beispiel #426 siehe Konstanten oben).
    # Bewusst nur Einzel-Peaks — echte, gehaltene Pump-Anstiege (beide Nachbarn ebenfalls hoch)
    # bleiben unangetastet, damit sich die Lauf-Erkennung nicht verschiebt. Wirkt auch am Rand.
    n = speed.size
    if n >= 2:
        cleaned = speed.copy()
        for i in range(n):
            prev = cleaned[i - 1] if i > 0 else speed[i + 1]
            nxt = speed[i + 1] if i < n - 1 else cleaned[i - 1]
            ref = prev if prev < nxt else nxt
            if speed[i] > ref + SPIKE_JUMP_MPS and speed[i] > SPIKE_ABS_MIN_MPS:
                cleaned[i] = ref
        speed = cleaned

    # Einzel-Sekunden-Ausreißer (GPS-Doppler-Glitches) gegen lokalen Median clampen
    # -> keine Lone-Spike-Farbsegmente; saubere Basis für alle Glättungen.
    med5 = _running_median(speed, max(int(round(5 * gps_hz)), 1))
    spike = np.abs(speed - med5) > SPEED_SPIKE_MPS
    speed = np.where(spike, med5, speed)

    win = max(int(round(SMOOTH_WINDOW_S * gps_hz)), 1)
    speed_s = _running_median(speed, win)
    speed5 = _running_median(speed, max(int(round(5 * gps_hz)), 1))
    cv = _running_cv(speed_s, win)
    # Aus der tatsächlichen Positionsbewegung abgeleitete Geschwindigkeit (geglättet).
    # Dient als Realitäts-Check gegen ein unzuverlässiges enhanced_speed-Feld
    # (z. B. beim Zurückschwimmen meldet die Uhr Tempo, obwohl man kaum vom Fleck kommt).
    pos_speed_s = _running_median(speed_from_pos, win)

    quality_ok = np.isnan(hacc) | (hacc <= MAX_HACC)

    # Foiling-Maske: entweder vom ML-Modell (Override) oder aus der GPS-Heuristik.
    if mask_override is not None:
        mask = np.asarray(mask_override, dtype=bool)
        if mask.size != len(samples):
            m2 = np.zeros(len(samples), dtype=bool)
            nn = min(mask.size, len(samples))
            m2[:nn] = mask[:nn]
            mask = m2
        # Kurze Modell-Lücken schließen (Gleit-Pausen zerteilen keinen Lauf).
        mask = _close_gaps(mask, max(int(round(GAP_FILL_S * gps_hz)), 1))
    else:
        mask = _heuristic_mask(speed_s, cv, quality_ok, gps_hz)

    # Physischer Floor: unter EXIT_SPEED (~9 km/h) trägt kein Foil -> nie foilend,
    # auch wenn das Modell so sagt (entfernt Slow-Ränder/Near-Stops aus Läufen).
    mask = mask & (speed_s >= EXIT_SPEED)
    # Echte Positionsbewegung verlangen (auch bei Accel): kein Vortrieb über Wasser =
    # nicht auf Foil. Schließt Phasen aus, in denen das Speed-Feld foilt, die GPS-Position
    # aber steht (Zurückschwimmen, Dropout, Pumpen auf der Stelle).
    mask = mask & (pos_speed_s >= MOVE_FLOOR_MPS)

    speeds = {"1": speed, "3": speed_s, "5": speed5}
    segments = _segments_from_mask(mask, t_ms, gps_hz, step, speeds)
    # Läufe ohne echten Stopp dazwischen zusammenführen (kein Fake-Start bei
    # kurzen Modell-Aussetzern mitten im Lauf).
    segments = _merge_no_stop(segments, speed_s, t_ms, step, speeds, gps_hz)

    # Lauf-Start exakt auf den Aufsprung-Accel-Impuls snappen (sub-sekundengenau,
    # generisch/ortsunabhängig). impulse_times_ms relativ zum Session-Start.
    if impulse_times_ms is not None and len(segments):
        segments = _snap_starts_to_impulses(segments, t_ms, step, speeds, np.asarray(impulse_times_ms, dtype=float))
    # Verpassten Aufsprung/Beschleunigung am Start nachholen (Speed schon im Foil-Band).
    segments = _extend_starts_back(segments, speed_s, t_ms, step, speeds)
    # Dead-Reckoning-Drift am Ende verwerfen (Uhr untergetaucht) -> echtes Ende.
    segments = _repair_deadreckoning(segments, lat, lon, t_ms, step, speeds, gps_hz)
    # Ground Truth: End-/Start-Marker müssen im Wasser liegen (OSM-Wasserfläche). Fängt
    # Drift ab, die der ortsunabhängige Prior nicht erwischt (Drift schräg zur Start-Achse).
    if water_rings:
        segments = _clip_ends_to_water(segments, lat, lon, water_rings, t_ms, step, speeds)

    # Maske aus den FINALEN Segmenten neu aufbauen -> Distanz/Metriken nur echte Läufe.
    mask = np.zeros(len(samples), dtype=bool)
    for seg in segments:
        mask[seg["i_start"] : seg["i_end"] + 1] = True

    # Lauf-Ende klassifizieren: Sturz vs. kontrollierter Stopp (GPS-Speed danach).
    for seg in segments:
        seg["end_type"], seg["end_decel_mps2"] = _classify_end(seg["i_end"], speed_s, step, gps_hz)

    # Start-/Ende-Punkt für die Karten-Marker. Start wird auf den exakten Aufsprung-
    # Zeitpunkt zwischen den GPS-Samples interpoliert (sonst auf das nächste Sample).
    for seg in segments:
        st = seg.pop("_start_t_exact", None)
        if st is None:
            st = float(t_ms[seg["i_start"]])
        seg["start_pt"] = _interp_lonlat(t_ms, lat, lon, st)
        ie = seg["i_end"]
        seg["end_pt"] = [round(float(lon[ie]), 6), round(float(lat[ie]), 6)]

    total_distance = float(step.sum())
    foiling_distance = float(step[mask].sum())
    foiling_time = float(sum(seg["t_end_ms"] - seg["t_start_ms"] for seg in segments) / 1000.0)
    max_speed = float(np.nanmax(speed_s)) if speed_s.size else 0.0

    # speed5 (5-s-geglättet) wurde oben bereits berechnet (für Segment- + Metrik-Stats).
    def _stat(arr, fn, scale=1.0, nd=2):
        a = arr[mask]
        a = a[~np.isnan(a)]
        return round(float(fn(a)) * scale, nd) if a.size else None

    hr_valid = hr[~np.isnan(hr)]
    longest_s = max((s["duration_s"] for s in segments), default=0.0)
    farthest_m = max((s["distance_m"] for s in segments), default=0.0)

    metrics = {
        "num_segments": len(segments),
        "avg_hr": int(round(float(hr_valid.mean()))) if hr_valid.size else None,
        "max_hr": int(np.nanmax(hr)) if hr_valid.size else None,
        "avg_speed_mps": _stat(speed_s, np.mean),
        "max_speed_5s_mps": _stat(speed5, np.max),
        "min_speed_5s_mps": _stat(speed5, np.min),
        "longest_segment_s": round(longest_s, 1),
        "farthest_segment_m": round(farthest_m, 1),
    }

    coords = [[float(lo), float(la)] for la, lo in zip(lat, lon)]
    speeds_by_win = {  # m/s je Trackpunkt, je Glättung
        "1": [round(float(v), 2) for v in np.nan_to_num(speed)],
        "3": [round(float(v), 2) for v in np.nan_to_num(speed_s)],
        "5": [round(float(v), 2) for v in np.nan_to_num(speed5)],
    }
    hrs = [int(v) if not np.isnan(v) else None for v in hr]        # Puls je Trackpunkt
    return {
        "algo_version": ALGO_VERSION,
        "total_distance_m": round(total_distance, 1),
        "foiling_distance_m": round(foiling_distance, 1),
        "foiling_time_s": round(foiling_time, 1),
        "max_speed_mps": round(max_speed, 2),
        "track_geojson": _track_geojson(coords, speeds_by_win, hrs),
        "segments": segments,
        "metrics": metrics,
    }


def _interp_lonlat(t_ms: np.ndarray, lat: np.ndarray, lon: np.ndarray, t: float) -> list:
    """Position [lon, lat] zur Zeit t, linear zwischen den umgebenden GPS-Samples."""
    n = t_ms.size
    j = int(np.searchsorted(t_ms, t))
    if j <= 0:
        return [round(float(lon[0]), 6), round(float(lat[0]), 6)]
    if j >= n:
        return [round(float(lon[n - 1]), 6), round(float(lat[n - 1]), 6)]
    t0, t1 = float(t_ms[j - 1]), float(t_ms[j])
    f = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
    f = min(max(f, 0.0), 1.0)
    return [
        round(float(lon[j - 1] + f * (lon[j] - lon[j - 1])), 6),
        round(float(lat[j - 1] + f * (lat[j] - lat[j - 1])), 6),
    ]


def _classify_end(i_end: int, speed_s: np.ndarray, step: np.ndarray, gps_hz: int) -> tuple[str, float]:
    """Klassifiziert das Lauf-Ende: 'fall' (Sturz) vs 'stop' (kontrolliertes Auslaufen).
    Ein GPS-Aussetzer (Teleport-Sprung) kurz nach dem Lauf ist auf dem freien See ein
    eindeutiges 'Uhr unter Wasser' -> sicherer Sturz. Sonst anhand des Speed-Einbruchs."""
    n = speed_s.size
    v_end = float(speed_s[i_end]) if 0 <= i_end < n else 0.0
    look = max(int(round(FALL_LOOKAHEAD_S * gps_hz)), 1)
    tail = speed_s[i_end + 1 : min(i_end + 1 + look, n)]
    if tail.size == 0:
        return "stop", 0.0
    v_after = float(np.nanmin(tail))
    decel = (v_end - v_after) / (FALL_LOOKAHEAD_S if FALL_LOOKAHEAD_S > 0 else 1)
    # GPS-Aussetzer direkt nach dem Lauf = Sturz (Uhr unter Wasser).
    tail_steps = step[i_end + 1 : min(i_end + 1 + look + 1, step.size)]
    if tail_steps.size and float(np.nanmax(tail_steps)) > OUTLIER_STEP_M:
        return "fall", round(max(decel, 0.0), 2)
    if v_end >= FALL_ONFOIL_MPS and v_after <= FALL_WATER_MPS:
        return "fall", round(decel, 2)
    return "stop", round(decel, 2)


def _seg_fields(i: int, j: int, t_ms: np.ndarray, step: np.ndarray, speeds: dict) -> dict:
    """Berechnet die Felder eines Segments [i, j) (Dauer, Distanz, Ø/Max/Min je 1/3/5 s)."""
    seg = {
        "type": "foiling",
        "i_start": int(i),
        "i_end": int(j - 1),
        "t_start_ms": int(t_ms[i]),
        "t_end_ms": int(t_ms[j - 1]),
        "duration_s": round((t_ms[j - 1] - t_ms[i]) / 1000.0, 1),
        "distance_m": round(float(step[i:j].sum()), 1),
        "avg_speed_mps": round(float(np.nanmean(speeds["3"][i:j])), 2),
        "max_speed_mps": round(float(np.nanmax(speeds["3"][i:j])), 2),
        "min_speed_mps": round(float(np.nanmin(speeds["3"][i:j])), 2),
    }
    for w in ("1", "3", "5"):
        ss = speeds[w][i:j]
        seg[f"avg_{w}s"] = round(float(np.nanmean(ss)), 2)
        seg[f"max_{w}s"] = round(float(np.nanmax(ss)), 2)
        seg[f"min_{w}s"] = round(float(np.nanmin(ss)), 2)
    return seg


def _snap_starts_to_impulses(segments, t_ms, step, speeds, impulses) -> list[dict]:
    """Snappt den Lauf-Start auf den Aufsprung-Impuls im Fenster
    [start-IMPULSE_BACK_S, start+IMPULSE_FWD_S] — nach vorne (Impuls knapp vor dem
    erkannten Start) ODER nach hinten (Anlauf/Paddeln vor dem Aufsprung abschneiden;
    der eigentliche Foil-Start ist der Aufsprung). Überschneidet nie den Vorgänger."""
    out = []
    prev_end = -1
    for seg in segments:
        i_start, i_end = seg["i_start"], seg["i_end"]
        ts = seg["t_start_ms"]
        cand = impulses[(impulses >= ts - IMPULSE_BACK_S * 1000) & (impulses <= ts + IMPULSE_FWD_S * 1000)]
        if cand.size:
            new_ts = float(cand.min())  # FRÜHESTER Jump = der Aufsprung (nicht ein späterer Bump)
            new_i = int(np.searchsorted(t_ms, new_ts))
            new_i = min(max(new_i, prev_end + 1), i_end)  # im Lauf bleiben (vor/zurück)
            if new_i != i_start:
                seg = _seg_fields(new_i, i_end + 1, t_ms, step, speeds)
            seg["_start_t_exact"] = new_ts  # exakte Aufsprung-Zeit (zwischen GPS-Samples)
        out.append(seg)
        prev_end = seg["i_end"]
    return out


# Dead-Reckoning am Lauf-Ende: taucht die Uhr unter, extrapoliert das GPS aus der
# letzten Geschwindigkeit weiter und driftet an Land. Diese Samples sind ungültig.
# Robustes, ortsunabhängiges Kriterium (Prior): das Ende ist NIE landwärtiger als der
# Start (man gleitet nur bis kurz vor den Steg, der Start ist der landnächste Punkt).
# Richtung "an Land" = vom Median des Laufs zum Startpunkt. End-Samples, die weiter
# landwärts als der Start liegen, sind Drift -> wegtrimmen.
DRIFT_LAND_MARGIN_M = 8   # Toleranz über den Start hinaus, bevor getrimmt wird


def _repair_deadreckoning(segments, lat, lon, t_ms, step, speeds, gps_hz) -> list[dict]:
    out = []
    for seg in segments:
        i0, i1 = seg["i_start"], seg["i_end"]
        if i1 - i0 < 3:
            out.append(seg)
            continue
        lat0 = float(np.median(lat[i0:i1 + 1]))
        mx = 111320.0 * np.cos(np.radians(lat0))
        X = lon * mx
        Y = lat * 111320.0
        cx = float(np.median(X[i0:i1 + 1]))
        cy = float(np.median(Y[i0:i1 + 1]))
        sx, sy = X[i0] - cx, Y[i0] - cy            # Median -> Start = Richtung "an Land"
        norm = float(np.hypot(sx, sy))
        if norm < 3.0:
            out.append(seg)
            continue
        ux, uy = sx / norm, sy / norm
        proj_start = norm                           # (Start-Median) · u
        ni = i1
        while ni > i0 and ((X[ni] - cx) * ux + (Y[ni] - cy) * uy) > proj_start + DRIFT_LAND_MARGIN_M:
            ni -= 1
        if ni < i1:
            seg = _seg_fields(i0, ni + 1, t_ms, step, speeds)
        out.append(seg)
    return out


def _in_water(la: float, lo: float, rings: list) -> bool:
    """Point-in-Polygon (Ray-Casting) gegen die OSM-Wasserfläche. Mehrere Ringe
    werden ge-XOR-t (Inseln als Löcher)."""
    inside = False
    for ring in rings:
        n = len(ring)
        if n < 3:
            continue
        c = False
        j = n - 1
        for i in range(n):
            yi, xi = ring[i]
            yj, xj = ring[j]
            if ((yi > la) != (yj > la)) and (lo < (xj - xi) * (la - yi) / (yj - yi + 1e-12) + xi):
                c = not c
            j = i
        inside ^= c
    return inside


def _clip_ends_to_water(segments, lat, lon, rings, t_ms, step, speeds) -> list[dict]:
    """Ground-Truth-Korrektur (kein Heuristik-Faken): ein Foil-Lauf endet/startet im
    Wasser. Dead-Reckoning-Drift an Land wird auf das letzte echte Wasser-Sample
    zurückgesetzt; ein an Land gedrifteter Start auf das erste Wasser-Sample. Liegt der
    GANZE Lauf außerhalb (Polygon versetzt/zu klein), wird NICHT angefasst."""
    if not rings:
        return segments
    out = []
    for seg in segments:
        i0, i1 = seg["i_start"], seg["i_end"]
        ie = i1
        while ie > i0 and not _in_water(lat[ie], lon[ie], rings):
            ie -= 1
        if ie == i0 and not _in_water(lat[i0], lon[i0], rings):
            out.append(seg)            # kein Sample im Wasser -> Polygon misaligned, nicht clippen
            continue
        i_s = i0
        while i_s < ie and not _in_water(lat[i_s], lon[i_s], rings):
            i_s += 1
        if i_s != i0 or ie != i1:
            exact = seg.get("_start_t_exact")
            seg = _seg_fields(i_s, ie + 1, t_ms, step, speeds)
            if i_s == i0 and exact is not None:
                seg["_start_t_exact"] = exact   # Start unverändert -> exakte Aufsprung-Zeit behalten
        out.append(seg)
    return out


def _extend_starts_back(segments, speed_s, t_ms, step, speeds) -> list[dict]:
    """Zieht den Lauf-Start rückwärts über die Beschleunigung bis zum letzten Quasi-
    Stopp, falls das Modell/der Jump den Aufsprung verpasst hat (Speed war schon im
    Foil-Band, blieb aber grau). Stoppt unter ENTER_SPEED und nie im Vorgänger."""
    out = []
    prev_end = -1
    gap_ms = GAP_SPLIT_S * 1000
    for seg in segments:
        i = seg["i_start"]
        # nicht über eine GPS-Zeitlücke (Dropout/Sturz davor) zurückziehen.
        while i - 1 > prev_end and speed_s[i - 1] >= ENTER_SPEED and (t_ms[i] - t_ms[i - 1]) <= gap_ms:
            i -= 1
        if i != seg["i_start"]:
            seg = _seg_fields(i, seg["i_end"] + 1, t_ms, step, speeds)
        out.append(seg)
        prev_end = seg["i_end"]
    return out


def _merge_no_stop(segments, speed_s, t_ms, step, speeds, gps_hz) -> list[dict]:
    """Führt aufeinanderfolgende Läufe zusammen, zwischen denen NIE ein echter Stopp
    lag (Speed fiel nie unter NOSTOP_SPEED). Ein Start setzt voraus, dass man davor
    langsam/stehend war — sonst ist es derselbe Lauf (z. B. Modell-Aussetzer)."""
    if len(segments) < 2:
        return segments
    out = [segments[0]]
    for seg in segments[1:]:
        prev = out[-1]
        gap = speed_s[prev["i_end"] + 1 : seg["i_start"]]
        no_stop = gap.size == 0 or float(np.nanmin(gap)) >= NOSTOP_SPEED
        # Ein echter GPS-Dropout (Uhr unter Wasser/Sturz) trennt -> nicht drüber mergen.
        # Dropout = eine große SAMPLE-Lücke (>GAP_SPLIT_S zwischen zwei Punkten), NICHT
        # die Wanduhr-Dauer: ein durchgehender Cruise, den das Accel-Modell kurz verliert
        # oder bei spärlichem GPS-Log, ergibt viele Samples mit weiter hohem Speed (kein
        # Dropout) -> derselbe Lauf. Sonst zerschneidet langes Cruisen einen Lauf künstlich.
        # KEINE Dauer-Kappe: blieb der Speed die GANZE Lücke über >= NOSTOP_SPEED und lag
        # kein Sample-Dropout vor, ist es derselbe Lauf — egal wie lang (Markus #361:
        # 17-36 s ruhiges Gleiten, das das Modell verliert, wurde sonst künstlich zerhackt).
        seg_t = t_ms[prev["i_end"] : seg["i_start"] + 1]
        max_sample_dt_s = float(np.max(np.diff(seg_t))) / 1000.0 if seg_t.size >= 2 else 0.0
        if no_stop and max_sample_dt_s <= GAP_SPLIT_S:
            out[-1] = _seg_fields(prev["i_start"], seg["i_end"] + 1, t_ms, step, speeds)
        else:
            out.append(seg)
    return out


def _segments_from_mask(
    mask: np.ndarray, t_ms: np.ndarray, gps_hz: int, step: np.ndarray, speeds: dict
) -> list[dict]:
    """Zusammenhängende Foiling-Läufe -> Segmente mit Ø/Max/Min-Speed je Glättung (1/3/5 s)."""
    segs: list[dict] = []
    min_len = max(int(round(MIN_SEGMENT_S * gps_hz)), 1)
    gap_ms = GAP_SPLIT_S * 1000

    def _add(a: int, b: int) -> None:  # Sub-Lauf [a, b) prüfen + anhängen
        if (b - a) >= min_len and float(np.nanmean(speeds["3"][a:b])) >= MIN_SEG_AVG_SPEED:
            segs.append(_seg_fields(a, b, t_ms, step, speeds))

    i = 0
    n = len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]:
                j += 1
            # Zusammenhängende Maske [i, j) an großen GPS-Zeitlücken (Dropout/Sturz)
            # weiter aufteilen -> die Lückenzeit zählt nicht in die Lauf-Dauer.
            a = i
            for k in range(i + 1, j):
                if t_ms[k] - t_ms[k - 1] > gap_ms:
                    _add(a, k)
                    a = k
            _add(a, j)
            i = j
        else:
            i += 1
    return segs


def _track_geojson(coords: list, speeds_by_win: dict | None = None, hrs: list | None = None) -> dict:
    sw = speeds_by_win or {}
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": coords},
        "properties": {
            "speeds": sw,                 # {"1":[...],"3":[...],"5":[...]}
            "speeds_mps": sw.get("3", []),  # Rückwärtskompatibilität (3 s)
            "hr": hrs or [],
        },
    }
