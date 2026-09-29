"""Erkennung v3, Stufe A: Merkmale je GPS-Sekunde. Liest nur, schreibt nie.

Baut auf den 14 Merkmalen des bisherigen On-Foil-Modells auf (`foil_model.extract_features`) und
ergaenzt, was dem fehlte (Anlass: Laeufe auf Strassen, an Autofahrten, auf Parkplaetzen):

- Spektrum der Beschleunigung im ±4-s-Fenster: Anteil im Pump-Band (0,8-2,2 Hz), im Schritt-Band
  (2,2-3,5 Hz), Vibration (5-12 Hz, Strasse/Motor), dominante Frequenz, Woelbung (Stoesse beim Gehen).
- Kontext ±60 s: hoechstes Tempo, Anteil ueber 40 km/h (Auto in der Naehe), Median-Tempo ±30 s.
- Abstand zum Schwerpunkt der Session (Laeufe liegen am Spot, Anfahrten fuehren weg).
- GPS-Genauigkeit, Puls relativ zum Session-Median, Luecke zum vorigen Fix.

Die Beschleunigung wird fuer alle Geraete auf 25 Hz gebracht (Handys liefern 50-125 Hz, Uhren 25-50),
damit das Modell keine Geraete lernt. Nur der BETRAG geht ein — das Vorzeichen der Achsen (Android
+1 g, Apple -1 g) spielt damit keine Rolle.
"""
from __future__ import annotations

from types import SimpleNamespace

import numpy as np

from ..foil_model import FEATURE_NAMES as BASIS_NAMEN, extract_features, windowize

ZIEL_HZ = 25.0
FENSTER_S = 8           # Spektrum-Fenster (±4 s)
KONTEXT_S = 60
AUTO_MPS = 40 / 3.6

NEU_NAMEN = ["band_pump", "band_schritt", "band_vib", "f_dom", "woelbung",
             "ctx_vmax60", "ctx_auto60", "ctx_vmed30", "abstand_zentrum_km",
             "hacc", "puls_rel", "puls_fehlt", "gps_luecke_s"]
NAMEN = list(BASIS_NAMEN) + NEU_NAMEN
KONTEXT_R = 5           # ±5 s wie das bisherige Modell (windowize)


def ganze_aufnahme(s: dict):
    """Session-Ersatz fuer build_timebase_for_session: OHNE Zuschnitt, Ausschluss, Zurueckholung —
    die Erkennung soll die ganze Aufnahme sehen, gelernt wird aus den Labels."""
    return SimpleNamespace(session_uuid=s["uuid"], accel_scale=s.get("accel_scale") or 2048,
                           accel_hz=s.get("accel_hz"), gps_hz=1, trim_start_ms=None, trim_end_ms=None,
                           excluded_ranges=None, fremdkraft_keep=None,
                           sport_class=s.get("sport_class"), placement=s.get("placement"))


def raster(tb, ziel_hz: float = ZIEL_HZ) -> np.ndarray:
    """Accel auf ein gleichmaessiges Raster ab `tb.window_start_ms` (echte Sample-Zeiten, s.
    `model_mask_on_timebase`). Hoehere Raten vorher gleitend gemittelt (kein Aliasing)."""
    a = tb.accel.astype(np.float64)
    t = tb.t_accel_ms.astype(np.float64)
    if a.shape[0] < 2:
        return np.zeros((0, 3))
    hz = float(tb.accel_hz or ziel_hz)
    k = int(round(hz / ziel_hz))
    if k > 1:
        kern = np.ones(k) / k
        a = np.stack([np.convolve(a[:, i], kern, mode="same") for i in range(3)], axis=1)
    off = float(tb.window_start_ms)
    n = int(round((tb.window_end_ms - off) / 1000.0 * ziel_hz)) + 1
    ziel = off + np.arange(max(n, 0)) / ziel_hz * 1000.0
    return np.stack([np.interp(ziel, t, a[:, i]) for i in range(3)], axis=1)


