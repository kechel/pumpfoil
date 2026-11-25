"""Windsport traegt nur seinen Start zur Spot-Flaeche bei (25.11.2026, spots.WEIT_SPORTARTEN)."""
from __future__ import annotations

from app import spots as SP


def _punkt(lat, lon, dx_m=0.0, dy_m=0.0):
    import math
    return (lat + dy_m / 110540.0, lon + dx_m / (111320.0 * math.cos(math.radians(lat))))


LAT, LON = 46.35, 6.40


def _pump(sid, x):
    pts = [_punkt(LAT, LON, x + i * 10, 0) for i in range(20)]   # 200 m Pumpfoil-Strecke
    return SP.SessionGeom(sid=sid, points=pts, dist_m=200, start=pts[0])


def _wing(sid, start_x, ende_x):
    pts = [_punkt(LAT, LON, start_x + (ende_x - start_x) * i / 50, 0) for i in range(51)]
    return SP.SessionGeom(sid=sid, points=pts, dist_m=abs(ende_x - start_x), start=pts[0])


def _als_wind(g):
    return SP.SessionGeom(sid=g.sid, points=[g.start], dist_m=g.dist_m, start=g.start, radius=SP.WEIT_START_M)


def test_lange_wing_strecke_klebt_spots_nicht_mehr_zusammen():
    a, b = _pump(1, 0), _pump(2, 2500)          # zwei Pumpfoil-Stellen 2,3 km auseinander
    wing = _wing(3, 2550, -500)                  # startet bei B, faehrt ueber A hinaus
    # Mit der ganzen Strecke wuerde die Wing-Session beide Spots beruehren; mit nur dem Start gehoert sie zu B.
    teile, zu = SP.build_spots([a, b, _als_wind(wing)])
    assert len(teile) == 2
    assert zu[3] == zu[2] != zu[1]


def test_wing_start_weit_weg_bekommt_eigenen_spot():
    a = _pump(1, 0)
    wing = _als_wind(_wing(2, 1200, 0))          # Start 1,2 km neben A, Strecke bis A
    teile, zu = SP.build_spots([a, wing])
    assert len(teile) == 2 and zu[1] != zu[2]


def test_wing_am_selben_strand_bleibt_beim_spot():
    a = _pump(1, 0)
    wing = _als_wind(_wing(2, 100, 5000))        # startet mitten im Pumpfoil-Spot, faehrt 5 km raus
    teile, zu = SP.build_spots([a, wing])
    assert len(teile) == 1 and zu[1] == zu[2]


def test_session_geom_nimmt_bei_windsport_nur_den_start(monkeypatch):
    class AR:
        segments_json = '[{"i_start": 0, "i_end": 3}]'
        foiling_distance_m = 3000.0

    class Q:
        def filter_by(self, **k): return self
        def first(self): return AR()

    class DB:
        def query(self, *_): return Q()

    class Sess:
        id = 7; session_uuid = "u"; sport_class = "wingfoil"

    monkeypatch.setattr("app.storage.load_gps", lambda uuid: [[0, LAT, LON], [1, LAT, LON + .01], [2, LAT, LON + .02], [3, LAT, LON + .03]])
    g = SP._session_geom(DB(), Sess())
    assert g.points == [(LAT, LON)] and g.radius == SP.WEIT_START_M
    Sess.sport_class = "pumpfoil"
    g = SP._session_geom(DB(), Sess())
    assert len(g.points) == 4 and g.radius == SP._BUF
