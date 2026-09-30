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

NAMEN = ["haltung_winkel", "haltung_profil", "haltung_staerke"]
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


def merkmale(tb, t_gps: np.ndarray, v_gps: np.ndarray, p_ref: np.ndarray) -> np.ndarray:
    """(n_gps, 3): Winkel zur typischen Lauf-Haltung (Grad), L1-Abstand des Achsen-Profils,
    Staerke relativ — je GPS-Sekunde, im ±FENSTER_S/2-Fenster. p_ref je GPS-Sample."""
    out = np.full((t_gps.size, 3), np.nan)
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
