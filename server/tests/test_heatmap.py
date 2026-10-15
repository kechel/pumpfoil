"""Heatmap der Spot-Karte (app/heatmap.py): nur die Laeufe, je Session einmal je Zelle, verborgene
Aufnahmen am oeffentlichen Ort (Point Nemo)."""
import json

import numpy as np


def _spur(punkte):
    return json.dumps({"type": "Feature", "geometry": {"type": "LineString", "coordinates": punkte},
                       "properties": {}})


def test_nur_laeufe_und_eindeutig():
    from app.heatmap import _entpacken, kachel, zellen_der_session
    # 0..9 Lauf am Steg (Illmensee), 10..19 Paddeln weit weg — darf NICHT zaehlen.
    lauf = [[9.374 + i * 0.00001, 47.862] for i in range(10)]
    weg = [[9.5, 47.9] for _ in range(10)]
    segs = [{"type": "foiling", "i_start": 0, "i_end": 9}, {"type": "idle", "i_start": 10, "i_end": 19}]
    z = zellen_der_session(_spur(lauf + weg), json.dumps(segs), verborgen=False)
    assert len(z) == len(np.unique(z)) and len(z) >= 1
    ix, iy = _entpacken(z)
    wx, wy = kachel(np.array([9.5]), np.array([47.9]))
    assert not ((ix == wx[0]) & (iy == wy[0])).any()


def test_verborgen_liegt_an_point_nemo():
    from app.heatmap import _entpacken, kachel, zellen_der_session
    from app.ortverbergen import NEMO_LAT, NEMO_LON
    lauf = [[9.374, 47.862], [9.3741, 47.862]]
    z = zellen_der_session(_spur(lauf), [{"type": "foiling", "i_start": 0, "i_end": 1}], verborgen=True)
    ix, _iy = _entpacken(z)
    nx, _ny = kachel(np.array([NEMO_LON]), np.array([NEMO_LAT]))
    assert abs(int(ix[0]) - int(nx[0])) < 50          # nicht mehr am Bodensee
    bx, _ = kachel(np.array([9.374]), np.array([47.862]))
    assert abs(int(ix[0]) - int(bx[0])) > 10_000
