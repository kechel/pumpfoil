"""Merkmale je Fenster (Schritt 0,25 s) fuer das Pump-/Gleit-Modell. Rein rechnend.

Eingaben (Jan, 23.10.2026: „alle Daten"): Accel in allen drei Achsen (zerlegt gegen die Schwerkraft in
senkrecht / waagerecht + Lage), Kreisel (falls die Uhr ihn hat — in KEINEM Brett-Paar vorhanden, darum
nur als optionale Spalte, NaN), GPS (Tempo, Tempo-Aenderung, Kursaenderung), Zeit im Lauf.
Fahrer-unabhaengig normiert (Jan: kein Auswendiglernen): Amplituden und Periode RELATIV zum Median
desselben Laufs, dazu wenige absolute Groessen (gekappt). Keine Geraete-/Fahrer-Kennung.

Alles auf ein 25-Hz-Raster gebracht (Uhren liefern 25-50 Hz), damit die Merkmale geraeteunabhaengig sind.
"""
from __future__ import annotations

import numpy as np

HZ = 25.0
SCHRITT_S = 0.25

GRUPPEN = {
    "vertikal": ["v_rms1_rel", "v_rms2_rel", "v_rms4_rel", "v_rms2_log", "v_dip", "band_anteil",
                 "rhythmus", "periode_rel", "v_rms2_rel_vor", "v_rms2_rel_nach"],
    "quer": ["h_rms2_rel", "h_rms2_log", "vert_anteil", "hf_rel", "neigung_aend", "neigung_rel"],
    "gps": ["tempo_rel", "tempo_abs", "tempo_aend", "kurs_rate"],
    "zeit": ["seit_start", "bis_ende"],
    "kreisel": ["gyro_rms_rel"],
}
NAMEN = [n for g in GRUPPEN.values() for n in g]


def _bp(x, lo, hi, fs=HZ):
    if x.size < 8:
        return x - (x.mean() if x.size else 0)
    X = np.fft.rfft(x - x.mean())
    f = np.fft.rfftfreq(x.size, 1 / fs)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, n=x.size)


def _lp(x, cut, fs=HZ):
    if x.size < 8:
        return x.astype(float)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(x.size, 1 / fs)
    X[f > cut] = 0
    return np.fft.irfft(X, n=x.size)


