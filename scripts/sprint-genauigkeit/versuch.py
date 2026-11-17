"""Sprint-Genauigkeit: viele Schaetzer gegen dieselben unabhaengigen Geraete-Paare (rein lesend, nur daten.pkl).

Je Methode m: Strecke je 1-s-Rasterschritt -> kumuliert -> beste 100 m / beste 60 s im gemeinsamen Laufstueck.
Metriken je Paar-Lauf:
  best: |Bestwert A - Bestwert B| (was im Ranking zaehlt)
  win : gleiches Zeitfenster (das Referenzfenster = bestes Fenster der Doppler-Mittelung beider), |vA - vB|
  lvl : (vA+vB)/2 im Bestwert, um Verzerrung nach unten/oben zu sehen (gegen Methode 'dop')
"""
import pickle, sys, json
import numpy as np
from scipy.signal import savgol_filter
from scipy.interpolate import UnivariateSpline
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from app.analysis.detect_v2 import _clean_speed

R = 6371000.0
LUECKE = 3.0


def enu(lat, lon, lat0, lon0):
    return (np.radians(lon - lon0) * R * np.cos(np.radians(lat0)), np.radians(lat - lat0) * R)


def raster(S, t0, t1, lat0, lon0):
    """Gerätespur auf 1-s-Raster (t0..t1): x, y, v (Doppler bereinigt), gueltig (keine Luecke > LUECKE um den Punkt)."""
    t = S[:, 0]
    g = np.arange(np.ceil(t0), np.floor(t1) + 1e-9, 1.0)
    x, y = enu(S[:, 1], S[:, 2], lat0, lon0)
    v = S[:, 3].copy()
    ok = np.isfinite(v)
    vc = np.full_like(v, np.nan)
    if ok.sum() > 3:
        vc[ok] = np.nan_to_num(_clean_speed(v[ok], 1), nan=0.0)
    gx, gy = np.interp(g, t, x), np.interp(g, t, y)
    gv = np.interp(g, t[ok], vc[ok]) if ok.sum() > 3 else np.full(g.size, np.nan)
    # Luecke: naechster Messpunkt links/rechts
    j = np.searchsorted(t, g)
    links = t[np.clip(j - 1, 0, t.size - 1)]
    rechts = t[np.clip(j, 0, t.size - 1)]
    luecke = (rechts - links) > LUECKE
    return g, gx, gy, gv, luecke, (t, x, y, v)


# ---------------- Methoden: liefern Strecke je Schritt (Laenge n-1) ----------------
def m_dop(r, **k):
    g, x, y, v, l, _ = r
    vv = v
    return 0.5 * (vv[1:] + vv[:-1])


def glatt(v, art, w):
    if art == "ma":
        k = np.ones(w) / w
        p = np.pad(v, w // 2, mode="edge")
        return np.convolve(p, k, mode="valid")[: v.size]
    if art == "med":
        p = np.pad(v, w // 2, mode="edge")
        return np.array([np.median(p[i:i + w]) for i in range(v.size)])
    if art == "sg":
        return savgol_filter(v, w, 2, mode="interp") if v.size > w else v
    if art == "ema":
        out = v.copy(); a = 2 / (w + 1)
        for i in range(1, v.size): out[i] = a * v[i] + (1 - a) * out[i - 1]
        # vor- und rueckwaerts (phasenfrei)
        o2 = out.copy()
        for i in range(v.size - 2, -1, -1): o2[i] = a * out[i] + (1 - a) * o2[i + 1]
        return o2
    raise ValueError(art)


def m_dop_glatt(r, art="ma", w=3, **k):
    v = glatt(r[3], art, w)
    return 0.5 * (v[1:] + v[:-1])


def m_pos(r, w=1, **k):
    x, y = r[1], r[2]
    if w > 1:
        x, y = glatt(x, "ma", w), glatt(y, "ma", w)
    return np.hypot(np.diff(x), np.diff(y))


def m_spline(r, sig=3.0, **k):
    g, x, y = r[0], r[1], r[2]
    tt = g - g[0]
    n = g.size
    if n < 8:
        return np.hypot(np.diff(x), np.diff(y))
    sx = UnivariateSpline(tt, x, s=n * sig ** 2, k=3)
    sy = UnivariateSpline(tt, y, s=n * sig ** 2, k=3)
    f = np.linspace(0, tt[-1], (n - 1) * 5 + 1)
    px, py = sx(f), sy(f)
    seg = np.hypot(np.diff(px), np.diff(py))
    return seg.reshape(n - 1, 5).sum(1)


def m_rts(r, sp=3.0, sv=0.3, q=0.5, **k):
    """Kalman + RTS-Glaetter, Zustand [x,y,vx,vy], Messung Position (sp) und Tempo-Betrag (sv, EKF)."""
    g, x, y, v = r[0], r[1], r[2], r[3]
    n = g.size
    F = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], float)
    Q = q * np.array([[1 / 3, 0, 1 / 2, 0], [0, 1 / 3, 0, 1 / 2], [1 / 2, 0, 1, 0], [0, 1 / 2, 0, 1]])
    vx0 = (x[min(2, n - 1)] - x[0]) / max(min(2, n - 1), 1); vy0 = (y[min(2, n - 1)] - y[0]) / max(min(2, n - 1), 1)
    s = np.array([x[0], y[0], vx0, vy0]); P = np.diag([25, 25, 4, 4.0])
    xs, Ps, xp, Pp = [], [], [], []
    for i in range(n):
        if i:
            s = F @ s; P = F @ P @ F.T + Q
        xp.append(s.copy()); Pp.append(P.copy())
        # Position
        H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)
        z = np.array([x[i], y[i]]); Rm = np.eye(2) * sp ** 2
        yk = z - H @ s; Sk = H @ P @ H.T + Rm; K = P @ H.T @ np.linalg.inv(Sk)
        s = s + K @ yk; P = (np.eye(4) - K @ H) @ P
        # Tempo-Betrag
        if np.isfinite(v[i]) and sv > 0:
            sp_ = np.hypot(s[2], s[3])
            if sp_ > 0.3:
                Hv = np.array([[0, 0, s[2] / sp_, s[3] / sp_]])
                yk = v[i] - sp_; Sk = Hv @ P @ Hv.T + sv ** 2; K = P @ Hv.T / Sk
                s = s + (K * yk).ravel(); P = (np.eye(4) - K @ Hv) @ P
        xs.append(s.copy()); Ps.append(P.copy())
    # RTS
    xsm = [None] * n; xsm[-1] = xs[-1]; Psm = Ps[-1]
    for i in range(n - 2, -1, -1):
        C = Ps[i] @ F.T @ np.linalg.inv(Pp[i + 1])
        xsm[i] = xs[i] + C @ (xsm[i + 1] - xp[i + 1])
        Psm = Ps[i] + C @ (Psm - Pp[i + 1]) @ C.T
    X = np.array(xsm)
    spd = np.hypot(X[:, 2], X[:, 3])
    return 0.5 * (spd[1:] + spd[:-1])


