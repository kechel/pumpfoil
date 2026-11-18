import pickle, numpy as np
from scipy.stats import spearmanr
from guete import guete
R = pickle.load(open("varianten.pkl", "rb")); D = pickle.load(open("daten.pkl", "rb"))
idx = []
for gi, g in enumerate(D):
    for l in g["laeufe"]: idx.append((gi, l))
def proben(S, t0, a, b):
    m = (S[:, 0] - t0 >= a / 1000 - 0.01) & (S[:, 0] - t0 <= b / 1000 + 0.01); return S[m]
def tolq(S):
    # |Positionsstrecke - Tempostrecke| / Tempostrecke im Fenster (die Groesse der 10-%-Pruefung)
    la0 = np.radians(S[0, 1]); x = np.radians(S[:, 2] - S[0, 2]) * 6371000 * np.cos(la0); y = np.radians(S[:, 1] - S[0, 1]) * 6371000
    dp = np.hypot(np.diff(x), np.diff(y)).sum(); v = np.nan_to_num(S[:, 3]); dd = (0.5 * (v[1:] + v[:-1]) * np.diff(S[:, 0])).sum()
    return abs(dp - dd) / max(dd, 1)
for nm in ("V6", "W0.5_p2.5"):
    for kz in ("sprint_100m", "sprint_60s"):
        e, qr, qw, qt = [], [], [], []
        for r, (gi, l) in zip(R, idx):
            a, b, fa, fb = r["v"][nm]
            if kz not in a or kz not in b: continue
            t0 = l["t0"]; sr, sw, st = [], [], []
            for S, f in ((l["A"], fa), (l["B"], fb)):
                Sl = S[(S[:, 0] >= l["t0"]) & (S[:, 0] <= l["t1"])]
                gr = guete(Sl[:, 0], Sl[:, 1], Sl[:, 2], Sl[:, 3]); sr.append(gr["abw_10s"] if gr else np.nan)
                W = proben(S, t0, *f[kz]); gw = guete(W[:, 0], W[:, 1], W[:, 2], W[:, 3]) if len(W) >= 15 else None
                sw.append(gw["abw_10s"] if gw else np.nan); st.append(tolq(W) if len(W) > 3 else np.nan)
            e.append(abs(a[kz] - b[kz]) * 3.6); qr.append(sum(sr)); qw.append(sum(sw)); qt.append(sum(st))
        e, qr, qw, qt = map(np.array, (e, qr, qw, qt))
        def rho(q): ok = np.isfinite(q); return f"{spearmanr(q[ok], e[ok])[0]:+.2f} (n{ok.sum()})"
        print(f"{nm:10s} {kz:12s} Guete je Lauf {rho(qr)}  je Fenster (10-s-abw) {rho(qw)}  je Fenster (Gesamt-Abweichung) {rho(qt)}")
