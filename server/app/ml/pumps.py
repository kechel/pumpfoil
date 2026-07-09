"""Pump-Zählung + Pump/Glide-Klassifikation (heuristisch, numpy-only).

Heuristik-Stufe (Stage 0/2 im Plan): liefert sofort nutzbare Ergebnisse UND Auto-Labels.
Wird später durch ein supervised Modell (train.py) ergänzt/abgelöst, sobald genügend
manuell gelabelte Sessions vorliegen.
"""
from __future__ import annotations

import numpy as np

from .features import FILTER_BAND, PUMP_BAND, bandpass_fft, window_features

# Schwellen (mit echten Daten zu tunen — siehe Caveat unten).
MIN_PEAK_DISTANCE_S = 0.45      # min. Abstand zweier Pumps (~max 2.2 Hz)
PEAK_PROMINENCE_STD = 0.6       # Peak muss >= 0.6 * Signal-Std herausragen
MIN_PEAK_ABS_G = 0.08           # ABSOLUTE Mindestamplitude (g): filtert Zappeln/Rauschen
GLIDE_BAND_RATIO = 0.35         # darunter eher Gleiten (wenig Rhythmus-Energie)
PUMP_BAND_RATIO = 0.45          # darüber eher Pumpen
MIN_RMS = 0.05                  # darunter "idle"/kein echtes Pumpen (g, bandpass)

# WICHTIG (Wrist-Confound): Die Uhr sitzt am Handgelenk, nicht am Board/Fuß. Beim
# Foilen wedeln die Arme stark zum Balancieren — das überlagert das eigentliche
# Pump-Signal des Boards. Diese Heuristik ist daher nur ein grober Platzhalter.
# Verlässliche Pump-Erkennung kommt erst mit echten, gelabelten Testdaten (train.py),
# wo gelernt wird, die Balance-Bewegung herauszumitteln. Hier NICHT überoptimieren.


def _find_peaks(sig: np.ndarray, fs: float) -> np.ndarray:
    """Einfache Peak-Detection: lokale Maxima mit Mindestprominenz + Mindestabstand."""
    if sig.size < 3:
        return np.empty(0, dtype=int)
    # Schwelle = max(relativ zur Std, absolute Mindestamplitude). Die absolute
    # Schranke verhindert, dass Rauschen/Zappeln als Pumps gezählt wird.
    thr = max(PEAK_PROMINENCE_STD * np.std(sig), MIN_PEAK_ABS_G)
    min_dist = max(int(round(MIN_PEAK_DISTANCE_S * fs)), 1)

    # Kandidaten: lokale Maxima über Schwelle.
    cand = np.where(
        (sig[1:-1] > sig[:-2]) & (sig[1:-1] >= sig[2:]) & (sig[1:-1] > thr)
    )[0] + 1
    if cand.size == 0:
        return cand

    # Mindestabstand erzwingen (greedy nach Amplitude).
    order = cand[np.argsort(-sig[cand])]
    taken: list[int] = []
    blocked = np.zeros(sig.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx))
            lo = max(idx - min_dist, 0)
            hi = min(idx + min_dist + 1, sig.size)
            blocked[lo:hi] = True
    return np.array(sorted(taken), dtype=int)


# --- v2: Pumps auf dem vertikalen Signal (gegen Schwerkraft), LAUF-lokale Schwelle ---
# Statt einer globalen Amplituden-Schwelle (die starke Läufe hochziehen und glatte/kleine
# Pumps eines Laufs ganz verschlucken) wird je Lauf relativ zur LAUF-eigenen Std geschwellt.
PUMP_FLOOR_G = 0.04        # absoluter Boden (g) — niedriger als die alte |Betrag|-Schwelle
PUMP_FLOOR_LO_G = 0.015    # abgesenkter Boden in klar rhythmischen Abschnitten (sanftes Pumpen)
PUMP_RMS_GATE = 0.03       # Pro-Lauf-Gate: darunter kein Rhythmus -> 0 Pumps
PUMP_RHYTHM_ON = 0.45      # Pump-Band-Anteil, ab dem ein Abschnitt als rhythmisch gilt


