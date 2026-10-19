"""Wind am Spot (19.10.2026): Mittelwerte, Cache, „Ort verbergen" — ohne echten Netzabruf."""
from datetime import datetime, timezone


def test_mittel_richtung_ueber_null():
    from app.sessionwind import _mittel
    m = _mittel([{"t": "a", "kmh": 10, "richtung": 350, "boeen_kmh": 20},
                 {"t": "b", "kmh": 20, "richtung": 10, "boeen_kmh": None}])
    assert m["richtung"] in (0, 360 % 360) and m["kmh_min"] == 10 and m["kmh_max"] == 20
    assert m["boeen_max_kmh"] == 20


def test_cache_und_ohne_ort(monkeypatch, tmp_path):
    from app import sessionwind
    monkeypatch.setattr(sessionwind, "_cache_pfad", lambda sid: tmp_path / f"{sid}.json")
    aufrufe = []
    def fake(lat, lon, start, ende):
        aufrufe.append(1)
        return [{"t": "2026-10-18T11:00:00+00:00", "kmh": 12.0, "richtung": 70, "boeen_kmh": 25.0}]
    monkeypatch.setattr(sessionwind, "_abrufen", fake)
    t = datetime(2026, 10, 18, 11, 10, tzinfo=timezone.utc)
    assert sessionwind.session_wind(1, None, 3.8, t, t) is None
    a = sessionwind.session_wind(1, 51.7, 3.8, t, t)
    b = sessionwind.session_wind(1, 51.7, 3.8, t, t)
    assert a == b and a["mittel"]["richtung"] == 70 and len(aufrufe) == 1   # zweiter Aufruf aus dem Cache
