"""Read-only Test: kadenz-GEFUEHRTES Peak-Picking (Weg 2).

In rhythmischen, energiereichen Abschnitten wird die lokale Kadenz (dominante
Pump-Frequenz) geschaetzt und pro Periode das ECHTE lokale Maximum als Pump gewaehlt.
-> Count wie der Kadenz-Zaehler, aber mit echten Pump-Positionen (Marker=Count).
Vergleich gegen run_pumps + gegen den reinen Kadenz-Count. Aendert nichts.

Aufruf: .venv/bin/python -m scripts.pump_cadence_peaks
"""
from __future__ import annotations

import glob
import numpy as np

from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
from app.ml import pumps
from scripts.pump_calibrate import load, SCALE
from scripts.pump_cadence_calibrate import _dom_freq, cadence_count


def cadence_peaks(sig, fs, win_s=5.0, blo=0.8, bhi=2.0, rms_gate=0.02):
    """-> Pump-Positionen (Indizes). Ein echter Peak je Kadenz-Periode in
    rhythmischen Abschnitten."""
    n = sig.size
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
    peaks = []
    i = 0
    while i < n:
        if not rms_ok[i]:
            i += 1
            continue
        j = i
        while j < n and rms_ok[j]:
            j += 1
        region = sig[i:j]
        if region.size >= fs:
            f = _dom_freq(region, fs, blo, bhi)
            if f > 0:
                T = max(int(round(fs / f)), 1)
                p = 0
                while p < region.size:
                    seg = region[p:p + T]
                    if seg.size > 0:
                        peaks.append(i + p + int(np.argmax(seg)))
                    p += T
        i = j
    return np.array(sorted(set(peaks)), dtype=int)


def cadence_peaks_v2(sig, fs, win_s=5.0, blo=0.8, bhi=2.0, rms_gate=0.02):
    """Wie cadence_peaks, aber LOKAL adaptive Periode: an jeder Position die
    Kadenz aus einem Fenster um die Position schaetzen -> folgt Kadenz-Wechseln."""
    n = sig.size
    if n < fs:
        return np.empty(0, dtype=int)
    w = max(int(round(win_s * fs)), 1)
    hop = max(int(round(0.5 * fs)), 1)
    rms_ok = np.zeros(n, dtype=bool)
    for pos in range(0, n, hop):
        seg = sig[pos:pos + w]
        if seg.size >= fs and float(np.sqrt(np.mean(seg * seg))) >= rms_gate:
            rms_ok[pos:min(pos + hop, n)] = True
    peaks = []
    i = 0
    while i < n:
        if not rms_ok[i]:
            i += 1
            continue
        j = i
        while j < n and rms_ok[j]:
            j += 1
        if j - i >= fs:
            pos = i
            while pos < j:
                lo = max(pos - w // 2, i)
                hi = min(pos + w // 2, j)
                f = _dom_freq(sig[lo:hi], fs, blo, bhi)
                if f <= 0:
                    break
                T = max(int(round(fs / f)), 1)
                seg = sig[pos:min(pos + T, j)]
                if seg.size > 0:
                    peaks.append(pos + int(np.argmax(seg)))
                pos += T
        i = j
    return np.array(sorted(set(peaks)), dtype=int)


def main():
    data = []
    for f in sorted(glob.glob("/home/jan/garmin-connect-iq/analyse/train_foil_status/*.fit")):
        r = load(f)
        if not r:
            continue
        accel, hz, a0, runs = r
        vsig = bandpass_fft(vertical_against_gravity(accel, SCALE, hz), hz, *FILTER_BAND)
        for st, dur, truth in runs:
            st2 = st.replace(tzinfo=None) if getattr(st, "tzinfo", None) else st
            i_lo = max(int(round((st2 - a0).total_seconds() * hz)), 0)
            i_hi = min(i_lo + int(round(dur * hz)), vsig.size)
            if i_hi - i_lo < hz:
                continue
            data.append((truth, vsig[i_lo:i_hi], hz))
    truth = np.array([d[0] for d in data], float)

    def sc(preds):
        p = np.array(preds, float)
        err = np.abs(p - truth)
        return (p.sum() / max(truth.sum(), 1), err.mean(), np.mean(err / np.maximum(truth, 1)))

    peak = sc([pumps.find_pumps_local(s, fs, k=0.6).size for _, s, fs in data])
    cad = sc([cadence_count(s, fs, 5.0, 1.0, 0.8, 2.0, 0.02) for _, s, fs in data])
    cp = sc([cadence_peaks(s, fs).size for _, s, fs in data])
    cp2 = sc([cadence_peaks_v2(s, fs).size for _, s, fs in data])
    print(f"{len(data)} Laeufe, Wahrheit Σ{int(truth.sum())}\n")
    print(f"{'Methode':32}{'ratio':>7}{'MAE':>7}{'rel%':>7}")
    print(f"{'IST Peak-Picking (k=0.6)':32}{peak[0]:>7.2f}{peak[1]:>7.1f}{peak[2]*100:>6.0f}%")
    print(f"{'Kadenz-Count (nur Zahl)':32}{cad[0]:>7.2f}{cad[1]:>7.1f}{cad[2]*100:>6.0f}%")
    print(f"{'Kadenz-Peaks Weg2 (feste Periode)':32}{cp[0]:>7.2f}{cp[1]:>7.1f}{cp[2]*100:>6.0f}%")
    print(f"{'Kadenz-Peaks Weg2 (lokal adaptiv)':32}{cp2[0]:>7.2f}{cp2[1]:>7.1f}{cp2[2]*100:>6.0f}%")
    # Plausibilitaet Positionen: mittlerer Abstand der Peaks (soll ~1/Kadenz)
    gaps = []
    for _, s, fs in data:
        pk = cadence_peaks_v2(s, fs)
        if pk.size >= 2:
            gaps.extend(np.diff(pk) / fs)
    if gaps:
        print(f"\nPeak-Abstaende Ø {np.mean(gaps):.2f}s (={1/np.mean(gaps):.2f} Hz) — Plausi-Check echte Positionen")


if __name__ == "__main__":
    main()