def find_pumps_local(filt_run: np.ndarray, fs: float,
                     k: float = PEAK_PROMINENCE_STD,
                     floor: float = PUMP_FLOOR_G,
                     rms_gate: float = PUMP_RMS_GATE) -> np.ndarray:
    """Aufwärts-Push-Peaks in EINEM (lauf-lokalen) bandpassgefilterten Signal.
    Schwelle = max(k·std(Lauf), boden); Mindestabstand wie _find_peaks. Gibt Indizes relativ
    zum Lauf zurück. Pro-Lauf-RMS-Gate filtert reine Gleitphasen. Der Boden wird in Abschnitten
    mit klarer Pump-Periodik (pump_rhythmicity) abgesenkt -> sehr sanftes, aber rhythmisches
    Pumpen wird erkannt, ohne in rhythmuslosen Gleitphasen zu über-zählen."""
    from .features import pump_rhythmicity
    sig = np.asarray(filt_run, dtype=float)
    if sig.size < 3:
        return np.empty(0, dtype=int)
    if float(np.sqrt(np.mean(sig * sig))) < rms_gate:
        return np.empty(0, dtype=int)
    rh = pump_rhythmicity(sig, fs)
    floor_arr = np.where(rh >= PUMP_RHYTHM_ON, PUMP_FLOOR_LO_G, floor)
    thr = np.maximum(k * np.std(sig), floor_arr)
    min_dist = max(int(round(MIN_PEAK_DISTANCE_S * fs)), 1)
    cand = np.where((sig[1:-1] > sig[:-2]) & (sig[1:-1] >= sig[2:]) & (sig[1:-1] > thr[1:-1]))[0] + 1
    if cand.size == 0:
        return cand
    order = cand[np.argsort(-sig[cand])]
    taken: list[int] = []
    blocked = np.zeros(sig.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx))
            blocked[max(idx - min_dist, 0):min(idx + min_dist + 1, sig.size)] = True
    return np.array(sorted(taken), dtype=int)


# --- v3: kadenz-gefuehrtes Peak-Picking (gegen echte Pump-Wahrheit kalibriert) ---
# find_pumps_local (Amplituden-Schwelle) unter-erkennt strukturell ~2x: es pickt nur die
# groessten Peaks und verschluckt kleinere rhythmische Pumps dazwischen. Gegen die
# run_pumps-Wahrheit der Label-App UND Jans Video-Tap-Labels (pump_truth) trifft eine
# kadenz-gefuehrte Suche ~85-94 % (statt ~40 %): in rhythmischen, energiereichen Abschnitten
# die LOKALE Pump-Kadenz schaetzen und pro Periode das ECHTE lokale Maximum als Pump waehlen
# -> Count UND echte Positionen (Marker=Count konsistent). Params getunt in
# scripts/pump_cadence_peaks.py. Physische Endkalibrierung spaeter via Insta360 X5.
PUMP_CAD_WIN_S = 4.0            # Fenster fuer die lokale Kadenz-Schaetzung (s)
PUMP_CAD_BAND = (0.8, 2.0)     # plausible Pump-Kadenz (Hz)
PUMP_CAD_GATE = 0.008          # RMS-Gate: rhythmisch+energiereich (g, bandpass). 0.02 war zu
                               # hoch für leichte/sanfte Fahrer -> ganze Pump-Abschnitte als
                               # "Gleit" verworfen (Befund Session 521/493 Alex, 436 user13).
                               # Verifiziert gegen Ground-Truth (ratio 1.05->1.08, ~unverändert)
                               # + breite DB: Fake-Lang-Gleiter (glide>5s) 8->0, Σ Pumps +0.5%.
                               # Siehe scripts/pump_gate_eval.py.


def _dom_pump_freq(seg: np.ndarray, fs: float, blo: float, bhi: float) -> float:
    """Dominante Frequenz im Pump-Band (Hz) via FFT-Peak; 0.0 wenn keins."""
    if seg.size < fs:
        return 0.0
    w = seg * np.hanning(seg.size)
    sp = np.abs(np.fft.rfft(w))
    fr = np.fft.rfftfreq(seg.size, 1.0 / fs)
    band = (fr >= blo) & (fr <= bhi)
    if not band.any():
        return 0.0
    return float(fr[band][np.argmax(sp[band])])


