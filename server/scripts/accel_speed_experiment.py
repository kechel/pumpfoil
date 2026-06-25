#!/usr/bin/env python3
"""Experiment: Gibt es eine messbare Geschwindigkeits-Variation INNERHALB eines
Pump-Zyklus?

Idee (statt Accel zu integrieren -> driftet + Orientierung unbekannt):
  - Accel liefert nur die PRÄZISEN Pump-Zeitpunkte (das kann er gut).
  - Die echte 1-Hz-GPS-Geschwindigkeit wird per PHASE-FOLDING auf die Pump-Phase
    (0 = am Pump, 1 = kurz vor dem nächsten Pump) gelegt. Über viele Zyklen fallen
    die GPS-Samples auf verschiedene Phasen -> die mittlere Intra-Zyklus-Kurve
    rekonstruiert sich, ohne Integration und ohne Orientierungsproblem.

Ausgabe: PNG mit (a) Accel-Pump-Wellenform (Referenz) und (b) gefalteter
GPS-Geschwindigkeit (Residuum) + Diagnostik auf stdout.

Aufruf:  python3 scripts/accel_speed_experiment.py <session_uuid> [out.png]
"""
import json
import sys
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

DATA = Path(__file__).resolve().parents[1] / "data"

# --- Konstanten aus app/ml/pumps.py + features.py (1:1) ---
FILTER_BAND = (0.3, 3.0)
MIN_RMS = 0.05
PEAK_PROMINENCE_STD = 0.6
MIN_PEAK_ABS_G = 0.08
MIN_PEAK_DISTANCE_S = 0.45
FOIL_KMH = 10.0           # einfacher Foiling-Gate fürs Experiment
CYCLE_MIN_S, CYCLE_MAX_S = 0.45, 2.0   # plausible Pump-Zyklusdauer
N_BINS = 12


def load_meta(d): return json.load(open(d / "meta.json"))


def load_gps(d):
    samples = []
    for f in sorted((d / "gps").glob("*.json"), key=lambda p: int(p.stem)):
        samples += json.load(open(f))
    return samples


