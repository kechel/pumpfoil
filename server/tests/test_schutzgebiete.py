"""Schutzgebiete aus OSM: welche Arten gezeigt werden und wie Multipolygone zu Ringen werden."""
from app.schutzgebiete import _flaechen, _ringe, art_von


def test_arten():
    assert art_von({"leisure": "nature_reserve", "protection_title": "Naturschutzgebiet"}) == "nsg"
    assert art_von({"boundary": "protected_area", "protect_class": "97", "protection_title": "Fauna-Flora-Habitat"}) == "ffh"
    assert art_von({"boundary": "protected_area", "protect_class": "97", "protection_title": "Vogelschutzgebiet"}) is None
    assert art_von({"boundary": "protected_area", "protect_class": "5", "protection_title": "Landschaftsschutzgebiet"}) is None
    assert art_von({"natural": "water", "swimming": "no"}) == "verbot"
    assert art_von({"natural": "water", "boat": "no"}) == "verbot"


def test_ringe_aus_stuecken():
    a, b, c = [[0, 0], [0, 1]], [[1, 1], [0, 1]], [[1, 1], [0, 0]]      # verdreht und verteilt
    r = _ringe([a, b, c])
    assert len(r) == 1 and r[0][0] == r[0][-1] and len(r[0]) == 4


def test_flaechen_aus_overpass():
    antwort = {"elements": [
        {"type": "way", "id": 1, "tags": {"leisure": "nature_reserve", "name": "See"},
         "geometry": [{"lat": 0, "lon": 0}, {"lat": 0, "lon": 1}, {"lat": 1, "lon": 1}, {"lat": 0, "lon": 0}]},
        {"type": "relation", "id": 2, "tags": {"boundary": "protected_area", "protect_class": "97", "name": "Ried"},
         "members": [{"type": "way", "role": "outer", "geometry": [{"lat": 0, "lon": 0}, {"lat": 0, "lon": 2}]},
                     {"type": "way", "role": "outer", "geometry": [{"lat": 0, "lon": 2}, {"lat": 2, "lon": 2}, {"lat": 0, "lon": 0}]}]},
        {"type": "way", "id": 3, "tags": {"boundary": "protected_area", "protection_title": "Vogelschutzgebiet"},
         "geometry": [{"lat": 0, "lon": 0}, {"lat": 0, "lon": 1}, {"lat": 1, "lon": 1}, {"lat": 0, "lon": 0}]},
    ]}
    f = {x["id"]: x for x in _flaechen(antwort)}
    assert set(f) == {"w1", "r2"} and f["w1"]["art"] == "nsg" and f["r2"]["art"] == "ffh"
    assert len(f["r2"]["aussen"]) == 1 and f["r2"]["aussen"][0][0] == f["r2"]["aussen"][0][-1]
