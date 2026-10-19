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


def test_hoehe_vmg():
    """Synthetisch, Wind AUS Norden: 60 s auf Kurs 45° (am Wind), 60 s auf 180° (raum, vor dem Wind)."""
    import math
    from app.manoever import hoehe
    t, lat, lon = [], [], []
    x = y = 0.0
    v = 6.0   # m/s = 21,6 km/h
    def fahre(kurs, sek):
        nonlocal x, y
        for _ in range(sek):
            x += v * math.sin(math.radians(kurs)); y += v * math.cos(math.radians(kurs))
            t.append(len(t) * 1000); lat.append(47.0 + y / 111320.0); lon.append(9.0 + x / (111320.0 * math.cos(math.radians(47))))
    fahre(45, 60)
    fahre(180, 60)
    h = hoehe(t, lat, lon, lambda _t: 0.0)
    soll = 21.6 * math.cos(math.radians(45))            # 15,3 km/h VMG
    assert abs(h["vmg_max_kmh"] - soll) < 1.0
    assert abs(h["winkel_med"] - 45) <= 3
    assert 0.4 <= h["am_wind_anteil"] <= 0.6
    assert 200 <= h["hoehe_m"] <= 280                   # ~6 m/s * cos45 * 60 s = 255 m
    assert hoehe(t[:10], lat[:10], lon[:10], lambda _t: 0.0) is None


def test_manoever_durch_mit_doppler():
    """Feedback #202/#203: in der Kurve misst die geglaettete Spur zu niedrig. Mit Doppler-Tempo
    entscheidet das gemessene Tempo; ohne Doppler die Spur mit 10 km/h."""
    import math
    from app.manoever import erkennen
    t, lat, lon = [], [], []
    x = y = 0.0
    def fahre(kurs, sek, v=6.0):
        nonlocal x, y
        for _ in range(sek):
            x += v * math.sin(math.radians(kurs)); y += v * math.cos(math.radians(kurs))
            t.append(len(t) * 1000); lat.append(47.0 + y / 111320.0); lon.append(9.0 + x / (111320.0 * math.cos(math.radians(47))))
    fahre(90, 30)
    for k in range(90, 271, 30): fahre(k % 360, 1, v=3.0)   # enge Halse ueber Sued, Spur sehr langsam
    fahre(270, 30)
    wind = lambda _t: 0.0
    ohne = erkennen(t, lat, lon, wind)
    assert [m["typ"] for m in ohne] == ["halse"] and ohne[0]["durch"] is False
    mit = erkennen(t, lat, lon, wind, [4.0] * len(t))          # Doppler 14,4 km/h durchgehend
    assert mit[0]["durch"] is True
    langsam = erkennen(t, lat, lon, wind, [2.5] * len(t))      # Doppler 9 km/h -> abgesetzt
    assert langsam[0]["durch"] is False
