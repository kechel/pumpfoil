"""Drehrichtung ueber eine Kurs-Luecke mitten in der Halse (app/manoever.py, #19084, 26.10.2026)."""
import math

import numpy as np

from app import manoever as M


def _halse_mit_luecke(dop_kmh: float):
    """Halber Wind 75° -> 255°, Drehung LINKS ueber Nord (Wind von 165°), 3 s ohne Kurs mittendrin."""
    kurse = [75.0] * 15 + [70, 60, 45, 25] + [np.nan] * 3 + [300, 280, 265, 258] + [255.0] * 15
    t = np.arange(len(kurse), dtype=float)
    kurs = np.array(kurse, dtype=float)
    tempo = np.where(np.isnan(kurs), 5.0, 16.0)
    dop = np.full(len(kurse), dop_kmh)
    return t, kurs, tempo, dop


def test_halse_bleibt_halse_trotz_luecke():
    t, kurs, tempo, dop = _halse_mit_luecke(12.0)
    out = M._manoever(t, kurs, tempo, (t * 1000).astype(int), lambda _t: 165.0, dop)
    assert [m["typ"] for m in out] == ["halse"]
    assert out[0]["drehung"] < 0


def test_stopp_im_wasser_bleibt_beim_alten_bogen():
    # Doppler 3 km/h: abgesetzt — die Teilsumme sagt nichts ueber die Drehung, alter Bogen gilt.
    t, kurs, tempo, dop = _halse_mit_luecke(3.0)
    i = 20
    d = M._winkel_diff(75.0, 255.0)
    assert M._richtung_ueber_luecke(t, kurs, i, d, dop) == d


def test_anfahrt_ist_kein_manoever():
    # Langsam (6 km/h) hineingedreht und dann losgefahren -> Start, keine Wende/Halse.
    t, kurs, tempo, _ = _halse_mit_luecke(12.0)
    dop = np.where(t < 18, 6.0, 15.0)
    out = M._manoever(t, kurs, tempo, (t * 1000).astype(int), lambda _t: 165.0, dop)
    assert out == []
