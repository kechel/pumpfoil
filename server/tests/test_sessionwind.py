"""Wind am Spot (19.10.2026): Mittelwerte, Cache, „Ort verbergen" — ohne echten Netzabruf."""
from datetime import datetime, timezone


def test_mittel_richtung_ueber_null():
    from app.sessionwind import _mittel
    m = _mittel([{"t": "a", "kmh": 10, "richtung": 350, "boeen_kmh": 20},
                 {"t": "b", "kmh": 20, "richtung": 10, "boeen_kmh": None}])
    assert m["richtung"] in (0, 360 % 360) and m["kmh_min"] == 10 and m["kmh_max"] == 20
    assert m["boeen_max_kmh"] == 20


def test_cache_je_spot_und_tag(monkeypatch, tmp_path):
    """Seit 19.10.2026: ein Abruf je Spot und UTC-Tag; zwei Sessions am selben Spot/Tag teilen ihn."""
    from types import SimpleNamespace
    from app import sessionwind
    monkeypatch.setattr(sessionwind, "get_settings", lambda: SimpleNamespace(data_dir=tmp_path))
    aufrufe = []
    def fake_get(url, params=None, **k):
        aufrufe.append(params)
        zeiten = [f"{params['start_date']}T{h:02d}:00" for h in range(24)]
        return SimpleNamespace(status_code=200, json=lambda: {"hourly": {
            "time": zeiten, "wind_speed_10m": [12.0] * 24, "wind_direction_10m": [70] * 24,
            "wind_gusts_10m": [25.0] * 24}})
    monkeypatch.setattr(sessionwind.httpx, "get", fake_get)
    t1 = datetime(2026, 10, 18, 11, 10, tzinfo=timezone.utc)
    t2 = datetime(2026, 10, 18, 15, 0, tzinfo=timezone.utc)
    assert sessionwind.session_wind(1, None, 3.8, t1, t1) is None
    a = sessionwind.session_wind(1, 51.701, 3.8, t1, t1)
    b = sessionwind.session_wind(2, 51.699, 3.802, t2, t2)      # anderer Session, selber Spot (gerundet) + Tag
    assert a["mittel"]["richtung"] == 70 and len(a["stunden"]) == 2 and len(b["stunden"]) == 2
    assert len(aufrufe) == 1                                      # nur EIN Abruf fuer beide
    assert (tmp_path / "wind" / "tage" / "51.70_3.80_2026-10-18.json").exists()


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


def test_tag_teilweise_gespeichert_wird_ergaenzt(monkeypatch, tmp_path):
    """Gespeichert wird sofort, was da ist; fehlt einer Session eine Stunde, wird der Tag ergaenzt."""
    import json as _json
    from types import SimpleNamespace
    from app import sessionwind
    monkeypatch.setattr(sessionwind, "get_settings", lambda: SimpleNamespace(data_dir=tmp_path))
    aufrufe = []
    def fake_get(url, params=None, **k):
        aufrufe.append(1)
        zeiten = [f"{params['start_date']}T{h:02d}:00" for h in range(24)]
        return SimpleNamespace(status_code=200, json=lambda: {"hourly": {
            "time": zeiten, "wind_speed_10m": [12.0] * 24, "wind_direction_10m": [70] * 24,
            "wind_gusts_10m": [25.0] * 24}})
    monkeypatch.setattr(sessionwind.httpx, "get", fake_get)
    pfad = sessionwind._tag_pfad(51.7, 3.8, datetime(2026, 10, 18).date())
    pfad.write_text(_json.dumps([{"t": f"2026-10-18T{h:02d}:00:00+00:00", "kmh": 9.0, "richtung": 60, "boeen_kmh": None}
                                 for h in (10, 11, 12)]))
    frueh = datetime(2026, 10, 18, 11, 10, tzinfo=timezone.utc)
    a = sessionwind.session_wind(1, 51.7, 3.8, frueh, frueh)          # 11 + 12 Uhr liegen vor
    assert len(aufrufe) == 0 and a["stunden"][0]["kmh"] == 9.0
    spaet = datetime(2026, 10, 18, 15, 0, tzinfo=timezone.utc)
    b = sessionwind.session_wind(2, 51.7, 3.8, spaet, spaet)          # 15/16 Uhr fehlen -> ergaenzen
    assert len(aufrufe) == 1 and len(b["stunden"]) == 2
    assert len(_json.loads(pfad.read_text())) == 24                     # Datei jetzt vollstaendig


def test_vorhersage_als_erster_wert_und_rueckfall(monkeypatch, tmp_path):
    """Kommende Stunden kommen als Vorhersage mit; spaeter ersetzt der echte Wert sie. Ist Open-Meteo
    weg, bleibt die Vorhersage stehen (markiert)."""
    from types import SimpleNamespace
    from app import sessionwind
    monkeypatch.setattr(sessionwind, "get_settings", lambda: SimpleNamespace(data_dir=tmp_path))
    jetzt = {"t": datetime(2026, 10, 18, 14, 30, tzinfo=timezone.utc)}
    class Uhr(datetime):
        @classmethod
        def now(cls, tz=None):
            return jetzt["t"]
    monkeypatch.setattr(sessionwind, "datetime", Uhr)
    zustand = {"weg": False, "kmh": 12.0, "n": 0}
    def fake_get(url, params=None, **k):
        zustand["n"] += 1
        if zustand["weg"]:
            raise RuntimeError("nicht erreichbar")
        zeiten = [f"{params['start_date']}T{h:02d}:00" for h in range(24)]
        return SimpleNamespace(status_code=200, json=lambda: {"hourly": {
            "time": zeiten, "wind_speed_10m": [zustand["kmh"]] * 24, "wind_direction_10m": [70] * 24,
            "wind_gusts_10m": [25.0] * 24}})
    monkeypatch.setattr(sessionwind.httpx, "get", fake_get)
    frueh = datetime(2026, 10, 18, 13, 10, tzinfo=timezone.utc)
    a = sessionwind.session_wind(1, 51.7, 3.8, frueh, frueh)
    assert "vorhersage" not in a and zustand["n"] == 1
    spaeter = datetime(2026, 10, 18, 16, 10, tzinfo=timezone.utc)   # liegt noch in der Zukunft
    b = sessionwind.session_wind(2, 51.7, 3.8, spaeter, spaeter)
    assert b["vorhersage"] is True and zustand["n"] == 1             # erste Analyse aus der Vorhersage
    jetzt["t"] = datetime(2026, 10, 18, 18, 30, tzinfo=timezone.utc)
    zustand["weg"] = True
    c = sessionwind.session_wind(2, 51.7, 3.8, spaeter, spaeter)
    assert c["vorhersage"] is True and zustand["n"] == 3             # beide Schnittstellen versucht, Rueckfall Vorhersage
    zustand["weg"] = False; zustand["kmh"] = 15.0
    d = sessionwind.session_wind(2, 51.7, 3.8, spaeter, spaeter)
    assert "vorhersage" not in d and d["stunden"][0]["kmh"] == 15.0  # echter Wert ersetzt Vorhersage


def test_windfenster_ohne_sessions(client):
    r = client.post("/api/auth/register", json={"email": "windfenster@x.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    d = client.get("/api/community/spot/999999/windfenster", headers=auth).json()
    assert d["sessions"] == 0 and len(d["sektoren"]) == 8 and d["kmh_p25"] is None
