"""Physikalischer Weg (Jans Vorrang, 23.10.2026): Takt und Phase des Pumpens adaptiv verfolgen.

Pumpen ist rhythmisch, aber der Takt wechselt im Lauf („Gas geben", bewusst langsamer). Darum KEIN fester Takt
und keine Bindung an den Lauf-Median:
  - Kandidaten = alle lokalen Gipfel des senkrechten Signals (Bandpass 0,3-3 Hz, wie Stufe 11).
  - Eingerastet: naechster Pump erwartet bei letzter + T; gesucht in [ (1-delta) T, (1+delta) T ]; gewaehlt der
    Gipfel mit der besten Mischung aus Hoehe und Naehe zur Erwartung; angenommen, wenn seine Hoehe >= alpha x
    Hoehe der letzten 4 Pumps (eigene, laufende Pump-Staerke). T = Median der letzten 3 Abstaende, je Zyklus
    hoechstens um +-35 % geaendert.
  - Kein passender Gipfel im Fenster: der Takt reisst ab -> Suche. Wieder eingerastet wird mit zwei Gipfeln
    >= beta x Pump-Staerke des Laufs im Abstand 0,45-1,3 s.
  - Gleiten = Luecke zwischen zwei Pumps >= gleit_min_s, in der die Energie (RMS) unter gamma x eigener
    Pump-RMS des Laufs liegt (Takt reisst ab UND Energie faellt). Luecken mit hoher Energie ohne Takt sind
    „unklar" (Arm wackelt, Carve, verpasste Pumps) und zaehlen nicht als Gleiten.
  - Ende der Stufe im Puffer: Aufsetzen aus dem Uhr-GPS (Regel wie brett_regeln.aufsetzen_ms) oder Zonenende.
Daneben: HMM mit Dauer-Vorwissen (halb-markovsch ueber Unterzustaende) zum Glaetten von Fenster-p, und
Abstimmung ueberlappender 5-s-Fenster (1 s Schritt).
"""
from __future__ import annotations

import numpy as np

import merkmale as M

PLL_STANDARD = {"alpha": 0.3, "beta": 0.5, "delta": 0.4, "gamma": 0.5, "gleit_min_s": 1.5, "max_aend": 0.35,
                "max_schwach": 2}


def gipfel(x):
    i = np.flatnonzero((x[1:-1] > x[:-2]) & (x[1:-1] >= x[2:])) + 1
    return i


def takt_folgen(t, x, ref_amp, T0, prm):
    """t, x: Zeit (ms) und senkrechtes Signal der Zone. -> Liste angenommener Pump-Zeiten."""
    p = {**PLL_STANDARD, **(prm or {})}
    gi = gipfel(x)
    if gi.size < 2:
        return []
    gt, ga = t[gi], x[gi]
    acc_t, acc_a = [], []
    T = T0
    k = 0
    n = gt.size
    zustand = "suche"
    schwach_n = 0
    while k < n:
        if zustand == "suche":
            # zwei kraeftige Gipfel im plausiblen Abstand
            if ga[k] >= p["beta"] * ref_amp:
                j = k + 1
                best = None
                while j < n and gt[j] - gt[k] <= 1300:
                    # der Kandidat, dessen Abstand dem Lauf-Takt (FFT) am naechsten liegt — nicht der hoechste,
                    # sonst rastet die Suche gern auf den doppelten Abstand (jeden zweiten Pump) ein
                    if gt[j] - gt[k] >= 450 and ga[j] >= p["beta"] * ref_amp:
                        if best is None or abs(gt[j] - gt[k] - T0) < abs(gt[best] - gt[k] - T0):
                            best = j
                    j += 1
                if best is not None:
                    acc_t += [gt[k], gt[best]]; acc_a += [ga[k], ga[best]]
                    T = gt[best] - gt[k]
                    k = best + 1
                    zustand = "takt"
                    continue
            k += 1
            continue
        last = acc_t[-1]
        e = last + T
        lo, hi = last + (1 - p["delta"]) * T, last + (1 + p["delta"]) * T
        while k < n and gt[k] < lo:
            k += 1
        j, best, bs, schw, ss = k, None, -1.0, None, -1.0
        amp_lok = float(np.median(acc_a[-4:]))
        while j < n and gt[j] <= hi:
            s = ga[j] * np.exp(-((gt[j] - e) / (0.25 * T)) ** 2)
            if ga[j] >= p["alpha"] * amp_lok and s > bs:
                best, bs = j, s
            if s > ss:
                schw, ss = j, s
            j += 1
        if best is None and schw is not None and schwach_n < p["max_schwach"]:
            # schwacher Gipfel, aber im Takt: vorlaeufig behalten (Schwungrad); reisst der Takt danach ab,
            # werden die vorlaeufigen wieder gestrichen
            best = schw
            schwach_n += 1
        elif best is not None:
            schwach_n = 0
        if best is None:
            if schwach_n:
                del acc_t[-schwach_n:]; del acc_a[-schwach_n:]
                schwach_n = 0
            zustand = "suche"
            while k < n and gt[k] <= hi:
                k += 1
            continue
        acc_t.append(gt[best]); acc_a.append(ga[best] if schwach_n == 0 else amp_lok)
        iv = np.diff(acc_t[-4:])
        Tn = float(np.median(iv)) if iv.size else T
        T = float(np.clip(Tn, (1 - p["max_aend"]) * T, (1 + p["max_aend"]) * T))
        T = float(np.clip(T, 400, 1600))
        k = best + 1
    return acc_t


