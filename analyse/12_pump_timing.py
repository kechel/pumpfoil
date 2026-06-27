"""Verifikation der Pump-ZEITPUNKTE (Karten-Marker) gegen die Foil-Wahrheit.

Produkt markiert Pumps per pump_times_ms() auf dem Wrist-Accel. Wahrheit = Foil-Surge
(fore/aft-Beschleunigung am Mast, größte Pump-Achse). Frage: liegen die Wrist-Marker
systematisch zu früh/spät ggü. dem echten Pump-Schub?

Präziser Clock-Sync über den koinzidenten Impuls (Sprung/Handling vor dem Lauf),
unabhängig vom Pump-Rhythmus -> misst echten algorithmischen Versatz, nicht weggesynct.
"""
import sys
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
import numpy as np
from scipy.signal import butter, filtfilt, find_peaks
import lib, fitlib
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.gps import analyze_gps
from app.ml.pumps import pump_times_ms

FITS = lib.Path(__file__).parent / "fits"
OUT = lib.Path(__file__).parent / "out"


def dynmag(a, hz):
    b, ah = butter(2, 0.5 / (hz / 2), "high")
    return np.linalg.norm(filtfilt(b, ah, a, axis=0), axis=1)


def surge(a, hz):
    """fore/aft dynamische Beschl. (Pump-Band) am Mast = Foil-Schub."""
    bg, ag = butter(2, 0.5 / (hz / 2), "low"); grav = filtfilt(bg, ag, a, axis=0)
    g0u = grav.mean(0); g0u /= np.linalg.norm(g0u)
    ex = np.array([1.0, 0, 0]); ef = ex - (ex @ g0u) * g0u; ef /= np.linalg.norm(ef)
    bb, aa = butter(2, [0.3 / (hz / 2), 1.5 / (hz / 2)], "band")
    return filtfilt(bb, aa, (a - grav) @ ef)


# --- P3 laden ---
tf, af = fitlib.load_fit_accel(str(FITS / "fenix_P3_309.fit")); hzf = round(len(tf) / (tf[-1] - tf[0]))
tm, am = fitlib.load_fit_accel(str(FITS / "mast_P3_314.fit")); hzm = round(len(tm) / (tm[-1] - tm[0]))
sm, gt0 = fitlib.load_fit_gps_samples(str(FITS / "fenix_P3_309.fit"))
seg = analyze_gps(sm, gps_hz=1)["segments"][0]
on0, on1 = gt0 + seg["t_start_ms"] / 1000.0, gt0 + seg["t_end_ms"] / 1000.0

# --- Clock-Offset via Hüllkurven-Kreuzkorrelation (kein scharfer Impuls vorhanden) ---
# ACHTUNG: FR55 unter Wasser ohne GPS -> Uhr nicht sauber gesynct. Offset nur ~±1s genau,
# halber Pump-Abstand. Per-Pump-Timing daher NICHT auf ~100ms verifizierbar (s. Caveat).
from scipy.signal import correlate
mf = dynmag(af, hzf); mm = dynmag(am, hzm)
lo, hi = on0 - 70, on1 + 10
grid = np.arange(lo, hi, 1 / 50.0)
ef = np.interp(grid, tf, mf); em = np.interp(grid, tm, mm)
ef = (ef - ef.mean()) / ef.std(); em = (em - em.mean()) / em.std()
c = correlate(ef, em, mode="full") / len(ef)
offset = (np.argmax(c) - (len(em) - 1)) / 50.0
print(f"Clock-Offset (fenix−mast) via Hüllkurven-Xcorr: {offset:+.2f}s  peak={c.max():.2f}  (±~1s unsicher!)")

# --- Wrist-Pump-Marker (echte Produkt-Funktion) im Foiling-Fenster ---
mwin = (tf >= on0) & (tf <= on1)
mag_g = np.linalg.norm(af[mwin] / 1.0, axis=1)     # af bereits in g (/1000 im Loader)
pt_ms = pump_times_ms(mag_g, hzf)
wrist_pumps = tf[mwin][0] + pt_ms / 1000.0          # abs Wrist-Zeit

# --- Mast-Foil-Schub-Peaks (Wahrheit), in Wrist-Zeit transformiert (+offset) ---
sg = surge(am, hzm); mwm = (tm >= on0 - offset) & (tm <= on1 - offset)
sgw = sg[mwm]; tmw = tm[mwm] + offset               # in fenix-Zeit
pk, _ = find_peaks(sgw, distance=int(0.5 * hzm), height=sgw.std() * 0.6)
mast_pumps = tmw[pk]

# --- Match: jeder Wrist-Pump -> nächster Mast-Schub ---
offs = []
for w in wrist_pumps:
    if mast_pumps.size:
        d = w - mast_pumps[np.argmin(np.abs(mast_pumps - w))]
        if abs(d) < 1.0:
            offs.append(d)
offs = np.array(offs)
dur = on1 - on0
print(f"Foiling {dur:.0f}s | Wrist-Pumps={len(wrist_pumps)} ({len(wrist_pumps)/dur*60:.0f}/min) | "
      f"Mast-Schübe={len(mast_pumps)} ({len(mast_pumps)/dur*60:.0f}/min) | Wrist {len(wrist_pumps)/max(len(mast_pumps),1)*100-100:+.0f}%")
print("Per-Pump-Versatz NICHT belastbar (Clock-Sync ±~1s ~ halber Pump-Abstand) — nur Anzahl/Kadenz aussagekräftig.")

# --- Plot: 2 Zeilen (Übersicht + Zoom auf 12s), groß ---
t0 = on0
wmag = dynmag(af, hzf)[mwin]
mast_curve = sgw / sgw.std() * wmag.std() + wmag.mean()
fig, axes = plt.subplots(2, 1, figsize=(16, 9))
for ax, (xa, xb, ttl) in zip(axes, [(0, on1 - on0, "ganzer Lauf"), (2, 14, "Zoom 2–14 s")]):
    ax.plot(tf[mwin] - t0, wmag, color="tab:blue", lw=0.8, alpha=0.8, label="Wrist |a_dyn| (100Hz)")
    ax.plot(tmw - t0, mast_curve, color="tab:orange", lw=1.6, alpha=0.85, label="Mast Foil-Schub fore/aft (skaliert)")
    for w in wrist_pumps:
        ax.axvline(w - t0, color="tab:blue", ls="-", lw=1.3, alpha=0.7)
    for mp in mast_pumps:
        ax.axvline(mp - t0, color="tab:orange", ls="--", lw=1.3, alpha=0.7)
    ax.set_xlim(xa, xb); ax.set_ylabel("Aktivität"); ax.legend(fontsize=9, loc="upper right")
    ax.set_title(ttl, fontsize=10, loc="left")
axes[0].set_title(f"P3 Pump-Timing — Wrist-Marker (blau durchgez., {len(wrist_pumps)}) vs Foil-Schub-Peaks "
                  f"(orange gestrich., {len(mast_pumps)}) · Clock-Sync ±~1 s ⇒ nur Anzahl/Kadenz belastbar",
                  fontsize=11, loc="left")
axes[1].set_xlabel("t (s, ab On-Foil-Start)")
fig.tight_layout(); p = OUT / "12_pump_timing.png"; fig.savefig(p, dpi=160, bbox_inches="tight"); print("wrote", p)
