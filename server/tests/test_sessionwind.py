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


def test_manoever_wende_und_halse():
    """Synthetisch: Ost-West-Schlaege bei Nordwind. Drehung ueber Nord = Wende, ueber Sued = Halse."""
    import math
    from app.manoever import erkennen
    t, lat, lon = [], [], []
    x = y = 0.0
    v = 6.0   # m/s ~ 21.6 km/h
    def fahre(kurs, sek):
        nonlocal x, y
        for _ in range(sek):
            x += v * math.sin(math.radians(kurs)); y += v * math.cos(math.radians(kurs))
            t.append(len(t) * 1000); lat.append(47.0 + y / 111320.0); lon.append(9.0 + x / (111320.0 * math.cos(math.radians(47))))
    fahre(90, 30)
    for k in range(90, -91, -30): fahre(k % 360, 1)    # links herum ueber Nord (Bug durch den Wind)
    fahre(270, 30)
    for k in range(270, 450, 30): fahre(k % 360, 1)    # rechts herum ueber Nord -> Wende
    fahre(90, 30)
    for k in range(90, 271, 30): fahre(k % 360, 1)     # rechts herum ueber Sued (Heck durch den Wind)
    fahre(270, 30)
    m = erkennen(t, lat, lon, lambda _t: 0.0)          # Wind AUS Norden
    assert [x["typ"] for x in m] == ["wende", "wende", "halse"]
    assert all(x["durch"] for x in m)