def find_pumps_cadence(filt_run: np.ndarray, fs: float, win_s: float = PUMP_CAD_WIN_S,
                       band: tuple = PUMP_CAD_BAND, rms_gate: float = PUMP_CAD_GATE) -> np.ndarray:
    """Kadenz-gefuehrtes Peak-Picking: ein echter Peak je Pump-Periode in rhythmischen,
    energiereichen Abschnitten. Lokal adaptive Kadenz -> folgt Tempowechseln. Gibt
    Pump-Positionen (Indizes relativ zum Lauf) zurueck. Ersetzt find_pumps_local."""
    sig = np.asarray(filt_run, dtype=float)
    n = sig.size
    blo, bhi = band
    if n < fs:
        return np.empty(0, dtype=int)
    w = max(int(round(win_s * fs)), 1)
    hop = max(int(round(0.5 * fs)), 1)
    # rhythmisch+energiereich: gleitendes RMS >= gate
    rms_ok = np.zeros(n, dtype=bool)
    for pos in range(0, n, hop):
        seg = sig[pos:pos + w]
        if seg.size >= fs and float(np.sqrt(np.mean(seg * seg))) >= rms_gate:
            rms_ok[pos:min(pos + hop, n)] = True
    peaks: list[int] = []
    i = 0
    while i < n:
        if not rms_ok[i]:
            i += 1
            continue
        j = i
        while j < n and rms_ok[j]:
            j += 1
        if j - i >= fs:               # rhythmische Region: pro Kadenz-Periode ein Peak
            pos = i
            while pos < j:
                lo = max(pos - w // 2, i)
                hi = min(pos + w // 2, j)
                f = _dom_pump_freq(sig[lo:hi], fs, blo, bhi)
                if f <= 0:
                    break
                T = max(int(round(fs / f)), 1)
                seg = sig[pos:min(pos + T, j)]
                if seg.size > 0:
                    peaks.append(pos + int(np.argmax(seg)))
                pos += T
        i = j
    return np.array(sorted(set(peaks)), dtype=int)


def count_pumps(mag: np.ndarray, fs: float, mask: np.ndarray | None = None) -> int:
    """Anzahl Pumps. Optional nur innerhalb mask (z. B. Foiling-Phasen) zählen."""
    if mag.size == 0:
        return 0
    filt = bandpass_fft(mag, fs, *FILTER_BAND)
    # Globales Gate: ohne nennenswerte Rhythmus-Energie keine Pumps zählen.
    if np.sqrt(np.mean(filt * filt)) < MIN_RMS:
        return 0
    peaks = _find_peaks(filt, fs)
    if peaks.size == 0:
        return 0
    if mask is not None:
        m = np.asarray(mask, dtype=bool)
        peaks = peaks[(peaks < m.size) & m[np.clip(peaks, 0, m.size - 1)]]
    return int(peaks.size)


def pump_times_ms(mag: np.ndarray, fs: float, mask: np.ndarray | None = None) -> np.ndarray:
    """Pump-Peak-Zeitpunkte in ms (Index/fs). Optional nur innerhalb mask.
    Grundlage für Gleitphasen = Lücken zwischen aufeinanderfolgenden Pumps."""
    if mag.size == 0:
        return np.empty(0)
    filt = bandpass_fft(mag, fs, *FILTER_BAND)
    if np.sqrt(np.mean(filt * filt)) < MIN_RMS:
        return np.empty(0)
    peaks = _find_peaks(filt, fs)
    if peaks.size == 0:
        return np.empty(0)
    if mask is not None:
        m = np.asarray(mask, dtype=bool)
        peaks = peaks[(peaks < m.size) & m[np.clip(peaks, 0, m.size - 1)]]
    return peaks / fs * 1000.0


def classify_windows(features: list[dict]) -> list[dict]:
    """Pro Fenster ein Label: 'pump' | 'glide' | 'idle' (heuristisch)."""
    out = []
    for f in features:
        if f["rms"] < MIN_RMS:
            label = "idle"
        elif (
            f["band_power_ratio"] >= PUMP_BAND_RATIO
            and PUMP_BAND[0] <= f["dom_freq"] <= PUMP_BAND[1]
        ):
            label = "pump"
        elif f["band_power_ratio"] < GLIDE_BAND_RATIO:
            label = "glide"
        else:
            label = "glide"  # Zwischenbereich -> konservativ Gleiten
        out.append({**f, "label": label})
    return out


def analyze_accel(
    raw_i16: np.ndarray,
    accel_scale: int,
    fs: float,
    foiling_mask: np.ndarray | None = None,
) -> dict:
    """Komplette Accel-Analyse einer Session.

    foiling_mask: bool-Array über die Accel-Samples (gleiches fs), True = foilend.
    """
    from .features import magnitude_g

    mag = magnitude_g(raw_i16, accel_scale)
    feats = window_features(mag, fs)
    windows = classify_windows(feats)
    pump_count = count_pumps(mag, fs, mask=foiling_mask)

    pump_windows = [w for w in windows if w["label"] == "pump"]
    avg_cadence = (
        float(np.mean([w["dom_freq"] for w in pump_windows])) if pump_windows else 0.0
    )
    return {
        "pump_count": pump_count,
        "avg_cadence_hz": round(avg_cadence, 3),
        "windows": windows,
    }
