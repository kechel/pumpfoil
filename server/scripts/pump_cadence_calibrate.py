"""Read-only: kadenz-basierten Pump-Zähler gegen run_pumps-Wahrheit tunen.

Vergleicht den aktuellen Peak-Zähler (find_pumps_local) mit einem kadenz-basierten
Zähler (gleitendes Fenster: lokale dominante Pump-Frequenz × Zeit, RMS-gegated) und
grid-sucht dessen Parameter gegen lap.run_pumps. Ändert NICHTS an der Pipeline.

Aufruf: .venv/bin/python -m scripts.pump_cadence_calibrate
"""
from __future__ import annotations

import glob
import numpy as np

from app.ml.features import bandpass_fft, vertical_against_gravity, FILTER_BAND
from app.ml import pumps
from scripts.pump_calibrate import load, SCALE


def _dom_freq(seg, fs, blo, bhi):
    if seg.size < fs:
        return 0.0
    w = seg * np.hanning(seg.size)
    sp = np.abs(np.fft.rfft(w))
    fr = np.fft.rfftfreq(seg.size, 1.0 / fs)
    band = (fr >= blo) & (fr <= bhi)
    if not band.any():
        return 0.0
    return float(fr[band][np.argmax(sp[band])])


def cadence_count(sig, fs, win_s, hop_s, blo, bhi, rms_gate):
    """Σ (lokale dominante Frequenz × hop) über rhythmische, energiereiche Fenster."""
    n = sig.size
    w = max(int(round(win_s * fs)), 1)
    h = max(int(round(hop_s * fs)), 1)
    total = 0.0
    pos = 0
    while pos < n:
        seg = sig[pos:pos + w]
        if seg.size >= fs:
            rms = float(np.sqrt(np.mean(seg * seg)))
            if rms >= rms_gate:
                f = _dom_freq(seg, fs, blo, bhi)
                dt = min(h, n - pos) / fs
                total += f * dt
        pos += h
    return total


def collect():
    """-> Liste (truth, sig_segment, fs) pro ausgerichtetem Lap."""
    out = []
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
            out.append((truth, vsig[i_lo:i_hi], hz))
    return out


def score(preds, truth):
    p = np.array(preds, float); t = np.array(truth, float)
    err = np.abs(p - t)
    return dict(ratio=p.sum() / max(t.sum(), 1), mae=err.mean(),
                rel=np.mean(err / np.maximum(t, 1)), bias=np.mean(p - t))


def main():
    data = collect()
    truth = [d[0] for d in data]
    print(f"{len(data)} ausgerichtete Laeufe, Wahrheit Σ{int(sum(truth))}\n")

    s = score([pumps.find_pumps_local(sig, fs, k=0.6).size for _, sig, fs in data], truth)
    print(f"IST (Peak-Picking k=0.6): ratio {s['ratio']:.2f}  MAE {s['mae']:.1f}  rel {s['rel']*100:.0f}%  bias {s['bias']:+.1f}\n")

    print("Kadenz-Zaehler Grid (win,hop,band,gate):")
    print(f"  {'win':>4}{'band':>10}{'gate':>6} {'ratio':>6}{'MAE':>6}{'rel%':>6}{'bias':>7}")
    best = None
    for win in (3.0, 4.0, 5.0):
        for (blo, bhi) in ((0.6, 2.5), (0.7, 2.2), (0.8, 2.0), (0.6, 3.0)):
            for gate in (0.02, 0.03, 0.05):
                preds = [cadence_count(sig, fs, win, 1.0, blo, bhi, gate) for _, sig, fs in data]
                s = score(preds, truth)
                tag = f"  {win:>4}{f'{blo}-{bhi}':>10}{gate:>6} {s['ratio']:>6.2f}{s['mae']:>6.1f}{s['rel']*100:>5.0f}%{s['bias']:>+7.1f}"
                # bestes nach MAE, aber ratio in [0.9,1.15]
                cand = (s['mae'], tag, (win, blo, bhi, gate), s)
                if 0.9 <= s['ratio'] <= 1.15 and (best is None or cand[0] < best[0]):
                    best = cand
                print(tag)
    if best:
        print(f"\nBESTE Config (ratio~1, min MAE): win={best[2][0]} band={best[2][1]}-{best[2][2]} "
              f"gate={best[2][3]} -> ratio {best[3]['ratio']:.2f} MAE {best[3]['mae']:.1f} rel {best[3]['rel']*100:.0f}%")


if __name__ == "__main__":
    main()