def _dom_T(x, fs=M.HZ):
    if x.size < 2 * fs:
        return 750.0
    F = np.abs(np.fft.rfft((x - x.mean()) * np.hanning(x.size)))
    f = np.fft.rfftfreq(x.size, 1 / fs)
    b = (f >= 0.8) & (f <= 2.0)
    return 1000.0 / float(f[b][np.argmax(F[b])]) if b.any() else 750.0


def physik(S, laeufe, prm=None, puffer_s=5.0, gps=None):
    """-> je Lauf {pump_ms, gleit, unklar, ende, longest} — rein physikalisch, ohne Modell."""
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
    from app.ml.pumps import find_pumps_cadence
    from app.analysis.brett_regeln import aufsetzen_ms
    p = {**PLL_STANDARD, **(prm or {})}
    t, v, echt = S["t"], S["v"], S["echt"]
    out = []
    for a, b, bp in M.zone(laeufe, puffer_s):
        i0, ib, i1 = np.searchsorted(t, a), np.searchsorted(t, b), np.searchsorted(t, bp)
        if ib - i0 < 2 * M.HZ:
            out.append({"pump_ms": [], "gleit": [], "unklar": [], "ende": b, "longest": 0.0}); continue
        xr = v[i0:ib]
        kand = find_pumps_cadence(xr, M.HZ)
        ref_amp = float(np.median(xr[kand])) if kand.size else float(np.percentile(np.abs(xr), 90))
        ref_amp = max(ref_amp, 0.01)
        T0 = _dom_T(xr)
        pumps = np.asarray(takt_folgen(t[i0:i1], v[i0:i1], ref_amp, T0, p))
        if pumps.size:
            pumps = pumps[echt[np.clip(np.searchsorted(t, pumps), 0, t.size - 1)]]
        # Ende: im Lauf das Laufende; im Puffer Aufsetzen aus dem Uhr-GPS
        ende = b
        if gps is not None and len(gps) and pumps.size and pumps.max() > b - 3000:
            td, q = aufsetzen_ms(np.asarray(gps, float), a, bp)
            ende = td if q == "gps" and td > b else min(bp, max(b, float(pumps.max()) + 1500))
        pumps = pumps[pumps <= ende] if pumps.size else pumps
        # Pump-RMS des Laufs (Energie): RMS in +-0,4 s um die Pumps
        if pumps.size >= 3:
            pi = np.searchsorted(t, pumps)
            seg = np.concatenate([v[max(k - 10, 0):k + 10] for k in pi])
            rms_p = float(np.sqrt(np.mean(seg ** 2)))
        else:
            rms_p = float(np.sqrt(np.mean(xr ** 2)))
        gleit, unklar = [], []
        if pumps.size:
            grenzen = list(pumps) + [ende]
            for x0, x1 in zip(grenzen[:-1], grenzen[1:]):
                d = (x1 - x0) / 1000.0
                if not (p["gleit_min_s"] <= d <= 15.0):
                    continue
                j0, j1 = np.searchsorted(t, x0 + 300), np.searchsorted(t, x1 - 100)
                if j1 - j0 < 5:
                    continue
                if not echt[j0:j1].all():
                    continue
                rms = float(np.sqrt(np.mean(v[j0:j1] ** 2)))
                (gleit if rms < p["gamma"] * rms_p else unklar).append((float(x0), float(x1)))
        lang = max([(y - x) / 1000.0 for x, y in gleit], default=0.0)
        out.append({"pump_ms": list(pumps), "gleit": gleit, "unklar": unklar, "ende": float(ende), "longest": round(lang, 2)})
    return out


