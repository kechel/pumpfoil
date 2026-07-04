"""ML-Foil-Detektor: per-Sekunde foil/nicht-foil aus Original-Garmin-Daten (GPS+Accel).

Trainiert (offline, scripts/train_foil_model.py) gegen die foil_status-Ground-Truth der
anderen App, dann hier zur Laufzeit auf JEDE Session angewandt (auch eigene Aufnahmen).
Feature-Extraktion arbeitet auf dem GESPEICHERTEN Format (gps_samples + accel-Array),
damit Training und Anwendung dieselben Features sehen.
"""
from __future__ import annotations

import pickle
from pathlib import Path

import numpy as np

from ..ml.features import bandpass_fft, magnitude_g

FEATURE_NAMES = [
    "speed", "speed_3s", "speed_5s", "speed_cv",
    "accel_rms", "pump_rms", "hf_rms",
    # Richtungs-/Delta-Features (aus GPS-Position): geben dem Modell Kontext, ohne
    # den er ruhige Gleitphasen verliert (Zerstueckeln). Groesster F1-Hebel im Experiment.
    "dspeed_1s", "dspeed_3s", "dspeed_5s", "path_5s", "net_5s", "straight_5s", "turn_5s",
]
MODEL_PATH = Path(__file__).with_name("foil_rf.pkl")

# Jede Sekunde wird im Kontext von ±WINDOW_RADIUS s klassifiziert (Center-Label):
# der Feature-Vektor haengt die Features der Nachbarsekunden an. Fenster + Kontext
# beheben das Zerstueckeln an der Wurzel (Experiment: Fragmentierung 1.10x -> 1.00x).
WINDOW_RADIUS = 5


def _running_median(x: np.ndarray, win: int) -> np.ndarray:
    h = win // 2
    out = np.empty_like(x)
    for i in range(x.size):
        out[i] = np.median(x[max(0, i - h): i + h + 1])
    return out


def _haversine_np(lat1, lon1, lat2, lon2):
    R = 6371000.0
    p1 = np.radians(lat1); p2 = np.radians(lat2)
    dp = np.radians(lat2 - lat1); dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * R * np.arcsin(np.minimum(1.0, np.sqrt(a)))


def _direction_features(lat: np.ndarray, lon: np.ndarray, speed: np.ndarray) -> np.ndarray:
    """(n, 7): Delta-Speed 1/3/5 s, Pfadlaenge 5 s, Netto-Versatz 5 s,
    Geradlinigkeit (netto/pfad), Kursaenderung 5 s. Alles aus GPS-Position/-Speed."""
    n = lat.size
    if n == 0:
        return np.empty((0, 7))
    step = np.zeros(n)
    if n >= 2:
        step[1:] = _haversine_np(lat[:-1], lon[:-1], lat[1:], lon[1:])
    cs = np.concatenate([[0.0], np.cumsum(step)])   # cs[i] = Summe step[0..i-1]
    d1 = speed - speed[np.clip(np.arange(n) - 1, 0, n - 1)]
    d3 = speed - speed[np.clip(np.arange(n) - 3, 0, n - 1)]
    d5 = speed - speed[np.clip(np.arange(n) - 5, 0, n - 1)]
    j = np.clip(np.arange(n) - 5, 0, n - 1)
    path5 = cs[np.arange(n) + 1] - cs[j + 1]
    net5 = _haversine_np(lat[j], lon[j], lat, lon)
    straight = np.where(path5 > 1e-6, net5 / path5, 0.0)
    # Kursaenderung: Peilung (i-6..i-3) vs (i-3..i)
    turn5 = np.zeros(n)
    if n >= 7:
        def bearing(a, b, c, d):
            y = np.sin(np.radians(d - b)) * np.cos(np.radians(c))
            x = (np.cos(np.radians(a)) * np.sin(np.radians(c))
                 - np.sin(np.radians(a)) * np.cos(np.radians(c)) * np.cos(np.radians(d - b)))
            return np.degrees(np.arctan2(y, x))
        idx = np.arange(6, n)
        b0 = bearing(lat[idx - 6], lon[idx - 6], lat[idx - 3], lon[idx - 3])
        b1 = bearing(lat[idx - 3], lon[idx - 3], lat[idx], lon[idx])
        turn5[idx] = np.abs((b1 - b0 + 180) % 360 - 180)
    return np.stack([d1, d3, d5, path5, net5, straight, turn5], axis=1)


def windowize(X: np.ndarray, r: int = WINDOW_RADIUS) -> np.ndarray:
    """Zeile i -> aneinandergehaengte Features [i-r .. i+r] (Rand geklemmt).
    Center-Label-Klassifikation: das Modell 'sieht' ±r s Kontext pro Sekunde."""
    if X.shape[0] == 0:
        return X.reshape(0, X.shape[1] * (2 * r + 1))
    n, f = X.shape
    idx = np.clip(np.arange(n)[:, None] + np.arange(-r, r + 1)[None, :], 0, n - 1)
    return X[idx].reshape(n, (2 * r + 1) * f)