def load_accel(d):
    parts = []
    for f in sorted((d / "accel").glob("*.bin"), key=lambda p: int(p.stem)):
        parts.append(np.frombuffer(f.read_bytes(), dtype="<i2"))
    if not parts:
        return np.empty((0, 3), dtype=np.int16)
    flat = np.concatenate(parts)
    n = (flat.size // 3) * 3
    return flat[:n].reshape(-1, 3)


def magnitude_g(raw, scale):
    a = raw.astype(np.float64) / float(scale)
    return np.sqrt((a * a).sum(axis=1))


def bandpass_fft(sig, fs, lo, hi):
    n = sig.size
    if n < 4:
        return sig - sig.mean() if n else sig
    spec = np.fft.rfft(sig - sig.mean())
    freqs = np.fft.rfftfreq(n, d=1.0 / fs)
    spec[(freqs < lo) | (freqs > hi)] = 0.0
    return np.fft.irfft(spec, n=n)


def find_peaks(sig, fs):
    if sig.size < 3:
        return np.empty(0, dtype=int)
    thr = max(PEAK_PROMINENCE_STD * np.std(sig), MIN_PEAK_ABS_G)
    min_dist = max(int(round(MIN_PEAK_DISTANCE_S * fs)), 1)
    cand = np.where((sig[1:-1] > sig[:-2]) & (sig[1:-1] >= sig[2:]) & (sig[1:-1] > thr))[0] + 1
    if cand.size == 0:
        return cand
    order = cand[np.argsort(-sig[cand])]
    taken = []
    blocked = np.zeros(sig.size, dtype=bool)
    for idx in order:
        if not blocked[idx]:
            taken.append(int(idx))
            blocked[max(idx - min_dist, 0):min(idx + min_dist + 1, sig.size)] = True
    return np.array(sorted(taken), dtype=int)


def moving_mean(x, win):
    """Zentrierter gleitender Mittelwert (NaN-robust) zum Detrenden."""
    win = max(int(win), 1)
    k = np.ones(win) / win
    valid = ~np.isnan(x)
    xv = np.where(valid, x, 0.0)
    num = np.convolve(xv, k, mode="same")
    den = np.convolve(valid.astype(float), k, mode="same")
    return num / np.where(den > 0, den, np.nan)


def main(uuid, out=None):
    d = DATA / uuid
    meta = load_meta(d)
    fs = float(meta["accel_hz"])
    scale = int(meta["accel_scale"])
    gps = load_gps(d)
    accel = load_accel(d)
    if accel.shape[0] == 0 or len(gps) < 10:
        print("zu wenig Daten"); return

    gt = np.array([g[0] for g in gps], dtype=float)                       # ms
    gkmh = np.array([(g[3] * 3.6) if g[3] is not None else np.nan for g in gps], dtype=float)
    gps_dt = float(np.median(np.diff(gt))) / 1000.0                       # s
    gps_hz = 1.0 / gps_dt if gps_dt > 0 else 1.0
    foil = gkmh > FOIL_KMH

    # --- Pump-Zeitpunkte aus Accel ---
    mag = magnitude_g(accel, scale)
    filt = bandpass_fft(mag, fs, *FILTER_BAND)
    rms = float(np.sqrt(np.mean(filt * filt)))
    peaks = find_peaks(filt, fs)
    ptimes = peaks / fs * 1000.0                                          # ms
    # nur Pumps während Foiling
    gidx = np.clip(np.searchsorted(gt, ptimes), 0, gt.size - 1)
    ptimes = ptimes[foil[gidx]]
    ptimes.sort()

    if ptimes.size < 20:
        print(f"zu wenig Pumps im Foiling ({ptimes.size}) — RMS={rms:.3f}g, "
              f"Foiling-Anteil={100*np.mean(foil):.0f}%"); return

    intervals = np.diff(ptimes) / 1000.0
    cad = 1.0 / np.median(intervals)

    # --- Phase je GPS-Sample (im Foiling) ---
    k = np.searchsorted(ptimes, gt) - 1
    valid = (k >= 0) & (k < ptimes.size - 1) & foil
    k = k[valid]
    t = gt[valid]
    t0 = ptimes[k]; t1 = ptimes[k + 1]
    dur = (t1 - t0) / 1000.0
    good = (dur >= CYCLE_MIN_S) & (dur <= CYCLE_MAX_S)
    phase = ((t - t0) / (t1 - t0))[good]
    # Detrend: Variation innerhalb des Zyklus = Speed minus lokalen Trend (~5 s).
    detr = (gkmh - moving_mean(gkmh, round(5 * gps_hz)))
    spd_res = detr[valid][good]
    ok = ~np.isnan(spd_res)
    phase = phase[ok]; spd_res = spd_res[ok]

    # --- Phase-Folding GPS-Speed ---
    edges = np.linspace(0, 1, N_BINS + 1)
    ctr = 0.5 * (edges[:-1] + edges[1:])
    bidx = np.clip(np.digitize(phase, edges) - 1, 0, N_BINS - 1)
    mean_s = np.array([spd_res[bidx == b].mean() if np.any(bidx == b) else np.nan for b in range(N_BINS)])
    sem_s = np.array([spd_res[bidx == b].std() / max(np.sqrt(np.sum(bidx == b)), 1) if np.any(bidx == b) else np.nan for b in range(N_BINS)])
    cnt_s = np.array([int(np.sum(bidx == b)) for b in range(N_BINS)])

    # --- Phase-Folding Accel-Wellenform (Referenz) ---
    at = np.arange(mag.size) / fs * 1000.0
    ak = np.searchsorted(ptimes, at) - 1
    av = (ak >= 0) & (ak < ptimes.size - 1)
    ak = ak[av]
    adur = (ptimes[ak + 1] - ptimes[ak]) / 1000.0
    agood = (adur >= CYCLE_MIN_S) & (adur <= CYCLE_MAX_S)
    aphase = ((at[av] - ptimes[ak]) / (ptimes[ak + 1] - ptimes[ak]))[agood]
    afilt = filt[av][agood]
    abidx = np.clip(np.digitize(aphase, edges) - 1, 0, N_BINS - 1)
    amean = np.array([afilt[abidx == b].mean() if np.any(abidx == b) else np.nan for b in range(N_BINS)])

    p2p = np.nanmax(mean_s) - np.nanmin(mean_s)
    typ_sem = np.nanmedian(sem_s)

    # --- Diagnostik ---
    print(f"Session {uuid}")
    print(f"  GPS {gps_hz:.2f} Hz, Accel {fs:.0f} Hz | Foiling {100*np.mean(foil):.0f}% | Accel-RMS {rms:.3f} g")
    print(f"  Pumps (Foiling): {ptimes.size} | Kadenz ~{cad:.2f} Hz ({1/cad:.2f} s/Zyklus)")
    print(f"  GPS-Punkte gefaltet: {phase.size} | Phasen-Abdeckung (std): {np.std(phase):.2f} (gleichverteilt~0.29)")
    print(f"  Speed-Variation Peak-zu-Tal: {p2p:.2f} km/h | typ. Stderr/Bin: {typ_sem:.2f} km/h")
    snr = p2p / (2 * typ_sem) if typ_sem > 0 else float("nan")
    print(f"  -> grobes SNR (p2p / 2·sem): {snr:.1f}  {'(Signal!)' if snr >= 2 else '(im Rauschen)'}")
    print(f"  Bin-Belegung: {cnt_s.tolist()}")

    # --- Plot ---
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(8, 7), sharex=True)
    ax1.plot(ctr, amean, "-o", color="#7c3aed")
    ax1.axhline(0, color="#888", lw=0.7)
    ax1.set_ylabel("Accel bandpass [g]")
    ax1.set_title(f"{uuid}\nPump-Wellenform (Accel) — Kadenz ~{cad:.2f} Hz, {ptimes.size} Pumps")
    ax2.errorbar(ctr, mean_s, yerr=sem_s, fmt="-o", color="#0ea5e9", capsize=3)
    ax2.axhline(0, color="#888", lw=0.7)
    ax2.axvline(0, color="#22c55e", lw=1, ls="--")
    ax2.set_ylabel("GPS-Speed Residuum [km/h]")
    ax2.set_xlabel("Phase im Pump-Zyklus  (0 = Pump → 1 = nächster Pump)")
    ax2.set_title(f"Gefaltete GPS-Geschwindigkeit — p2p {p2p:.2f} km/h, SNR {snr:.1f}, n={phase.size}")
    fig.tight_layout()
    out = out or f"/tmp/claude-1000/-home-jan-garmin-connect-iq/2ca3f326-0f57-4c37-a68b-335638e9a918/scratchpad/fold_{uuid[:12]}.png"
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=110)
    print(f"  PNG: {out}")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