def m_mix(r, w=0.5, pw=3, **k):
    return w * m_dop(r) + (1 - w) * m_pos(r, w=pw)


def m_mix_rts(r, w=0.5, **k):
    return w * m_dop(r) + (1 - w) * m_rts(r, sv=0)


def m_mix_spline(r, w=0.5, **k):
    return w * m_dop(r) + (1 - w) * m_spline(r)


def m_adapt(r, pw=5, fen=15, **k):
    """Inverse Varianz je Punkt: Doppler-Rauschen aus |v - Median5(v)|, Positions-Rauschen aus Abweichung der Position
    von ihrer Glaettung; beides lokal (fen s) gemittelt. Gewicht w = 1/sd^2 / (1/sd^2 + 1/sp^2)."""
    g, x, y, v = r[0], r[1], r[2], r[3]
    dd = m_dop(r)
    dp = m_pos(r, w=pw)
    rv = np.abs(v - glatt(v, "med", 5))
    xs, ys = glatt(x, "ma", pw), glatt(y, "ma", pw)
    rp = np.hypot(x - xs, y - ys)
    k_ = np.ones(fen) / fen
    sv = np.convolve(np.pad(rv, fen // 2, mode="edge"), k_, "valid")[: v.size] + 0.05
    # Positionsfehler wirkt auf die Strecke ueber die Fensterenden, je Schritt grob rp/sqrt(pw)
    spp = np.convolve(np.pad(rp, fen // 2, mode="edge"), k_, "valid")[: v.size] / np.sqrt(pw) + 0.05
    sv, spp = 0.5 * (sv[1:] + sv[:-1]), 0.5 * (spp[1:] + spp[:-1])
    w = (1 / sv**2) / (1 / sv**2 + 1 / spp**2)
    return w * dd + (1 - w) * dp


def m_sehne(r, w=0.5, pw=9, **k):
    """Stark geglaettete Positionen (gerader Sprint): Laenge der Glaettung, gemischt mit Doppler."""
    return w * m_dop(r) + (1 - w) * m_pos(r, w=pw)


METHODEN = {
    "dop": (m_dop, {}),
    "dop_ma3": (m_dop_glatt, {"art": "ma", "w": 3}),
    "dop_ma5": (m_dop_glatt, {"art": "ma", "w": 5}),
    "dop_med3": (m_dop_glatt, {"art": "med", "w": 3}),
    "dop_med5": (m_dop_glatt, {"art": "med", "w": 5}),
    "dop_sg7": (m_dop_glatt, {"art": "sg", "w": 7}),
    "dop_ema3": (m_dop_glatt, {"art": "ema", "w": 3}),
    "pos": (m_pos, {}),
    "pos_ma3": (m_pos, {"w": 3}),
    "pos_ma5": (m_pos, {"w": 5}),
    "spline2": (m_spline, {"sig": 2.0}),
    "spline4": (m_spline, {"sig": 4.0}),
    "rts_pos": (m_rts, {"sv": 0}),
    "rts": (m_rts, {}),
    "rts_sv1": (m_rts, {"sv": 1.0}),
    "rts_q2": (m_rts, {"q": 2.0}),
    "mix50": (m_mix, {"w": 0.5}),
    "mixspl50": (m_mix_spline, {"w": 0.5}),
    **{f"mix{int(w*100)}p{pw}": (m_mix, {"w": w, "pw": pw}) for w in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8) for pw in (1, 3, 5)},
    "mixrts50": (m_mix_rts, {"w": 0.5}),
    **{f"mix{int(w*100)}p{pw}": (m_mix, {"w": w, "pw": pw}) for w in (0.3, 0.4, 0.5, 0.6) for pw in (9, 11, 15, 21)},
    "pos_ma7": (m_pos, {"w": 7}), "pos_ma9": (m_pos, {"w": 9}),
    "mix50p7": (m_mix, {"w": 0.5, "pw": 7}), "mix50p9": (m_mix, {"w": 0.5, "pw": 9}), "mix30p7": (m_mix, {"w": 0.3, "pw": 7}),
    "adapt5": (m_adapt, {"pw": 5}), "adapt7": (m_adapt, {"pw": 7}), "adapt5f30": (m_adapt, {"pw": 5, "fen": 31}),
    "mixrts30": (m_mix_rts, {"w": 0.3}),
}


def kum(d):
    return np.concatenate([[0.0], np.cumsum(np.nan_to_num(d))])


def bestes(g, c, luecke, strecke=None, dauer=None):
    """-> (m/s, start, ende) bestes Fenster; Fenster ueber eine Luecke ungueltig."""
    n = g.size
    lk = np.concatenate([[0], np.cumsum(luecke.astype(int))])
    best = None
    if dauer is not None:
        w = int(dauer)
        if n <= w: return None
        i = np.arange(n - w); j = i + w
        ok = (lk[j + 1] - lk[i]) == 0
        if not ok.any(): return None
        sp = (c[j] - c[i]) / dauer
        sp[~ok] = -1
        k = int(np.argmax(sp)); return float(sp[k]), g[i[k]], g[j[k]]
    i = np.arange(n)
    j = np.searchsorted(c, c + strecke, side="left")
    ok = j < n
    i, j = i[ok], j[ok]
    if not i.size: return None
    f = (c[i] + strecke - c[j - 1]) / np.maximum(c[j] - c[j - 1], 1e-9)
    te = g[j - 1] + f * (g[j] - g[j - 1])
    dt = te - g[i]
    good = ((lk[j + 1] - lk[i]) == 0) & (dt > 0)
    if not good.any(): return None
    sp = np.where(good, strecke / np.maximum(dt, 1e-9), -1)
    k = int(np.argmax(sp)); return float(sp[k]), g[i[k]], te[k]


def tempo_im(g, c, a, b):
    ca, cb = np.interp(a, g, c), np.interp(b, g, c)
    return (cb - ca) / (b - a)


def auswerten(gruppen, methoden):
    out = []
    for G in gruppen:
        for L in G["laeufe"]:
            A, B = L["A"], L["B"]
            if len(A) < 10 or len(B) < 10: continue
            lat0, lon0 = A[0, 1], A[0, 2]
            ra = raster(A, L["t0"], L["t1"], lat0, lon0)
            rb = raster(B, L["t0"], L["t1"], lat0, lon0)
            if ra[0].size < 15 or ra[0].size != rb[0].size: continue
            if np.isnan(ra[3]).mean() > 0.2 or np.isnan(rb[3]).mean() > 0.2: continue
            g = ra[0]
            # Referenzfenster: Doppler-Mittel beider
            cref = kum(0.5 * (m_dop(ra) + m_dop(rb)))
            lref = ra[4] | rb[4]
            ref = {"100m": bestes(g, cref, lref, strecke=100), "60s": bestes(g, cref, lref, dauer=60)}
            zeile = {"g": G["a"], "geraete": (G["ga"], G["gb"]), "brett": (G["pa"], G["pb"]), "n": g.size, "m": {}}
            for name in methoden:
                fn, kw = METHODEN[name]
                try:
                    ca, cb = kum(fn(ra, **kw)), kum(fn(rb, **kw))
                except Exception as e:  # noqa
                    continue
                res = {}
                for kz, arg in (("100m", {"strecke": 100}), ("60s", {"dauer": 60})):
                    ba, bb = bestes(g, ca, ra[4], **arg), bestes(g, cb, rb[4], **arg)
                    if not ba or not bb or ba[0] <= 0 or bb[0] <= 0: continue
                    r = ref[kz]
                    wa = tempo_im(g, ca, r[1], r[2]) if r else np.nan
                    wb = tempo_im(g, cb, r[1], r[2]) if r else np.nan
                    res[kz] = (ba[0] * 3.6, bb[0] * 3.6, wa * 3.6, wb * 3.6)
                zeile["m"][name] = res
            out.append(zeile)
    return out


if __name__ == "__main__":
    gruppen = pickle.load(open(sys.argv[1], "rb"))
    meth = sys.argv[3].split(",") if len(sys.argv) > 3 else list(METHODEN)
    erg = auswerten(gruppen, meth)
    pickle.dump(erg, open(sys.argv[2], "wb"))
    print("Laeufe ausgewertet:", len(erg))
