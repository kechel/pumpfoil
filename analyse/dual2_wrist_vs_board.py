#!/usr/bin/env python3
"""Dual-Watch-Auswertung #2 (2026-07-08, Illmensee): Handgelenk (FR55, 25 Hz) gegen
Board-Referenz (fenix 7X Pro am Fuss/Rumpf, 100 Hz). Ziel: echte Pump-WAHRHEIT vom
board-gekoppelten Sensor gegen unseren Wrist-Pump-Detektor.

Rohdaten kommen aus dem Server-Storage (frisch re-importiert), Helfer aus app.ml.
Erzeugt grosse Plots + eine Befund-Zusammenfassung.
"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))) + "/server")
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from scipy.signal import find_peaks, coherence, correlate

from app.db import SessionLocal
from app import models, storage
from app.ml.features import vertical_against_gravity, bandpass_fft
from app.ml.pumps import find_pumps_local

OUT = os.path.dirname(os.path.abspath(__file__)) + "/out/dual2"
os.makedirs(OUT, exist_ok=True)
SCALE = 2048
BP = (0.4, 3.0)       # Signal-Bandpass (Pump-Dynamik)
CAD = (0.6, 2.2)      # plausibles Pump-Kadenzband
GRID_HZ = 50.0        # gemeinsames Raster fuer Sync/Kohaerenz

# Paare: (name, setup, wrist_sid, board_sid)
PAIRS = [
    ("P1 17:54", "Fuss",  508, 509),
    ("P2 18:06", "Fuss",  510, 511),
    ("P3 18:22", "Fuss",  513, 514),
    ("R1 17:28", "Rumpf", 505, 504),
    ("R2 17:41", "Rumpf", 506, 507),
]

db = SessionLocal()

def load(sid):
    s = db.get(models.Session, sid)
    r = db.query(models.AnalysisResult).filter_by(session_id=sid).first()
    acc = storage.load_accel(s.session_uuid)
    hz = float(s.accel_hz)
    v = vertical_against_gravity(acc, SCALE, hz)              # (N,) g, up+
    segs = json.loads(r.segments_json) if r and r.segments_json else []
    t0 = s.started_at.timestamp()
    return dict(sid=sid, hz=hz, v=v, t0=t0, segs=segs, mag=acc.astype(np.float64)/SCALE)

def dom_freq(sig, fs, lo, hi):
    if sig.size < fs: return 0.0
    w = sig * np.hanning(sig.size)
    sp = np.abs(np.fft.rfft(w)); fr = np.fft.rfftfreq(sig.size, 1.0/fs)
    band = (fr >= lo) & (fr <= hi)
    if not band.any(): return 0.0
    return float(fr[band][np.argmax(sp[band])])

def resample_abs(v, hz, t0, tA, tB, grid_hz):
    """v (native hz, beginnt bei t0 absolut) auf abs. Zeitraster [tA,tB]@grid_hz interpolieren."""
    t_native = t0 + np.arange(v.size)/hz
    grid = np.arange(tA, tB, 1.0/grid_hz)
    return grid, np.interp(grid, t_native, v, left=0.0, right=0.0)

rows = []
for name, setup, wsid, bsid in PAIRS:
    W = load(wsid); B = load(bsid)
    # Analyse-Fenster = Foiling-Segment. Bevorzugt vom Board (Fuss); bei Rumpf ist das GPS unter
    # Wasser tot -> kein Segment, dann das Foiling-Segment des Handgelenks nehmen (absolute Zeit).
    owner = B if B["segs"] else W
    if owner["segs"]:
        seg = max(owner["segs"], key=lambda s: s["i_end"]-s["i_start"])
        tA = owner["t0"] + seg["i_start"] - 2
        tB = owner["t0"] + seg["i_end"] + 2
    else:
        tA = max(W["t0"], B["t0"]); tB = min(W["t0"]+W["v"].size/W["hz"], B["t0"]+B["v"].size/B["hz"])
    dur = tB - tA

    # Gemeinsames Raster fuer Sync/Kohaerenz/FFT
    g, wv = resample_abs(W["v"], W["hz"], W["t0"], tA, tB, GRID_HZ)
    _, bv = resample_abs(B["v"], B["hz"], B["t0"], tA, tB, GRID_HZ)
    wv_bp = bandpass_fft(wv, GRID_HZ, *BP); bv_bp = bandpass_fft(bv, GRID_HZ, *BP)

    # Feinsync per Kreuzkorrelation (Rest-Versatz nach Uhr-Clock)
    xc = correlate(wv_bp - wv_bp.mean(), bv_bp - bv_bp.mean(), mode="full")
    lags = (np.arange(xc.size) - (bv_bp.size-1)) / GRID_HZ
    m = np.abs(lags) <= 3.0
    lag = float(lags[m][np.argmax(xc[m])])   # wrist gegenueber board (s)

    # Kadenz (dominante Freq im Fenster) + Kohaerenz-Peak im Pump-Band
    cad_w = dom_freq(wv_bp, GRID_HZ, *CAD); cad_b = dom_freq(bv_bp, GRID_HZ, *CAD)
    fco, Cxy = coherence(wv_bp, bv_bp, fs=GRID_HZ, nperseg=min(256, wv_bp.size))
    inb = (fco >= CAD[0]) & (fco <= CAD[1]); coh_peak = float(np.max(Cxy[inb])) if inb.any() else 0.0

    # WAHRHEIT: Pump-Peaks auf dem Board (board-gekoppelt, 1 Zyklus/Pump), native 100 Hz im Fenster
    def native_window(S):
        i0 = int(max((tA - S["t0"]) * S["hz"], 0)); i1 = int(min((tB - S["t0"]) * S["hz"], S["v"].size))
        return S["v"][i0:i1], i0
    bvn, b_i0 = native_window(B); wvn, w_i0 = native_window(W)
    bvn_bp = bandpass_fft(bvn, B["hz"], *BP)
    min_dist_b = int(B["hz"] / (CAD[1]))          # >= schnellste plausible Kadenz
    prom_b = 0.6 * np.std(bvn_bp)
    pk_b, _ = find_peaks(bvn_bp, distance=max(min_dist_b,1), prominence=max(prom_b,1e-3))
    n_truth = pk_b.size

    # UNSER Wrist-Detektor (find_pumps_local) auf dem Handgelenk-Signal (native 25 Hz, im Fenster)
    wvn_bp = bandpass_fft(wvn, W["hz"], *BP)
    pk_w = find_pumps_local(wvn_bp, W["hz"])
    n_wrist = pk_w.size

    # Kadenz-basierte Erwartung (Board-Kadenz * Foiling-Dauer)
    n_expect = int(round(cad_b * dur)) if cad_b > 0 else 0

    # Timing-Match: Wrist-Peak gilt als Treffer, wenn <=0.35 s an einem Board-Peak (nach Sync)
    tb = B["t0"] + (b_i0 + pk_b)/B["hz"]
    tw = W["t0"] + (w_i0 + pk_w)/W["hz"] - lag
    matched = 0
    for t in tw:
        if tb.size and np.min(np.abs(tb - t)) <= 0.35: matched += 1
    prec = matched/n_wrist if n_wrist else 0
    rec = matched/n_truth if n_truth else 0

    rows.append(dict(name=name, setup=setup, dur=dur, lag=lag, cad_w=cad_w, cad_b=cad_b,
                     coh=coh_peak, n_truth=n_truth, n_wrist=n_wrist, n_expect=n_expect,
                     prec=prec, rec=rec,
                     g=g, wv_bp=wv_bp, bv_bp=bv_bp, tA=tA, fco=fco, Cxy=Cxy,
                     tb=tb, tw=tw, W=W, B=B))
    print(f"{name} {setup}: dur={dur:.0f}s lag={lag:+.2f}s cad wrist={cad_w:.2f} board={cad_b:.2f}Hz "
          f"coh={coh_peak:.2f} | Pumps board(truth)={n_truth} wrist(det)={n_wrist} erwartet≈{n_expect} "
          f"| match P={prec:.0%} R={rec:.0%}")

db.close()

# ---------------- PLOTS ----------------
plt.rcParams.update({"figure.dpi": 200, "font.size": 11, "axes.grid": True, "grid.alpha": 0.25})

# 1) Pro Paar: Zeitreihe (synced) + FFT + Kohaerenz
for r in rows:
    fig, ax = plt.subplots(3, 1, figsize=(15, 11), gridspec_kw={"height_ratios":[2,1,1]})
    tt = r["g"] - r["tA"]
    ax[0].plot(tt, r["bv_bp"], lw=1.6, color="#0ea5e9", label=f"Board ({r['B']['sid']}, 100 Hz) — Wahrheit")
    ax[0].plot(tt, r["wv_bp"], lw=1.1, color="#f59e0b", alpha=0.85, label=f"Handgelenk ({r['W']['sid']}, 25 Hz)")
    ax[0].plot((r["tb"]-r["tA"]), np.interp(r["tb"], r["g"], r["bv_bp"]), "v", color="#0369a1", ms=7, label=f"Board-Pumps (Wahrheit) n={r['n_truth']}")
    ax[0].plot((r["tw"]-r["tA"]), np.interp(r["tw"], r["g"], r["wv_bp"]), "^", color="#b45309", ms=6, label=f"Wrist-Detektor n={r['n_wrist']}")
    ax[0].set_title(f"{r['name']} · {r['setup']} — vertikale Beschleunigung (Bandpass 0.4–3 Hz), synchronisiert (lag {r['lag']:+.2f}s)")
    ax[0].set_ylabel("g (auf = Push)"); ax[0].legend(loc="upper right", fontsize=9); ax[0].set_xlabel("s im Foiling-Fenster")
    # FFT
    for sig, c, lab in [(r["bv_bp"], "#0ea5e9", "Board"), (r["wv_bp"], "#f59e0b", "Handgelenk")]:
        sp = np.abs(np.fft.rfft(sig*np.hanning(sig.size))); fr = np.fft.rfftfreq(sig.size, 1/GRID_HZ)
        ax[1].plot(fr, sp/ (sp.max() or 1), color=c, label=lab)
    ax[1].axvspan(*CAD, color="green", alpha=0.07); ax[1].set_xlim(0,4)
    ax[1].set_title(f"Spektrum — Kadenz Board {r['cad_b']:.2f} Hz vs Handgelenk {r['cad_w']:.2f} Hz"); ax[1].set_xlabel("Hz"); ax[1].legend(fontsize=9)
    ax[2].plot(r["fco"], r["Cxy"], color="#7c3aed"); ax[2].axvspan(*CAD, color="green", alpha=0.07); ax[2].set_xlim(0,4); ax[2].set_ylim(0,1)
    ax[2].set_title(f"Kohärenz Handgelenk↔Board — Peak im Pump-Band {r['coh']:.2f}"); ax[2].set_xlabel("Hz"); ax[2].set_ylabel("coh²")
    fig.tight_layout(); fp=f"{OUT}/pair_{r['name'].split()[0]}.png"; fig.savefig(fp); plt.close(fig)
    print("saved", fp)

# 2) Zusammenfassung: Pump-Count Wahrheit vs Detektor + Kadenz
fig, ax = plt.subplots(1, 2, figsize=(16, 6))
names=[r["name"] for r in rows]; x=np.arange(len(rows)); w=0.27
ax[0].bar(x-w, [r["n_truth"] for r in rows], w, label="Board (Wahrheit)", color="#0ea5e9")
ax[0].bar(x,   [r["n_expect"] for r in rows], w, label="Kadenz×Dauer", color="#22c55e")
ax[0].bar(x+w, [r["n_wrist"] for r in rows], w, label="Wrist-Detektor", color="#f59e0b")
for i,r in enumerate(rows):
    for dx,val in [(-w,r["n_truth"]),(0,r["n_expect"]),(w,r["n_wrist"])]:
        ax[0].text(i+dx, val+0.4, str(val), ha="center", fontsize=8)
ax[0].set_xticks(x); ax[0].set_xticklabels([f"{r['name']}\n{r['setup']}" for r in rows]); ax[0].legend()
ax[0].set_title("Pump-Anzahl: Board-Wahrheit vs. unser Wrist-Detektor"); ax[0].set_ylabel("Pumps")
cb=[r["cad_b"] for r in rows]; cw=[r["cad_w"] for r in rows]
ax[1].scatter(cb, cw, s=90, c=["#0ea5e9" if r["setup"]=="Fuss" else "#ef4444" for r in rows], zorder=3)
for r in rows: ax[1].annotate(r["name"].split()[0], (r["cad_b"], r["cad_w"]), fontsize=9, xytext=(4,4), textcoords="offset points")
lim=[0.6,1.8]; ax[1].plot(lim,lim,"--",color="gray"); ax[1].set_xlim(lim); ax[1].set_ylim(lim)
ax[1].set_xlabel("Kadenz Board (Hz)"); ax[1].set_ylabel("Kadenz Handgelenk (Hz)"); ax[1].set_title("Pump-Kadenz Handgelenk vs Board (blau=Fuss, rot=Rumpf)")
fig.tight_layout(); fig.savefig(f"{OUT}/summary.png"); plt.close(fig); print("saved", f"{OUT}/summary.png")

# Befund-Text
with open(f"{OUT}/FINDINGS.txt","w") as f:
    f.write("Dual-Watch #2 — Handgelenk (FR55 25Hz) vs Board (fenix 100Hz)\n\n")
    f.write(f"{'Paar':<10}{'Setup':<7}{'Dauer':>6}{'lag':>7}{'cadW':>6}{'cadB':>6}{'coh':>5}{'truth':>7}{'wrist':>7}{'exp':>5}{'P':>5}{'R':>5}\n")
    for r in rows:
        f.write(f"{r['name']:<10}{r['setup']:<7}{r['dur']:>5.0f}s{r['lag']:>+7.2f}{r['cad_w']:>6.2f}{r['cad_b']:>6.2f}{r['coh']:>5.2f}{r['n_truth']:>7}{r['n_wrist']:>7}{r['n_expect']:>5}{r['prec']:>5.0%}{r['rec']:>5.0%}\n")
print("done")