def _roll_rms(x, w):
    c = np.concatenate([[0.0], np.cumsum(x * x)])
    i = np.arange(x.size)
    lo, hi = np.clip(i - w // 2, 0, x.size), np.clip(i + w // 2 + 1, 0, x.size)
    return np.sqrt((c[hi] - c[lo]) / np.maximum(hi - lo, 1))


def signale(U: dict) -> dict:
    """Uhr-Daten -> Signale auf 25 Hz (Session-ms `t`)."""
    t0, t1 = U["t"][0], U["t"][-1]
    t = np.arange(t0, t1, 1000.0 / HZ)
    acc = np.column_stack([np.interp(t, U["t"], U["acc"][:, k]) for k in range(3)])
    echt = np.interp(t, U["t"], U["echt"].astype(float)) > 0.5
    g = np.column_stack([_lp(acc[:, k], 0.25) for k in range(3)])
    gn = g / np.clip(np.linalg.norm(g, axis=1, keepdims=True), 1e-6, None)
    dyn = acc - g
    v_roh = np.sum(dyn * gn, axis=1)
    v = _bp(v_roh, 0.3, 3.0)
    hvec = dyn - v_roh[:, None] * gn
    h = _bp(np.linalg.norm(hvec, axis=1), 0.3, 3.0)
    mag = np.linalg.norm(acc, axis=1)
    hf = mag - _lp(mag, 4.0)
    # Neigung der Uhr: Winkel der Schwerkraft zur Uhr-z-Achse (Handgelenkshaltung)
    neig = np.degrees(np.arccos(np.clip(np.abs(gn[:, 2]), 0, 1)))
    gy = None
    if U.get("gyro") is not None:
        gy = np.column_stack([np.interp(t, U["t"], np.nan_to_num(U["gyro"][:, k])) for k in range(3)])
    gps = U["gps"]
    tempo = np.interp(t, gps[:, 0], np.nan_to_num(gps[:, 3]))
    # Kurs aus Positionen (Grad), Rate geglaettet ueber 2 s
    lat, lon = np.radians(gps[:, 1]), np.radians(gps[:, 2])
    if gps.shape[0] > 2:
        y = np.sin(np.diff(lon)) * np.cos(lat[1:])
        x = np.cos(lat[:-1]) * np.sin(lat[1:]) - np.sin(lat[:-1]) * np.cos(lat[1:]) * np.cos(np.diff(lon))
        kurs = np.unwrap(np.arctan2(y, x))
        tk = (gps[1:, 0] + gps[:-1, 0]) / 2
        kurs_t = np.interp(t, tk, kurs)
        kr = np.abs(np.gradient(kurs_t) * HZ)
        kr = np.degrees(np.convolve(kr, np.ones(int(2 * HZ)) / (2 * HZ), mode="same"))
    else:
        kr = np.zeros(t.size)
    return {"t": t, "v": v, "h": h, "hf": hf, "neig": neig, "gy": gy, "tempo": tempo, "kurs_rate": kr,
            "echt": echt}


def zone(laeufe, puffer_s, ende_s_max=None):
    """Analyse-Zonen: Lauf [a, b + Puffer], gekappt am naechsten Laufstart. -> [(a, b, b_puffer)]."""
    out = []
    for i, (a, b) in enumerate(laeufe):
        nxt = laeufe[i + 1][0] if i + 1 < len(laeufe) else np.inf
        out.append((a, b, min(b + puffer_s * 1000.0, nxt)))
    return out


def merkmale(S: dict, laeufe: list, puffer_s: float = 5.0):
    """-> t_fenster (Session-ms), X (n, len(NAMEN)), lauf_idx, im_puffer (bool)."""
    t, v, h = S["t"], S["v"], S["h"]
    w1, w2, w4 = int(1 * HZ), int(2 * HZ), int(4 * HZ)
    v1, v2, v4 = _roll_rms(v, w1), _roll_rms(v, w2), _roll_rms(v, w4)
    h2 = _roll_rms(h, w2)
    hf2 = _roll_rms(S["hf"], w2)
    gy2 = _roll_rms(np.linalg.norm(S["gy"] - np.nanmedian(S["gy"], axis=0), axis=1), w2) if S["gy"] is not None else None
    T, X, LI, PUF = [], [], [], []
    for li, (a, b, bp) in enumerate(zone(laeufe, puffer_s)):
        tw = np.arange(a, bp, SCHRITT_S * 1000.0)
        if tw.size == 0:
            continue
        idx = np.clip(np.searchsorted(t, tw), 0, t.size - 1)
        ilauf = (t >= a) & (t <= b)
        if ilauf.sum() < HZ:
            continue
        ref_v = max(float(np.median(v2[ilauf])), 1e-3)
        ref_h = max(float(np.median(h2[ilauf])), 1e-3)
        ref_hf = max(float(np.median(hf2[ilauf])), 1e-3)
        ref_tempo = max(float(np.median(S["tempo"][ilauf])), 0.5)
        ref_neig = float(np.median(S["neig"][ilauf]))
        # Spektrum / Rhythmus je Fenster: 4-s-Ausschnitt um die Mitte
        half = w4 // 2
        pad = np.pad(v, (half, half))
        seg = np.stack([pad[i:i + w4] for i in idx])          # (n, 100)
        seg = seg - seg.mean(axis=1, keepdims=True)
        F = np.abs(np.fft.rfft(seg * np.hanning(w4), axis=1)) ** 2
        f = np.fft.rfftfreq(w4, 1 / HZ)
        band = F[:, (f >= 0.8) & (f <= 2.0)].sum(1) / np.maximum(F[:, (f >= 0.3) & (f <= 5.0)].sum(1), 1e-12)
        ac = np.fft.irfft(np.abs(np.fft.rfft(seg, n=2 * w4, axis=1)) ** 2, axis=1)[:, :w4]
        ac = ac / np.maximum(ac[:, :1], 1e-12)
        lags = np.arange(int(0.45 * HZ), int(1.3 * HZ))
        k = np.argmax(ac[:, lags], axis=1)
        rhythmus = ac[np.arange(len(idx)), lags[k]]
        periode = lags[k] / HZ
        gut = rhythmus > 0.3
        ref_per = float(np.median(periode[(tw <= b) & gut])) if np.any((tw <= b) & gut) else 0.75
        sh = int(1.5 * HZ)
        vor = v2[np.clip(idx - sh, 0, t.size - 1)] / ref_v
        nach = v2[np.clip(idx + sh, 0, t.size - 1)] / ref_v
        tempo = S["tempo"][idx]
        ta = np.gradient(np.convolve(S["tempo"], np.ones(w2) / w2, mode="same"))[idx] * HZ
        cols = {
            "v_rms1_rel": v1[idx] / ref_v, "v_rms2_rel": v2[idx] / ref_v, "v_rms4_rel": v4[idx] / ref_v,
            "v_rms2_log": np.log10(np.clip(v2[idx], 1e-3, 1.0)), "v_dip": v1[idx] / np.maximum(v4[idx], 1e-4),
            "band_anteil": band, "rhythmus": rhythmus, "periode_rel": periode / ref_per,
            "v_rms2_rel_vor": vor, "v_rms2_rel_nach": nach,
            "h_rms2_rel": h2[idx] / ref_h, "h_rms2_log": np.log10(np.clip(h2[idx], 1e-3, 1.0)),
            "vert_anteil": v2[idx] / np.maximum(v2[idx] + h2[idx], 1e-4), "hf_rel": hf2[idx] / ref_hf,
            "neigung_aend": np.abs(np.gradient(S["neig"])[idx] * HZ), "neigung_rel": S["neig"][idx] - ref_neig,
            "tempo_rel": tempo / ref_tempo, "tempo_abs": np.clip(tempo, 0, 8), "tempo_aend": ta,
            "kurs_rate": np.clip(S["kurs_rate"][idx], 0, 180),
            "seit_start": np.clip((tw - a) / 1000.0, 0, 30), "bis_ende": np.clip((b - tw) / 1000.0, -10, 30),
            "gyro_rms_rel": (gy2[idx] / max(float(np.median(gy2[ilauf])), 1e-3)) if gy2 is not None else np.full(tw.size, np.nan),
        }
        X.append(np.column_stack([cols[n] for n in NAMEN]).astype(np.float32))
        T.append(tw); LI.append(np.full(tw.size, li)); PUF.append(tw > b)
    if not X:
        return np.zeros(0), np.zeros((0, len(NAMEN)), np.float32), np.zeros(0, int), np.zeros(0, bool)
    return np.concatenate(T), np.vstack(X), np.concatenate(LI), np.concatenate(PUF)


def ziel(P: dict, tw: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Brett-Label je Fenster (Mehrheit im +-0,125-s-Fenster): -1 unbekannt, 0 aus, 1 gleiten, 2 pumpen;
    Carve (bool)."""
    U = P["uhr"]
    j = np.clip(np.searchsorted(U["t"], tw), 0, U["t"].size - 1)
    return P["lab"][j].astype(int), P["carve"][j]


def zustand(p, theta=0.5, glaett=3):
    """p (n, 3: aus/gleiten/pumpen) -> Zustand je Fenster 0/1/2. Auf dem Foil, wenn p_aus < 0,5; dort
    gleiten, wenn p_gleiten / (p_gleiten + p_pumpen) >= theta. Medianfilter ueber `glaett` Fenster."""
    from scipy.ndimage import median_filter
    an = p[:, 0] < 0.5
    q = p[:, 1] / np.maximum(p[:, 1] + p[:, 2], 1e-9)
    kl = np.where(an, np.where(q >= theta, 1, 2), 0)
    return median_filter(kl, size=glaett, mode="nearest")


def ableiten(tw, p, S, laeufe, puffer_s=5.0, theta=0.5, glaett=3):
    """Aus p je Fenster: Pump-Ereignisse und Gleitphasen je Lauf (EIN Zustand fuer beides).
    Pumps: Gipfel des Vertikal-Signals wie heute (find_pumps_cadence ueber Lauf + Puffer), aber nur die,
    die in einem Fenster im Zustand 'pumpen' liegen — in 'gleiten' und 'aus' gibt es keinen Pump.
    Gleiten: zusammenhaengende Fenster im Zustand 'gleiten', 1,5-15 s, nicht der Anlauf vor dem ersten
    Pump; 'aus' vor dem letzten Pump zaehlt als Gleiten. Die Stufe endet am ersten anhaltenden 'aus'
    (>= 1 s) nach dem letzten Pump (Aufsetzen), spaetestens am Zonenende (Lauf + Puffer)."""
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
    from app.ml.pumps import find_pumps_cadence
    t, v, echt = S["t"], S["v"], S["echt"]
    out = []
    for li, (a, b, bp) in enumerate(zone(laeufe, puffer_s)):
        m = (tw >= a) & (tw < bp)
        if m.sum() < 4:
            out.append({"pump_ms": [], "gleit": [], "ende": b, "longest": 0.0}); continue
        tz = tw[m]
        from scipy.ndimage import median_filter
        pz = p[m]
        q = pz[:, 1] / np.maximum(pz[:, 1] + pz[:, 2], 1e-9)
        kl = median_filter(np.where(q >= theta, 1, 2), size=glaett, mode="nearest")   # gleiten / pumpen
        an = median_filter((pz[:, 0] < 0.5).astype(np.int8), size=glaett, mode="nearest").astype(bool)
        i0, i1 = np.searchsorted(t, a), np.searchsorted(t, bp)
        idx = find_pumps_cadence(v[i0:i1], HZ) if i1 - i0 > HZ else np.empty(0, int)
        idx = idx[echt[i0 + idx]] if idx.size else idx
        kand = t[i0 + idx]
        j = np.clip(np.searchsorted(tz, kand - 125), 0, tz.size - 1) if kand.size else np.zeros(0, int)
        # im Lauf entscheidet nur pumpen/gleiten (die Laufgrenzen gehoeren v3); im Puffer muss das Modell
        # zusaetzlich 'auf dem Foil' sagen
        pumps = np.sort(kand[(kl[j] == 2) & ((tz[j] <= b) | an[j])]) if kand.size else kand
        ende = b
        if pumps.size:
            ende = bp
            aus = (~an).astype(np.int8)
            lauf_aus = np.convolve(aus, np.ones(4, np.int8), mode="full")[3:3 + aus.size] if aus.size >= 4 else aus * 0
            k = np.flatnonzero((lauf_aus >= 4) & (tz > pumps[-1]))
            if k.size:
                ende = float(tz[k[0]])
        in_z = tz < ende
        gleit = []
        if pumps.size:
            gm = (kl == 1) & in_z & (tz > pumps[0])
            d = np.diff(np.concatenate([[0], gm.astype(np.int8), [0]]))
            for s0, s1 in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)):
                x0, x1 = tz[s0] - 125, min(tz[s1 - 1] + 125, ende)
                if GLEIT_MIN_S <= (x1 - x0) / 1000.0 <= GLEIT_MAX_S:
                    gleit.append((float(x0), float(x1)))
        lang = max([(y - x) / 1000.0 for x, y in gleit], default=0.0)
        out.append({"pump_ms": list(pumps), "gleit": gleit, "ende": float(ende), "longest": round(lang, 2)})
    return out


GLEIT_MIN_S, GLEIT_MAX_S = 1.5, 15.0


def laufende_verlaengern(abl_lauf: dict, a: float, b: float, naechster: float, gps: np.ndarray,
                         max_s: float = 5.0, min_mps: float = 1.4, anteil: float = 0.5, sprung_mps: float = 2.0):
    """Variante (Jan, 23.10.2026): Laufende = Ende einer Gleitphase, die schon IM Lauf beginnt und
    lueckenlos ueber das Laufende hinaus geht — hoechstens `max_s`, gekappt am naechsten Lauf. GPS muss
    mitspielen: jeder Punkt im Verlaengerungsstueck >= max(min_mps, anteil x Lauf-Median-Tempo), kein
    Tempo-Sprung > `sprung_mps` zwischen zwei Punkten; sonst endet die Verlaengerung am letzten guten Punkt.
    -> (Verlaengerung s, Zusatzstrecke m)."""
    kand = [g for g in abl_lauf.get("gleit") or [] if g[0] <= b and g[1] > b + 250]
    if not kand or gps.shape[0] < 3:
        return 0.0, 0.0
    ziel = min(kand[0][1], b + max_s * 1000.0, naechster)
    t, v = gps[:, 0], gps[:, 3]
    drin = (t >= a) & (t <= b) & np.isfinite(v)
    if drin.sum() < 3:
        return 0.0, 0.0
    grenze = max(min_mps, anteil * float(np.median(v[drin])))
    vor = v[(t <= b) & np.isfinite(v)]
    letztes = float(vor[-1]) if vor.size else np.nan
    ende = b
    for ti, vi in zip(t[(t > b) & (t <= ziel)], v[(t > b) & (t <= ziel)]):
        if not np.isfinite(vi) or vi < grenze or (np.isfinite(letztes) and abs(vi - letztes) > sprung_mps):
            break
        ende, letztes = float(ti), float(vi)
    else:
        # alle Punkte gut: bis zum Ziel (auch zwischen zwei Punkten)
        if ende >= b and np.isfinite(letztes) and letztes >= grenze:
            ende = ziel
    if ende <= b:
        return 0.0, 0.0
    tt = np.linspace(b, ende, 20)
    m = float(np.trapezoid(np.interp(tt, t, np.nan_to_num(v)), tt / 1000.0))
    return (ende - b) / 1000.0, m


def lange_gleit_tempo(abl_lauf: dict, gps: np.ndarray, ab_s: float = 12.0) -> list:
    """Je Gleitphase >= `ab_s`: Dauer, mittleres/kleinstes Tempo, Tempo-Steigung (m/s je s)."""
    out = []
    for x, y in abl_lauf.get("gleit") or []:
        if (y - x) / 1000.0 < ab_s:
            continue
        m = (gps[:, 0] >= x) & (gps[:, 0] <= y) & np.isfinite(gps[:, 3])
        if m.sum() < 3:
            out.append({"s": round((y - x) / 1000.0, 1)}); continue
        tt, vv = gps[m, 0] / 1000.0, gps[m, 3]
        out.append({"s": round((y - x) / 1000.0, 1), "v_mittel": round(float(vv.mean()), 2),
                    "v_min": round(float(vv.min()), 2), "steigung": round(float(np.polyfit(tt, vv, 1)[0]), 3),
                    "t0": round(x)})
    return out