def _spektrum(mag: np.ndarray, t_rel_ms: np.ndarray) -> np.ndarray:
    """(n, 5) je GPS-Zeitpunkt: Bandanteile, dominante Frequenz, Woelbung im ±4-s-Fenster."""
    n = t_rel_ms.size
    out = np.zeros((n, 5))
    w = int(FENSTER_S * ZIEL_HZ)
    if mag.size < w:
        return out
    x = mag - np.convolve(mag, np.ones(int(ZIEL_HZ * 3)) / int(ZIEL_HZ * 3), mode="same")
    mitte = np.clip((t_rel_ms / 1000.0 * ZIEL_HZ).astype(int), w // 2, mag.size - w // 2 - 1)
    fen = np.lib.stride_tricks.sliding_window_view(x, w)[mitte - w // 2]
    fen = fen * np.hanning(w)
    p = np.abs(np.fft.rfft(fen, axis=1)) ** 2
    f = np.fft.rfftfreq(w, 1 / ZIEL_HZ)
    gesamt = p[:, (f >= 0.3) & (f <= 12)].sum(axis=1) + 1e-12
    band = lambda lo, hi: p[:, (f >= lo) & (f < hi)].sum(axis=1) / gesamt
    out[:, 0] = band(0.8, 2.2)
    out[:, 1] = band(2.2, 3.5)
    out[:, 2] = band(5.0, 12.0)
    sel = (f >= 0.5) & (f <= 4.0)
    out[:, 3] = f[sel][np.argmax(p[:, sel], axis=1)]
    roh = np.lib.stride_tricks.sliding_window_view(x, w)[mitte - w // 2]
    sd = roh.std(axis=1) + 1e-9
    out[:, 4] = (((roh - roh.mean(axis=1, keepdims=True)) / sd[:, None]) ** 4).mean(axis=1)
    return out


def merkmale(tb) -> tuple[np.ndarray, np.ndarray]:
    """-> (t_ms Session-ms je GPS-Sample, X (n, len(NAMEN)) OHNE Kontextfenster)."""
    gps = tb.gps
    n = len(gps)
    t = tb.t_gps_ms.astype(float)
    if n == 0:
        return t, np.zeros((0, len(NAMEN)))
    r = raster(tb) if tb.has_accel else np.zeros((0, 3))
    off = float(tb.window_start_ms)
    gps0 = [[g[0] - off] + list(g[1:]) for g in gps]
    scale = tb.accel_scale or 2048
    basis = extract_features(gps0, (r * 1.0).astype(np.float64), ZIEL_HZ, scale) if r.shape[0] else \
        extract_features(gps0, np.zeros((0, 3)), ZIEL_HZ, scale)
    mag = np.sqrt(((r / scale) ** 2).sum(axis=1)) if r.shape[0] else np.zeros(0)
    spek = _spektrum(mag, t - off)
    v = np.array([float(g[3]) if len(g) > 3 and g[3] is not None else 0.0 for g in gps])
    v = np.nan_to_num(v)
    lat = np.array([float(g[1]) for g in gps]); lon = np.array([float(g[2]) for g in gps])
    ctx = np.zeros((n, 3))
    sek = t / 1000.0
    lo60 = np.searchsorted(sek, sek - KONTEXT_S); hi60 = np.searchsorted(sek, sek + KONTEXT_S)
    lo30 = np.searchsorted(sek, sek - 30); hi30 = np.searchsorted(sek, sek + 30)
    cs_auto = np.concatenate([[0], np.cumsum(v > AUTO_MPS)])
    for i in range(n):
        ctx[i, 0] = v[lo60[i]:hi60[i]].max()
        ctx[i, 2] = np.median(v[lo30[i]:hi30[i]])
    ctx[:, 1] = (cs_auto[hi60] - cs_auto[lo60]) / np.maximum(hi60 - lo60, 1)
    bew = (v > 1.5) & (v < AUTO_MPS) & ~((np.abs(lat) < 1e-6) & (np.abs(lon) < 1e-6))
    if bew.sum() >= 10:
        zl, zo = np.median(lat[bew]), np.median(lon[bew])
    else:
        zl, zo = np.median(lat), np.median(lon)
    abst = np.hypot((lat - zl) * 111.32, (lon - zo) * 111.32 * np.cos(np.radians(zl)))
    hacc = np.array([float(g[5]) if len(g) > 5 and g[5] is not None else np.nan for g in gps])
    if np.isfinite(hacc).any() and float(np.ptp(hacc[np.isfinite(hacc)])) == 0.0:
        hacc[:] = np.nan          # Platzhalter-Genauigkeit (s. detect_v2) ist keine Messung
    hr = np.array([float(g[4]) if len(g) > 4 and g[4] else np.nan for g in gps])
    hr[hr <= 0] = np.nan
    med = np.nanmedian(hr) if np.isfinite(hr).any() else np.nan
    luecke = np.concatenate([[1.0], np.diff(sek)])
    neu = np.column_stack([spek, ctx, abst, np.nan_to_num(hacc, nan=-1),
                           np.nan_to_num(hr - med, nan=0.0), ~np.isfinite(hr), luecke])
    return t, np.hstack([basis, neu])


def mit_kontext(X: np.ndarray) -> np.ndarray:
    return windowize(X, KONTEXT_R)
