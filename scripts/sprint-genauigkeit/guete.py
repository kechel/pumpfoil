"""GPS-Guete je Lauf aus einem einzigen Geraet (rein lesend)."""
import numpy as np

def guete(t, lat, lon, v):
    """t s, v m/s (nan = fehlt). -> dict: zittern_m, tempo_unruhe, abw_10s (relativ)."""
    if t.size < 15: return None
    la0 = np.radians(lat[0])
    x = np.radians(lon - lon[0]) * 6371000 * np.cos(la0); y = np.radians(lat - lat[0]) * 6371000
    # Zittern: Abstand roh zu 5-s-Mittel (symmetrisch, am Rand kuerzer)
    n = t.size; xs = np.empty(n); ys = np.empty(n)
    for k in range(n):
        h = min(2.5, t[k] - t[0], t[-1] - t[k])
        m = np.abs(t - t[k]) <= h + 1e-6
        xs[k], ys[k] = x[m].mean(), y[m].mean()
    zitt = float(np.sqrt(np.mean((x - xs) ** 2 + (y - ys) ** 2)))
    ok = np.isfinite(v) & (v > 0)
    vv = np.where(ok, v, np.nan)
    med = np.array([np.nanmedian(vv[max(0, k-2):k+3]) for k in range(n)])
    unr = float(np.nanmedian(np.abs(vv - med)))
    # 10-s-Fenster: Positionsstrecke vs Doppler-Strecke
    sp = np.hypot(np.diff(x), np.diff(y)); dt = np.diff(t); vd = np.nan_to_num(0.5 * (vv[1:] + vv[:-1])) * dt
    cp = np.concatenate([[0], np.cumsum(sp)]); cd = np.concatenate([[0], np.cumsum(vd)])
    rel = []
    for i in range(0, n - 10, 5):
        j = np.searchsorted(t, t[i] + 10)
        if j >= n or t[j] - t[i] > 12: continue
        d = cd[j] - cd[i]
        if d > 20: rel.append(abs(cp[j] - cp[i] - d) / d)
    abw = float(np.median(rel)) if rel else np.nan
    return {"zittern_m": zitt, "tempo_unruhe": unr, "abw_10s": abw}
