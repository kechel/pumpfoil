"""Tuning-Runde (Jan, 23.10.2026): Gleiten erkennen, aber KEINE echten Pumps mehr wegwerfen.

Zwei Teile statt einem Zustand fuer alles:
  (B) Gleit-Zustand je 0,25-s-Fenster (aus / gleiten / pumpen, wie hgb_7) -> nur fuer Gleitphasen und Ende.
  (A) Pump-Kandidaten = heutige Gipfel (find_pumps_cadence ueber Lauf + Puffer). Gestrichen wird NUR
      - eine Doppelzaehlung (Kandidat-Klassifikator oder Regel: zu nah am Nachbarn und kleiner), oder
      - ein Kandidat in SEHR sicherem Gleiten (q >= theta_hoch ueber >= sicher_s am Stueck).
Gleitphasen = Zustand gleiten (q >= theta) >= gleit_min_s, an behaltenen Pumps geteilt, erst nach dem ersten
Pump, enden am ersten anhaltenden 'aus' nach dem letzten Pump. Optional „genauer hinschauen": Gleitphasen
>= hinschauen_s, in denen das GPS-Tempo kaum faellt (Steigung > -0,05 m/s je s) — werden NICHT als Gleiten
gezaehlt, sondern gesondert ausgewiesen (Welle, Fremdkraft oder verpasste Pumps).
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import merkmale as M

KAND_NAMEN = ["amp_rel", "amp_nachbar", "dt_vor_rel", "dt_nach_rel", "dt_min_rel", "q", "p_aus",
              "v_rms1_rel", "v_dip", "rhythmus", "band_anteil", "vert_anteil", "tempo_rel"]

STANDARD = {"theta": 0.7, "theta_hoch": 0.9, "sicher_s": 2.0, "gleit_min_s": 1.5, "glaett": 3,
            "doppel": "keins", "doppel_faktor": 0.55, "tau": 0.0, "hinschauen_s": 0.0, "puffer_s": 5.0}


def _kandidaten(S, a, bp):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
    from app.ml.pumps import find_pumps_cadence
    t, v, echt = S["t"], S["v"], S["echt"]
    i0, i1 = np.searchsorted(t, a), np.searchsorted(t, bp)
    idx = find_pumps_cadence(v[i0:i1], M.HZ) if i1 - i0 > M.HZ else np.empty(0, int)
    idx = idx[echt[i0 + idx]] if idx.size else idx
    return t[i0 + idx], v[i0 + idx]


def kand_merkmale(kt, kv, tz, pz, Xz):
    """Merkmale je Kandidat (relativ, fahrerunabhaengig)."""
    n = kt.size
    if n == 0:
        return np.zeros((0, len(KAND_NAMEN)), np.float32)
    ref = max(float(np.median(kv)), 1e-4)
    dvor = np.r_[np.inf, np.diff(kt)]; dnach = np.r_[np.diff(kt), np.inf]
    d = np.diff(kt)
    lok = np.array([np.median(d[max(0, i - 4):i + 4]) if d.size else 700.0 for i in range(n)])
    lok = np.maximum(lok, 200.0)
    vvor = np.r_[0.0, kv[:-1]]; vnach = np.r_[kv[1:], 0.0]
    j = np.clip(np.searchsorted(tz, kt - 125), 0, max(tz.size - 1, 0))
    q = pz[j, 1] / np.maximum(pz[j, 1] + pz[j, 2], 1e-9)
    col = lambda nm: Xz[j, M.NAMEN.index(nm)]
    F = np.column_stack([kv / ref, kv / np.maximum(np.maximum(vvor, vnach), 1e-4),
                         np.minimum(dvor / lok, 5), np.minimum(dnach / lok, 5), np.minimum(np.minimum(dvor, dnach) / lok, 5),
                         q, pz[j, 0], col("v_rms1_rel"), col("v_dip"), col("rhythmus"), col("band_anteil"),
                         col("vert_anteil"), col("tempo_rel")])
    return F.astype(np.float32)


def _laeufe_stuecke(maske):
    d = np.diff(np.concatenate([[0], maske.astype(np.int8), [0]]))
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def ableiten2(tw, p, X, S, laeufe, cfg, kand_clf=None, gps=None, kand_aus=None):
    """-> je Lauf {pump_ms, gleit, hinschauen, ende, longest}. `kand_aus` (Liste) sammelt je Kandidat
    (Zeit, Merkmale) fuers Training des Kandidat-Klassifikators."""
    from scipy.ndimage import median_filter
    c = {**STANDARD, **(cfg or {})}
    out = []
    for li, (a, b, bp) in enumerate(M.zone(laeufe, c["puffer_s"])):
        m = (tw >= a) & (tw < bp)
        if m.sum() < 4:
            out.append({"pump_ms": [], "gleit": [], "hinschauen": [], "ende": b, "longest": 0.0}); continue
        tz, pz, Xz = tw[m], p[m], X[m]
        q = pz[:, 1] / np.maximum(pz[:, 1] + pz[:, 2], 1e-9)
        g = median_filter((q >= c["theta"]).astype(np.int8), size=c["glaett"], mode="nearest").astype(bool)
        an = median_filter((pz[:, 0] < 0.5).astype(np.int8), size=c["glaett"], mode="nearest").astype(bool)
        sicher = np.zeros(tz.size, bool)
        for s0, s1 in _laeufe_stuecke(q >= c["theta_hoch"]):
            if (s1 - s0) * M.SCHRITT_S >= c["sicher_s"]:
                sicher[s0:s1] = True
        kt, kv = _kandidaten(S, a, bp)
        j = np.clip(np.searchsorted(tz, kt - 125), 0, tz.size - 1) if kt.size else np.zeros(0, int)
        behalten = np.ones(kt.size, bool)
        if kt.size:
            behalten &= (tz[j] <= b) | an[j]                    # im Puffer nur auf dem Foil
            behalten &= ~sicher[j]                              # sehr sicheres Gleiten
            F = kand_merkmale(kt, kv, tz, pz, Xz)
            if kand_aus is not None:
                kand_aus.append((kt, F))
            if c["doppel"] == "regel":
                d = np.diff(kt)
                lok = np.array([np.median(d[max(0, i - 4):i + 4]) if d.size else 700.0 for i in range(kt.size)])
                for i in range(1, kt.size):
                    if kt[i] - kt[i - 1] < c["doppel_faktor"] * lok[i]:
                        k = i if kv[i] < kv[i - 1] else i - 1
                        behalten[k] = False
            elif c["doppel"] == "modell" and kand_clf is not None:
                behalten &= kand_clf(F) >= c["tau"]
        pumps = np.sort(kt[behalten])
        ende = b
        if pumps.size:
            ende = bp
            aus = (~an).astype(np.int8)
            la = np.convolve(aus, np.ones(4, np.int8), mode="full")[3:3 + aus.size] if aus.size >= 4 else aus * 0
            k = np.flatnonzero((la >= 4) & (tz > pumps[-1]))
            if k.size:
                ende = float(tz[k[0]])
        pumps = pumps[pumps < ende]
        gleit, hin = [], []
        if pumps.size:
            gm = g & (tz < ende) & (tz > pumps[0])
            for s0, s1 in _laeufe_stuecke(gm):
                x0, x1 = tz[s0] - 125, min(tz[s1 - 1] + 125, ende)
                # an behaltenen Pumps teilen
                grenzen = [x0] + [x for x in pumps if x0 < x < x1] + [x1]
                for y0, y1 in zip(grenzen[:-1], grenzen[1:]):
                    dd = (y1 - y0) / 1000.0
                    if not (c["gleit_min_s"] <= dd <= 15.0):
                        continue
                    if c["hinschauen_s"] and dd >= c["hinschauen_s"] and gps is not None:
                        mm = (gps[:, 0] >= y0) & (gps[:, 0] <= y1) & np.isfinite(gps[:, 3])
                        if mm.sum() >= 3 and np.polyfit(gps[mm, 0] / 1000.0, gps[mm, 3], 1)[0] > -0.05:
                            hin.append((float(y0), float(y1))); continue
                    gleit.append((float(y0), float(y1)))
        lang = max([(y - x) / 1000.0 for x, y in gleit], default=0.0)
        out.append({"pump_ms": list(pumps), "gleit": gleit, "hinschauen": hin, "ende": float(ende),
                    "longest": round(lang, 2)})
    return out