# ------------------------------------------------------------------ HMM mit Dauern

def hsmm_glaetten(p, prior, min_s=(1.0, 1.5, 1.0), mittel_s=(6.0, 3.0, 20.0), schritt=M.SCHRITT_S):
    """Viterbi ueber Zustaende aus/gleiten/pumpen mit Mindestdauer (Kette von Unterzustaenden) und mittlerer
    Dauer (Verweilwahrscheinlichkeit im letzten Unterzustand). Emission = p / prior. -> Zustand je Fenster."""
    K = 3
    m = [max(int(round(s / schritt)), 1) for s in min_s]
    stay = [1 - schritt / max(mu - ms, schritt * 1.5) for mu, ms in zip(mittel_s, min_s)]
    zust = [(k, i) for k in range(K) for i in range(m[k])]
    Z = len(zust)
    idx = {z: n for n, z in enumerate(zust)}
    lt = np.full((Z, Z), -np.inf)
    for (k, i), n in idx.items():
        if i < m[k] - 1:
            lt[n, idx[(k, i + 1)]] = 0.0
        else:
            lt[n, n] = np.log(stay[k])
            for k2 in range(K):
                if k2 != k:
                    lt[n, idx[(k2, 0)]] = np.log((1 - stay[k]) / (K - 1))
    em = np.log(np.clip(p / np.asarray(prior)[None, :], 1e-9, None))
    T = p.shape[0]
    if T == 0:
        return np.zeros(0, int)
    zk = np.array([k for k, _ in zust])
    d = em[0, zk].copy()
    back = np.zeros((T, Z), np.int32)
    for t in range(1, T):
        s = d[:, None] + lt
        back[t] = np.argmax(s, axis=0)
        d = s[back[t], np.arange(Z)] + em[t, zk]
    pfad = np.zeros(T, np.int32)
    pfad[-1] = int(np.argmax(d))
    for t in range(T - 1, 0, -1):
        pfad[t - 1] = back[t, pfad[t]]
    return zk[pfad]


def abstimmen_5s(tw, p, hop=4, breite_s=5.0):
    """Ueberlappende 5-s-Fenster, 1 s Schritt: jedes Fenster traegt sein p (Mitte) auf seine 5 s; je Zeitpunkt
    der Mittelwert aller Fenster, die ihn abdecken (bis 5)."""
    if p.shape[0] == 0:
        return p
    sel = np.arange(0, tw.size, hop)
    ts, ps = tw[sel], p[sel]
    out = np.zeros_like(p)
    for i, t0 in enumerate(tw):
        m = np.abs(ts - t0) <= breite_s * 500
        out[i] = ps[m].mean(axis=0) if m.any() else p[i]
    return out


# ------------------------------------------------------------------ Takt-Filter auf den heutigen Kandidaten

FILTER_STANDARD = {"doppel": 0.6, "luecke_min": 1.6, "luecke_max": 2.4, "alpha_fuell": 0.35, "gamma": 0.5,
                   "gleit_min_s": 1.5, "fenster": 4}