def extract_features(gps_samples: list, accel: np.ndarray, accel_hz: float, accel_scale: int) -> np.ndarray:
    """-> (n_gps, len(FEATURE_NAMES)). Pro GPS-Sample (≈1 Hz)."""
    n = len(gps_samples)
    if n == 0:
        return np.empty((0, len(FEATURE_NAMES)))
    t_ms = np.array([s[0] for s in gps_samples], dtype=float)
    speed = np.array([s[3] if len(s) > 3 and s[3] is not None else 0.0 for s in gps_samples], dtype=float)
    speed_3s = _running_median(speed, 3)
    speed_5s = _running_median(speed, 5)
    cv = np.empty(n)
    for i in range(n):
        w = speed[max(0, i - 2): i + 3]
        cv[i] = (w.std() / w.mean()) if w.mean() > 1e-6 else 0.0

    accel_rms = np.zeros(n); pump_rms = np.zeros(n); hf_rms = np.zeros(n)
    if accel.shape[0] > 0:
        mag = np.sqrt((accel.astype(np.float64) / accel_scale) ** 2 @ np.ones(3))
        pump = bandpass_fft(mag, accel_hz, 0.3, 3.0)
        hf = bandpass_fft(mag, accel_hz, 3.0, 15.0)
        for i in range(n):
            lo = int(t_ms[i] / 1000.0 * accel_hz)
            hi = int((t_ms[i] + 1000.0) / 1000.0 * accel_hz)
            lo = max(lo, 0); hi = min(hi, mag.size)
            if hi > lo:
                seg = mag[lo:hi]
                accel_rms[i] = np.sqrt(np.mean((seg - seg.mean()) ** 2))
                pump_rms[i] = np.sqrt(np.mean(pump[lo:hi] ** 2))
                hf_rms[i] = np.sqrt(np.mean(hf[lo:hi] ** 2))

    base = np.stack([speed, speed_3s, speed_5s, cv, accel_rms, pump_rms, hf_rms], axis=1)
    lat = np.array([s[1] if len(s) > 2 else 0.0 for s in gps_samples], dtype=float)
    lon = np.array([s[2] if len(s) > 2 else 0.0 for s in gps_samples], dtype=float)
    return np.hstack([base, _direction_features(lat, lon, speed)])


def save_model(clf) -> None:
    with open(MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)


def load_model():
    if not MODEL_PATH.exists():
        return None
    try:
        with open(MODEL_PATH, "rb") as f:
            return pickle.load(f)
    except Exception:
        return None


def detect_impulses(accel: np.ndarray, accel_hz: float, accel_scale: int) -> np.ndarray:
    """Aufsprung-Impulse (scharfe Magnitude-Spitzen) -> Zeiten in ms (relativ zum Start).
    Generisch/ortsunabhängig: lokale Maxima > 1.3x p95, Mindestabstand 1 s."""
    if accel.shape[0] == 0:
        return np.empty(0)
    mag = magnitude_g(accel, accel_scale)
    if mag.size < 3:
        return np.empty(0)
    thr = float(np.percentile(mag, 95)) * 1.3
    min_dist = max(int(round(accel_hz)), 1)
    cand = np.where((mag[1:-1] > mag[:-2]) & (mag[1:-1] >= mag[2:]) & (mag[1:-1] > thr))[0] + 1
    if cand.size == 0:
        return np.empty(0)
    order = cand[np.argsort(-mag[cand])]
    taken, blocked = [], np.zeros(mag.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx))
            blocked[max(idx - min_dist, 0): idx + min_dist + 1] = True
    return np.sort(np.array(taken)) / accel_hz * 1000.0


def detect_jumps(accel: np.ndarray, accel_hz: float, accel_scale: int, thresh_p95: float = 3.5) -> np.ndarray:
    """Aufsprung-Impulse: nur STARKE Spitzen (> thresh_p95 * p95), Mindestabstand 3 s.
    Daten: Jump median ~4.3x p95 vs. Pump ~2.3x -> klar trennbar. -> Zeiten in ms."""
    if accel.shape[0] == 0:
        return np.empty(0)
    mag = magnitude_g(accel, accel_scale)
    if mag.size < 3:
        return np.empty(0)
    thr = float(np.percentile(mag, 95)) * thresh_p95
    min_dist = max(int(round(3 * accel_hz)), 1)
    cand = np.where((mag[1:-1] > mag[:-2]) & (mag[1:-1] >= mag[2:]) & (mag[1:-1] > thr))[0] + 1
    if cand.size == 0:
        return np.empty(0)
    order = cand[np.argsort(-mag[cand])]
    taken, blocked = [], np.zeros(mag.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx))
            blocked[max(idx - min_dist, 0): idx + min_dist + 1] = True
    return np.sort(np.array(taken)) / accel_hz * 1000.0


def predict_foiling_mask(gps_samples: list, accel: np.ndarray, accel_hz: float, accel_scale: int):
    """Bool-Maske (per GPS-Sample) via ML-Modell. None, wenn kein Modell/Accel da ist."""
    clf = load_model()
    if clf is None or accel.shape[0] == 0 or len(gps_samples) == 0:
        return None
    X = extract_features(gps_samples, accel, accel_hz, accel_scale)
    return clf.predict(windowize(X)).astype(bool)
