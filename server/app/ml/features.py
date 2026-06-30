"""Accel-Feature-Extraktion (numpy-only, kein scipy nötig).

Pipeline:
  raw int16 (N,3) -> Magnitude in g (orientierungsinvariant)
  -> FFT-Bandpass 0.3-3 Hz
  -> Fenster-Features (Dominanzfrequenz, Band-Power-Ratio, RMS, Spektral-Entropie)

Diese Features sind die Grundlage für Pump/Glide-Klassifikation (pumps.py) und später
für ein supervised ML-Modell (train.py).
"""
from __future__ import annotations

import numpy as np

# Pump-Cadence-Band (Hz): rhythmisches Pumpen liegt typ. bei 0.5-2 Hz.
PUMP_BAND = (0.5, 2.0)
# Bandpass fürs Vorfiltern (entfernt Drift/Gravitation + hochfrequentes Splash-Rauschen).
FILTER_BAND = (0.3, 3.0)


def magnitude_g(raw_i16: np.ndarray, accel_scale: int) -> np.ndarray:
    """(N,3) int16 -> (N,) Beschleunigungsbetrag in g."""
    if raw_i16.size == 0:
        return np.zeros(0)
    a = raw_i16.astype(np.float64) / float(accel_scale)
    return np.sqrt((a * a).sum(axis=1))


def bandpass_fft(sig: np.ndarray, fs: float, lo: float, hi: float) -> np.ndarray:
    """FFT-basierter Bandpass (offline; nullt Bins außerhalb [lo,hi])."""
    n = sig.size
    if n < 4:
        return sig - sig.mean() if n else sig
    spec = np.fft.rfft(sig - sig.mean())
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    spec[(freqs < lo) | (freqs > hi)] = 0.0
    return np.fft.irfft(spec, n=n)


GRAVITY_CUTOFF_HZ = 0.25   # darunter = Schwerkraft/Orientierung (langsam), darüber = Dynamik


def lowpass_fft(sig: np.ndarray, fs: float, cutoff: float) -> np.ndarray:
    """FFT-Tiefpass (offline; nullt Bins > cutoff). Behält den DC-Anteil (Mittelwert)."""
    n = sig.size
    if n < 4:
        return np.asarray(sig, dtype=float)
    spec = np.fft.rfft(sig)
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    spec[freqs > cutoff] = 0.0
    return np.fft.irfft(spec, n=n)


def vertical_against_gravity(raw_i16: np.ndarray, accel_scale: int, fs: float) -> np.ndarray:
    """(N,3) int16 -> (N,) vertikale Dynamik-Beschleunigung GEGEN die Schwerkraft, in g.
    >0 = aufwärts (Push). Schwerkraft-Richtung per Tiefpass je Achse geschätzt, die
    dynamische Beschleunigung (a−g) auf den Schwerkraft-Einheitsvektor projiziert. So
    wird die wechselnde Handgelenks-Orientierung herausgerechnet — ein Pump zeigt als
    Aufwärts-Push (statt als orientierungsloser |Betrag|, der Auf-/Abstrich doppelt zählt)."""
    if raw_i16.ndim != 2 or raw_i16.shape[0] < 4 or raw_i16.shape[1] < 3:
        return np.zeros(raw_i16.shape[0] if raw_i16.ndim == 2 else 0)
    a = raw_i16.astype(np.float64) / float(accel_scale)
    g = np.column_stack([lowpass_fft(a[:, k], fs, GRAVITY_CUTOFF_HZ) for k in range(3)])
    gn = g / np.clip(np.linalg.norm(g, axis=1, keepdims=True), 1e-6, None)
    return np.sum((a - g) * gn, axis=1)


RHYTHM_WIN_S = 6.0
RHYTHM_HOP_S = 1.0


def pump_rhythmicity(sig: np.ndarray, fs: float) -> np.ndarray:
    """Pro-Sample [0..1]: Anteil der Spektral-Energie im Pump-Band (0.5–2 Hz) am Gesamt-Band
    (0.3–3 Hz), in rollenden Fenstern. Hoch = klare Pump-Periodik (auch bei kleiner Amplitude),
    niedrig = rhythmuslos (echtes Gleiten/Rauschen). Dient dazu, den Amplituden-Boden NUR in
    rhythmischen Abschnitten abzusenken (sanftes Pumpen fangen, ohne Gleitphasen zu über-zählen)."""
    sig = np.asarray(sig, dtype=float)
    n = sig.size
    w = int(RHYTHM_WIN_S * fs)
    if w < 4 or n < w:
        return np.zeros(n)
    hop = max(int(RHYTHM_HOP_S * fs), 1)
    win = np.hanning(w)
    f = np.fft.rfftfreq(w, 1.0 / fs)
    in_tot = (f >= FILTER_BAND[0]) & (f <= FILTER_BAND[1])
    in_pmp = (f >= PUMP_BAND[0]) & (f <= PUMP_BAND[1])
    centers, vals = [], []
    for start in range(0, n - w + 1, hop):
        spec = np.abs(np.fft.rfft(sig[start:start + w] * win)) ** 2
        tot = spec[in_tot].sum()
        centers.append(start + w // 2)
        vals.append(float(spec[in_pmp].sum() / tot) if tot > 0 else 0.0)
    return np.interp(np.arange(n), centers, vals, left=vals[0], right=vals[-1])


def _spectral_entropy(power: np.ndarray) -> float:
    p = power[power > 0]
    if p.size == 0:
        return 0.0
    p = p / p.sum()
    return float(-(p * np.log2(p)).sum() / np.log2(p.size)) if p.size > 1 else 0.0


def window_features(
    mag: np.ndarray,
    fs: float,
    win_s: float = 4.0,
    hop_s: float = 2.0,
) -> list[dict]:
    """Gleitende Fenster über das Magnituden-Signal -> Feature-Dicts.

    Pro Fenster:
      t_center_ms, dom_freq (Hz im Pump-Band), band_power_ratio (Pump-Band / gesamt),
      rms (g, bandpass-gefiltert), spectral_entropy (0..1, niedrig = klarer Rhythmus).
    """
    if mag.size == 0:
        return []
    win = max(int(round(win_s * fs)), 8)
    hop = max(int(round(hop_s * fs)), 1)
    filt = bandpass_fft(mag, fs, *FILTER_BAND)

    out: list[dict] = []
    for start in range(0, max(filt.size - win + 1, 1), hop):
        seg = filt[start : start + win]
        if seg.size < 8:
            break
        seg = seg - seg.mean()
        spec = np.abs(np.fft.rfft(seg)) ** 2
        freqs = np.fft.rfftfreq(seg.size, d=1.0 / fs)

        band = (freqs >= PUMP_BAND[0]) & (freqs <= PUMP_BAND[1])
        total_power = spec.sum() + 1e-12
        band_power = spec[band].sum()

        if band.any() and spec[band].sum() > 0:
            dom_freq = float(freqs[band][np.argmax(spec[band])])
        else:
            dom_freq = 0.0

        out.append(
            {
                "t_center_ms": int(round((start + win / 2) / fs * 1000)),
                "i_start": int(start),
                "i_end": int(start + win),
                "dom_freq": round(dom_freq, 3),
                "band_power_ratio": round(float(band_power / total_power), 4),
                "rms": round(float(np.sqrt(np.mean(seg * seg))), 4),
                "spectral_entropy": round(_spectral_entropy(spec), 4),
            }
        )
    return out