def takt_filter(t, x, kand_t, kand_a, prm):
    """Heutige Kandidaten durch den Takt filtern (adaptiv, lokaler Takt = Median der umliegenden `fenster`
    Abstaende, keine Bindung an den Lauf):
      - Doppel: zwei Kandidaten naeher als `doppel` x lokaler Takt -> der schwaechere faellt weg.
      - Fuellen: Luecke von luecke_min..luecke_max x Takt -> der hoechste Gipfel nahe der Mitte (+-25 % Takt)
        wird ergaenzt, wenn er >= alpha_fuell x lokale Pump-Hoehe ist (verpasster, schwacher Pump im Takt)."""
    p = {**FILTER_STANDARD, **(prm or {})}
    kt, ka = list(kand_t), list(kand_a)
    if len(kt) < 3:
        return np.asarray(kt)
    w = p["fenster"]

    def lok_T(i, arr):
        d = np.diff(arr[max(0, i - w):i + w + 1])
        return float(np.median(d)) if d.size else 700.0

    # Doppel entfernen (iterativ, schwaecherer faellt)
    geaendert = True
    while geaendert and len(kt) >= 3:
        geaendert = False
        arr = np.asarray(kt)
        for i in range(1, len(kt)):
            if kt[i] - kt[i - 1] < p["doppel"] * lok_T(i, arr):
                k = i if ka[i] < ka[i - 1] else i - 1
                del kt[k]; del ka[k]
                geaendert = True
                break
    # Fuellen: Luecke von n Takten (n >= 2, Abstand je Takt auf 25 % gleich dem lokalen Takt) -> je fehlendem Takt
    # den hoechsten Gipfel nahe der erwarteten Stelle (+-30 %) ergaenzen, wenn >= alpha_fuell x lokale Pump-Hoehe
    gi = gipfel(x)
    gt, ga = t[gi], x[gi]
    arr = np.asarray(kt)
    neu = []
    for i in range(1, len(kt)):
        T = lok_T(i, arr)
        d = kt[i] - kt[i - 1]
        nn = int(round(d / T))
        if nn < 2 or d < p["luecke_min"] * T or d > 4.5 * T or abs(d / nn - T) > 0.25 * T:
            continue
        amp = float(np.median(ka[max(0, i - w):i + w]))
        st = d / nn
        for kk in range(1, nn):
            ziel = kt[i - 1] + kk * st
            m = np.abs(gt - ziel) <= 0.3 * st
            if m.any():
                j = np.flatnonzero(m)[np.argmax(ga[m])]
                if ga[j] >= p["alpha_fuell"] * amp:
                    neu.append(gt[j])
    return np.sort(np.asarray(kt + neu))


def physik_filter(S, laeufe, prm=None, puffer_s=5.0, gps=None):
    """Heutige Kandidaten + Takt-Filter; Gleiten = Luecke >= gleit_min_s mit Energie < gamma x Pump-RMS."""
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
    from app.ml.pumps import find_pumps_cadence
    from app.analysis.brett_regeln import aufsetzen_ms
    p = {**FILTER_STANDARD, **(prm or {})}
    t, v, echt = S["t"], S["v"], S["echt"]
    out = []
    for a, b, bp in M.zone(laeufe, puffer_s):
        i0, ib, i1 = np.searchsorted(t, a), np.searchsorted(t, b), np.searchsorted(t, bp)
        if ib - i0 < 2 * M.HZ:
            out.append({"pump_ms": [], "gleit": [], "unklar": [], "ende": b, "longest": 0.0}); continue
        idx = find_pumps_cadence(v[i0:i1], M.HZ)
        idx = idx[echt[i0 + idx]] if idx.size else idx
        pumps = takt_filter(t[i0:i1], v[i0:i1], t[i0 + idx], v[i0 + idx], p) if idx.size else np.zeros(0)
        ende = b
        if gps is not None and len(gps) and pumps.size and pumps.max() > b - 3000:
            td, q = aufsetzen_ms(np.asarray(gps, float), a, bp)
            ende = td if q == "gps" and td > b else min(bp, max(b, float(pumps.max()) + 1500))
        pumps = pumps[pumps <= ende] if pumps.size else pumps
        if pumps.size >= 3:
            pi = np.searchsorted(t, pumps)
            rms_p = float(np.sqrt(np.mean(np.concatenate([v[max(k - 10, 0):k + 10] for k in pi]) ** 2)))
        else:
            rms_p = float(np.sqrt(np.mean(v[i0:ib] ** 2)))
        gleit, unklar = [], []
        if pumps.size:
            grenzen = list(pumps) + [ende]
            for x0, x1 in zip(grenzen[:-1], grenzen[1:]):
                d = (x1 - x0) / 1000.0
                if not (p["gleit_min_s"] <= d <= 15.0):
                    continue
                j0, j1 = np.searchsorted(t, x0 + 300), np.searchsorted(t, x1 - 100)
                if j1 - j0 < 5 or not echt[j0:j1].all():
                    continue
                rms = float(np.sqrt(np.mean(v[j0:j1] ** 2)))
                (gleit if rms < p["gamma"] * rms_p else unklar).append((float(x0), float(x1)))
        lang = max([(y - x) / 1000.0 for x, y in gleit], default=0.0)
        out.append({"pump_ms": list(pumps), "gleit": gleit, "unklar": unklar, "ende": float(ende), "longest": round(lang, 2)})
    return out
