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


def test_startzellen_erster_punkt_je_lauf():
    from app.heatmap import _entpacken, kachel, startzellen_der_session
    a = [[9.374 + i * 0.0001, 47.862] for i in range(5)]       # Lauf 1 beginnt am Steg
    b = [[9.380 + i * 0.0001, 47.865] for i in range(5)]       # Lauf 2 woanders
    segs = [{"type": "foiling", "i_start": 0, "i_end": 4}, {"type": "idle", "i_start": 5, "i_end": 5},
            {"type": "foiling", "i_start": 6, "i_end": 10}]
    z = startzellen_der_session(_spur(a + [[9.5, 47.9]] + b), json.dumps(segs), verborgen=False)
    ix, iy = _entpacken(z)
    erwartet = {tuple(int(v) for v in np.concatenate(kachel(np.array([p[0]]), np.array([p[1]]))))
                for p in (a[0], b[0])}
    assert {(int(x), int(y)) for x, y in zip(ix, iy)} == erwartet


def test_start_schwelle_zwei_laeufe(monkeypatch, tmp_path):
    """Startzellen erscheinen erst ab START_MIN_LAEUFE Laeufen — auch aus EINER Session."""
    import numpy as np
    from app import heatmap as H
    zwei_in_einer = H._zellen([[9.374, 47.862], [9.374, 47.862]], eindeutig=False)
    einzeln = H._zellen([[9.39, 47.85]], eindeutig=False)
    assert len(zwei_in_einer) == 2 and len(einzeln) == 1
    alle = np.concatenate([zwei_in_einer, einzeln])
    kr, nr = np.unique(alle, return_counts=True)
    assert set(kr[nr >= H.START_MIN_LAEUFE]) == set(np.unique(zwei_in_einer))


def test_startpositionen_buendel_und_schwellen(monkeypatch):
    """Starts naeher als 25 m bilden eine Position; sie zaehlt ab min_starts UND 2 Sessions."""
    import numpy as np
    from app import heatmap as H
    steg, insel = [9.3794, 47.8628], [9.3778, 47.8621]          # ~130 m auseinander
    def starts(*pts):
        return H._zellen([list(p) for p in pts], eindeutig=False)
    cache = {
        1: ("fp", None, None, starts(steg, steg, [9.37942, 47.86282])),
        2: ("fp", None, None, starts(steg, insel)),
        3: ("fp", None, None, starts(insel, insel)),
        4: ("fp", None, None, starts([9.3810, 47.8610]) ),   # einmalig weit weg
    }
    monkeypatch.setattr(H, "_zellen_cache", lambda: cache)
    r = H.startpositionen([1, 2, 3, 4], 47.8628, 9.3794, min_starts=3)
    assert [(p["starts"], p["sessions"]) for p in r] == [(4, 2), (3, 2)]
    assert abs(r[0]["lat"] - 47.8628) < 0.0002
    # nur aus EINER Session -> keine verlaessliche Position, auch bei vielen Starts
    cache[5] = ("fp", None, None, starts(*([[9.3830, 47.8600]] * 6)))
    assert len(H.startpositionen([1, 2, 3, 5], 47.8628, 9.3794, min_starts=3)) == 2


def test_startpositionen_fahrer(monkeypatch):
    from app import heatmap as H
    steg = [9.3794, 47.8628]
    z = lambda n: H._zellen([steg] * n, eindeutig=False)
    cache = {1: ("fp", None, None, z(3)), 2: ("fp", None, None, z(2)), 3: ("fp", None, None, z(1))}
    monkeypatch.setattr(H, "_zellen_cache", lambda: cache)
    von = {1: 10, 2: 10, 3: 11}                     # zwei Sessions desselben Fahrers + ein anderer
    r = H.startpositionen([1, 2, 3], 47.8628, 9.3794, min_starts=2, fahrer_von=von)
    assert r[0]["fahrer"] == 2 and r[0]["sessions"] == 3
    assert H.startpositionen([1, 2, 3], 47.8628, 9.3794, min_starts=2, min_fahrer=3, fahrer_von=von) == []
