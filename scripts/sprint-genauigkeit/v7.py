"""Sprint-Variante V7 (Trockenlauf, nichts geschrieben): Strecke = W * Uhr-Tempo-Integral + (1-W) * Strecke der
5-s-geglaetteten Positionen. Gueltigkeitsregeln (Toleranz Doppler vs. rohe Positionen, Luecken, Spruenge, Obergrenze)
bleiben exakt wie VERSION 6. install(W, apple_dop) patcht app.analysis.sprint.lauf_sprints."""
import numpy as np
from app.analysis import sprint as SP

ORIG = SP.lauf_sprints
CFG = {"W": None, "PW_S": 2.5}


def _enu(lat, lon):
    la0 = np.radians(lat[0])
    return (np.radians(lon - lon[0]) * 6371000.0 * np.cos(la0), np.radians(lat - lat[0]) * 6371000.0)


def _glatt_strecke(t, lat, lon, luecke, halb):
    x, y = _enu(lat, lon)
    xs, ys = x.copy(), y.copy()
    n = t.size
    lo = np.searchsorted(t, t - halb, side="left")
    hi = np.searchsorted(t, t + halb, side="right")
    # Abschnittsgrenzen (zwischen Luecken): Fenster symmetrisch verkuerzen, damit Randpunkte nicht nach innen rutschen
    ids = np.unique(luecke)
    t_a = {i: t[luecke == i][0] for i in ids}; t_b = {i: t[luecke == i][-1] for i in ids}
    for k in range(n):
        h = min(halb, t[k] - t_a[luecke[k]], t_b[luecke[k]] - t[k])
        a = np.searchsorted(t, t[k] - h - 1e-6, side="left"); b = np.searchsorted(t, t[k] + h + 1e-6, side="right")
        sel = luecke[a:b] == luecke[k]
        xs[k] = x[a:b][sel].mean(); ys[k] = y[a:b][sel].mean()
    return xs, ys


def _fenster2(t, cm, cd, cp, luecken, *, strecke=None, dauer=None, echt=None, sprung=None):
    n = t.size
    if n < 3:
        return None
    i = np.arange(n)
    def at(c, j, f):
        return c[j - 1] + f * (c[j] - c[j - 1])
    if strecke is not None:
        ziel = cm + strecke
        j = np.searchsorted(cm, ziel, side="left")
        ok = j < n
        i, j = i[ok], j[ok]
        if not i.size:
            return None
        f = (ziel[i] - cm[j - 1]) / np.maximum(cm[j] - cm[j - 1], 1e-9)
        te = t[j - 1] + f * (t[j] - t[j - 1])
        dt = te - t[i]
        dm = np.full(i.size, float(strecke))
    else:
        ziel = t + dauer
        j = np.searchsorted(t, ziel, side="left")
        ok = (j < n) & (j > i)
        i, j = i[ok], j[ok]
        if not i.size:
            return None
        f = (ziel[i] - t[j - 1]) / np.maximum(t[j] - t[j - 1], 1e-9)
        dt = np.full(i.size, float(dauer))
        dm = at(cm, j, f) - cm[i]
    dd = at(cd, j, f) - cd[i]
    dp = at(cp, j, f) - cp[i]
    gut = (luecken[j] == luecken[i]) & (dt > 0) & (dd > 0) & (dm > 0)
    gut &= np.abs(dp - dd) <= SP.TOLERANZ * dd
    if echt is not None:
        ce = np.concatenate([[0], np.cumsum(echt)])
        gut &= (ce[j + 1] - ce[i]) >= SP.FENSTER_TEMPO_ANTEIL * ((j + 1) - i)
    if sprung is not None:
        cs = np.concatenate([[0], np.cumsum(sprung)])
        gut &= (cs[j + 1] - cs[i]) <= SP.SPRUNG_ANTEIL * ((j + 1) - i)
    if not gut.any():
        return None
    v = dm[gut] / dt[gut]
    k = int(np.argmax(v))
    return float(v[k]), float(t[i[gut][k]]), float(t[i[gut][k]] + dt[gut][k])


def lauf_sprints_v7(gps, a_ms, b_ms, fenster=None, je_fenster=True, max_mps=None):
    W = CFG["W"]
    if W is None:
        return ORIG(gps, a_ms, b_ms, fenster, je_fenster, max_mps)
    from app.analysis.detect_v2 import _clean_speed
    from app.analysis.gps import _running_median
    pkt = [p for p in gps if a_ms <= float(p[0]) <= b_ms and p[1] is not None and p[2] is not None]
    if len(pkt) < 5:
        return None
    roh = [p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and not isinstance(p[3], bool) else None for p in pkt]
    if sum(1 for v in roh if v is not None and v > 0) == 0:
        return None
    t = np.array([float(p[0]) for p in pkt]) / 1000.0
    lat = np.array([float(p[1]) for p in pkt]); lon = np.array([float(p[2]) for p in pkt])
    v = np.array([float(x) if x is not None else np.nan for x in roh])
    echt = np.isfinite(v) & (v > 0)
    dt = np.diff(t)
    if (dt <= 0).any():
        _, k = np.unique(t, return_index=True)
        t, lat, lon, v, echt = t[k], lat[k], lon[k], v[k], echt[k]
        dt = np.diff(t)
    sprung = SP._springt(np.where(echt, v, 0.0), echt)
    v, schlecht = SP._tempo_luecken_fuellen(t, np.where(echt, v, 0.0), echt)
    v = np.nan_to_num(_clean_speed(v, 1), nan=0.0)
    bruch = (dt > SP.LUECKE_S) | schlecht[1:] | schlecht[:-1]
    if max_mps is not None:
        zu = _running_median(v, 3) > max_mps
        bruch = bruch | zu[1:] | zu[:-1]
    luecke = np.concatenate([[0], np.cumsum(bruch)])
    seg = np.where(bruch, 0.0, (v[1:] + v[:-1]) / 2 * dt)
    cd = np.concatenate([[0.0], np.cumsum(seg)])
    cp = SP._strecke_pos(lat, lon)
    xs, ys = _glatt_strecke(t, lat, lon, luecke, CFG["PW_S"])
    sp_ = np.where(bruch, 0.0, np.hypot(np.diff(xs), np.diff(ys)))
    cps = np.concatenate([[0.0], np.cumsum(sp_)])
    cm = W * cd + (1 - W) * cps
    out = {}
    for kz, w in ([(f"sprint_{m}m", _fenster2(t, cm, cd, cp, luecke, strecke=float(m), echt=echt, sprung=sprung)) for m in SP.STRECKEN_M]
                  + [(f"sprint_{s}s", _fenster2(t, cm, cd, cp, luecke, dauer=float(s), echt=echt, sprung=sprung)) for s in SP.DAUERN_S]):
        if w is not None:
            out[kz] = round(w[0], 3)
            if fenster is not None:
                fenster[kz] = [round(w[1] * 1000), round(w[2] * 1000)]
    return out


def install():
    SP.lauf_sprints = lauf_sprints_v7
