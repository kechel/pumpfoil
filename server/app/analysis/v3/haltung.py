"""Erkennung v3: Haltung der Uhr RELATIV zur Session (NICHT live, nur Messungen).

Jans Idee (30.09.2026, an #9580): in echten Laeufen sitzt die Uhr fast immer gleich — gegen die
typische Lauf-Haltung derselben Session im Median 4,5° (2593 sichere Laeufe), Gehen/Tragen an Land
72°, Laeufe an Land 75°; Bewegungs-Profil 0,10 gegen 0,70, Staerke 1,00 gegen 0,12
(scripts/v3/haltung.py). Absolute Werte helfen dabei nicht — jeder traegt die Uhr anders —, erst
der Vergleich mit den eigenen sicheren Laeufen derselben Session.

Zweistufig: die Referenz kommt aus den Sekunden, in denen ein Vorgaenger-Modell sicher ist
(p >= REF_P, Tempo >= REF_V). Ohne genug solche Sekunden sind die Merkmale NaN (das Modell kann mit
fehlenden Werten umgehen) — dann entscheidet es wie bisher.
"""
from __future__ import annotations

import numpy as np

from . import merkmale as M

NAMEN = ["haltung_winkel", "haltung_profil", "haltung_staerke",
         # Jan (30.09.): „95 %+ je Run sollte eher konstant bleiben" — gegen SICH SELBST im
         # gleitenden Fenster (scripts/v3/konstanz.py: 30 s trennt die schweren Faelle am besten,
         # echte Laeufe 0,81 gegen 0,26), dazu die Drehrate der Uhr-Achse im selben Fenster.
         "konstanz20", "konstanz30", "wechsel30"]
KONST_GRAD = 20.0
REF_P, REF_V, REF_MIN_S = 0.9, 2.0, 20
FENSTER_S = 5


def _je_sekunde(tb):
    """Schwerkraft (1-s-Mittel) und Bewegungs-Energie je Achse, je Sekunde ab window_start_ms."""
    hz = 25.0
    r = M.raster(tb, hz) / float(tb.accel_scale or 2048)
    k = int(hz)
    n = r.shape[0] // k
    if n < 2:
        return None
    grav = np.stack([np.convolve(r[:, i], np.ones(k) / k, mode="same") for i in range(3)], 1)
    ac = r - grav
    g = grav[:n * k].reshape(n, k, 3).mean(1)
    a2 = (ac[:n * k] ** 2).reshape(n, k, 3).mean(1)
    t = float(tb.window_start_ms) + (np.arange(n) + 0.5) * 1000.0
    return t, g, a2


def _konstanz(tb, t_gps: np.ndarray) -> np.ndarray:
    """(n_gps, 3): Anteil der Schwerkraft-Richtung (1-s-Mittel, 5 Hz) innerhalb KONST_GRAD der
    Hauptrichtung im ±10-s- und ±15-s-Fenster, Drehrate (Grad/s) im ±15-s-Fenster."""
    out = np.full((t_gps.size, 3), np.nan)
    hz, sh = 25.0, 5
    r = M.raster(tb, hz) / float(tb.accel_scale or 2048)
    if r.shape[0] < 2 * hz:
        return out
    k = int(hz)
    grav = np.stack([np.convolve(r[:, i], np.ones(k) / k, mode="same") for i in range(3)], 1)
    s = int(hz / sh)
    n = r.shape[0] // s
    u = grav[:n * s].reshape(n, s, 3).mean(1)
    u /= np.maximum(np.linalg.norm(u, axis=1, keepdims=True), 1e-9)
    t = float(tb.window_start_ms) + (np.arange(n) + 0.5) * 1000.0 / sh
    schritt = np.degrees(np.arccos(np.clip((u[1:] * u[:-1]).sum(1), -1, 1)))
    schritt = np.concatenate([[0.0], schritt])
    cs = np.vstack([np.zeros((1, 3)), np.cumsum(u, 0)])
    css = np.concatenate([[0.0], np.cumsum(schritt)])
    cosg = np.cos(np.radians(KONST_GRAD))
    for spalte, halb in ((0, 10), (1, 15)):
        lo = np.clip(np.searchsorted(t, t_gps - halb * 1000), 0, n)
        hi = np.clip(np.searchsorted(t, t_gps + halb * 1000), 0, n)
        for i in range(t_gps.size):
            a, b = lo[i], hi[i]
            if b - a < 5:
                continue
            m = cs[b] - cs[a]; m /= max(np.linalg.norm(m), 1e-9)
            out[i, spalte] = float((u[a:b] @ m >= cosg).mean())
            if spalte == 1:
                out[i, 2] = float((css[b] - css[a]) / max(b - a, 1) * sh)
    return out


def merkmale(tb, t_gps: np.ndarray, v_gps: np.ndarray, p_ref: np.ndarray) -> np.ndarray:
    """(n_gps, 6): Winkel zur typischen Lauf-Haltung (Grad), L1-Abstand des Achsen-Profils,
    Staerke relativ — je GPS-Sekunde, im ±FENSTER_S/2-Fenster, p_ref je GPS-Sample; dazu die
    Konstanz gegen sich selbst (braucht keine Referenz)."""
    out = np.full((t_gps.size, len(NAMEN)), np.nan)
    try:
        out[:, 3:] = _konstanz(tb, t_gps)
    except Exception:
        pass
    js = _je_sekunde(tb)
    if js is None or p_ref is None or p_ref.size != t_gps.size:
        return out
    t, g, a2 = js
    j = np.clip(np.searchsorted(t, t_gps), 0, t.size - 1)
    sicher = (p_ref >= REF_P) & (np.nan_to_num(v_gps) >= REF_V)
    if sicher.sum() < REF_MIN_S:
        return out
    gn = g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
    rg = np.median(gn[j[sicher]], axis=0); rg /= max(np.linalg.norm(rg), 1e-9)
    anteil = a2 / np.maximum(a2.sum(1, keepdims=True), 1e-12)
    rp = np.median(anteil[j[sicher]], axis=0)
    rr = float(np.median(np.sqrt(a2[j[sicher]].sum(1))))
    # gleitend ueber FENSTER_S Sekunden (auf dem 1-s-Raster)
    k = FENSTER_S
    def glatt(x):
        return np.stack([np.convolve(x[:, i], np.ones(k) / k, mode="same") for i in range(x.shape[1])], 1)
    gg = glatt(gn); gg /= np.maximum(np.linalg.norm(gg, axis=1, keepdims=True), 1e-9)
    winkel = np.degrees(np.arccos(np.clip(gg @ rg, -1, 1)))
    profil = np.abs(glatt(anteil) - rp).sum(1)
    staerke = np.sqrt(glatt(a2).sum(1)) / max(rr, 1e-6)
    out[:, 0] = winkel[j]; out[:, 1] = profil[j]; out[:, 2] = staerke[j]
    return out
