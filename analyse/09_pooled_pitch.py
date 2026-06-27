"""Gepoolte Pitch-Pump-Analyse über ALLE Läufe.

Foiling-Fenster:
  - P3/P4: aus dem fenix-Handgelenk-GPS (Wahrheit), Mast aus FIT.
  - Orphans (20:17/21:05/21:13): Accel-Detektor (gleitende Heave-RMS im Flug-Band +
    rhythmischer Pitch), VALIDIERT an P3/P4 gegen die GPS-Wahrheit.
Pro Lauf: Pitch/Roll/Heave aus Gravitation, Anisotropie, Pitch-Kadenz, Phasenlag
Heave→Pitch. Gepoolt: Phasenraum-Overlay + aggregierte Statistik.
"""
import sys
import numpy as np
from scipy.signal import butter, filtfilt, welch, hilbert
import lib, fitlib

sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.gps import analyze_gps   # echte On-Foil-Erkennung der Webseite

FITS = lib.Path(__file__).parent / "fits"


def decompose(t, a, hz):
    bg, ag = butter(2, 0.5 / (hz / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
    g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
    gu = grav / np.linalg.norm(grav, axis=1, keepdims=True)
    tiltvec = gu - (gu @ g0u)[:, None] * g0u
    ex = np.array([1.0, 0, 0]); ef = ex - (ex @ g0u) * g0u; ef /= np.linalg.norm(ef)
    el = np.cross(g0u, ef)
    pitch = np.degrees(np.arcsin(np.clip(tiltvec @ ef, -1, 1)))
    roll = np.degrees(np.arcsin(np.clip(tiltvec @ el, -1, 1)))
    heave = (a - grav) @ g0u
    return pitch, roll, heave


def heave_rms(heave, hz, win_s=2.0):
    w = int(hz * win_s)
    return np.sqrt(np.convolve(heave**2, np.ones(w) / w, mode="same"))


def onfoil_windows(src):
    """Foiling-Fenster (abs unix) via echter Webseiten-On-Foil-Erkennung.
    src=('fit',name) -> fenix-FIT-GPS; src=('chunk',id) -> fenix-Chunk-GPS."""
    kind, ref = src
    if kind == "fit":
        sm, t0 = fitlib.load_fit_gps_samples(str(FITS / ref))
    else:
        g = lib.load_gps(ref); t0 = lib.start_unix(ref)
        sm = [[r[0], r[1], r[2], r[3], r[4] if len(r) > 4 else None,
               r[5] if len(r) > 5 else None] for r in g]
    res = analyze_gps(sm, gps_hz=1)
    return [(t0 + s["t_start_ms"] / 1000.0, t0 + s["t_end_ms"] / 1000.0) for s in res["segments"]]


def most_rhythmic_window(t, pitch, hz, dur_s=30, band=(0.4, 1.5)):
    """Fenster der Länge dur_s mit maximaler Pitch-Energie im Pump-Band (rhythmischstes
    Pumpen). Robust ohne GPS; klar als 'Kandidat' zu kennzeichnen."""
    n = len(pitch); w = int(dur_s * hz); hop = int(2 * hz)
    if n < w:
        return t[0], t[-1]
    best = (-1, 0)
    for s in range(0, n - w + 1, hop):
        seg = pitch[s:s + w] - pitch[s:s + w].mean()
        f, p = welch(seg, fs=hz, nperseg=min(len(seg), hz * 8))
        bp = p[(f >= band[0]) & (f <= band[1])].sum()
        if bp > best[0]:
            best = (bp, s)
    s = best[1]
    return t[s], t[s + w - 1]


def run_features(t, a, hz, lo, hi):
    pitch, roll, heave = decompose(t, a, hz)
    f, p = welch(pitch, fs=hz, nperseg=min(len(pitch), hz * 8)); sel = (f > 0.3) & (f < 2.0)
    fp = f[sel][np.argmax(p[sel])]
    bb, aa = butter(2, [max(0.15, fp - 0.3) / (hz / 2), (fp + 0.3) / (hz / 2)], "band")
    hb = filtfilt(bb, aa, heave); pb = filtfilt(bb, aa, pitch)
    phlag = np.degrees(np.angle(np.mean(np.exp(1j * (np.angle(hilbert(hb)) - np.angle(hilbert(pb)))))))
    P = np.c_[pitch - pitch.mean(), roll - roll.mean()]
    _, sv, _ = np.linalg.svd(P - P.mean(0), full_matrices=False)
    return dict(pitch_rms=pitch.std(), roll_rms=roll.std(), aniso=sv[0] / sv[1],
                cad_hz=fp, phlag=phlag, pb=pb, hb=hb, n=len(t))


# --- Läufe definieren ---
GPS_RUNS = [("P3 20:26", "mast_P3_314.fit", ("fit", "fenix_P3_309.fit")),
            ("P4 20:38", "mast_P4_315.fit", ("chunk", 310))]
ORPHANS = [("20:17", "mast_x_2017.fit"), ("21:05", "mast_x_2105.fit"), ("21:13", "mast_x_2113.fit")]
LO, HI = 0.03, 0.14

print("=== On-Foil-bestätigte Läufe (Webseiten-Detektor auf fenix-GPS) ===")
runs = []
for label, fn, src in GPS_RUNS:
    t, a = fitlib.load_fit_accel(str(FITS / fn)); hz = round(len(t) / (t[-1] - t[0]))
    for k, win in enumerate(onfoil_windows(src)):
        m = (t >= win[0]) & (t <= win[1])
        if m.sum() < hz * 6:
            continue
        tag = f"{label}" + (f"·{k+1}" if k else "")
        print(f"{tag}: On-Foil {win[1]-win[0]:.0f}s, Mast-Abdeckung {m.sum()/hz:.0f}s")
        runs.append((tag + " (OnFoil)", run_features(t[m], a[m], hz, LO, HI)))

print("\n=== Orphans (rhythmischstes 30s-Pump-Fenster, GPS-unbestätigt) ===")
for label, fn in ORPHANS:
    t, a = fitlib.load_fit_accel(str(FITS / fn)); hz = round(len(t) / (t[-1] - t[0]))
    pitch, _, _ = decompose(t, a, hz)
    w0, w1 = most_rhythmic_window(t, pitch, hz)
    m = (t >= w0) & (t <= w1)
    print(f"{label}: Pump-Fenster bei t={w0-t[0]:.0f}..{w1-t[0]:.0f}s")
    runs.append((label + " (Kand.)", run_features(t[m], a[m], hz, LO, HI)))

print("\n=== POOL: Pro-Lauf-Features ===")
print(f"{'Lauf':16s} {'n':>5s} {'Pitch°':>7s} {'Roll°':>6s} {'Aniso':>6s} {'Kad/min':>7s} {'Phlag°':>7s}")
for label, r in runs:
    print(f"{label:16s} {r['n']:5d} {r['pitch_rms']:7.1f} {r['roll_rms']:6.1f} "
          f"{r['aniso']:6.2f} {r['cad_hz']*60:7.0f} {r['phlag']:7.0f}")
pr = np.array([r['pitch_rms'] for _, r in runs]); rr = np.array([r['roll_rms'] for _, r in runs])
print(f"\nMittel: Pitch-RMS {pr.mean():.1f}°  Roll-RMS {rr.mean():.1f}°  Pitch/Roll {pr.mean()/rr.mean():.1f}x")

# --- gepoolter Phasenraum ---
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
OUT = lib.Path(__file__).parent / "out"
fig, axes = plt.subplots(1, 2, figsize=(14, 6))
ax = axes[0]
for label, r in runs:
    pb = r['pb'] / (np.abs(r['pb']).max() + 1e-9); hb = r['hb'] / (np.abs(r['hb']).max() + 1e-9)
    ax.plot(pb, hb, lw=0.6, alpha=0.6, label=f"{label} ({r['cad_hz']*60:.0f}/min, {r['phlag']:.0f}°)")
ax.set_xlabel("Pitch (norm.)"); ax.set_ylabel("Heave (norm.)")
ax.set_title("Gepoolter Phasenraum — alle Läufe", fontsize=10, loc="left"); ax.legend(fontsize=7)
ax = axes[1]
labels = [l for l, _ in runs]
ax.bar(range(len(runs)), pr, 0.4, label="Pitch-RMS", color="tab:orange")
ax.bar([x + 0.4 for x in range(len(runs))], rr, 0.4, label="Roll-RMS", color="tab:blue")
ax.set_xticks([x + 0.2 for x in range(len(runs))]); ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=7)
ax.set_ylabel("°"); ax.set_title("Pitch vs Roll je Lauf", fontsize=10, loc="left"); ax.legend(fontsize=8)
fig.tight_layout(); p = OUT / "09_pooled_pitch.png"; fig.savefig(p, dpi=150, bbox_inches="tight")
print("wrote", p)
