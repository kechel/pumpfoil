"""Zusatzzahlen je Sportart (19.10.2026): Fahrten mit 5-min-Pause, Fahrzeit, Tempo, On-Foil-Anteil."""


def _spur(n, v=6.0):
    # n Punkte im 1-Hz-Takt, je v m/s nach Norden
    return {"geometry": {"coordinates": [[9.0, 47.0 + i * v / 111320.0] for i in range(n)]},
            "properties": {"speeds_mps": [v] * n}}


def test_fahrten_pause_5min():
    from app.sportzahlen import berechnen
    segs = [
        {"t_start_ms": 0, "duration_s": 60, "distance_m": 360, "i_start": 0, "i_end": 60},
        {"t_start_ms": 120_000, "duration_s": 60, "distance_m": 360, "i_start": 120, "i_end": 180},   # 60 s Pause
        {"t_start_ms": 600_000, "duration_s": 60, "distance_m": 360, "i_start": 600, "i_end": 660},   # 420 s Pause
    ]
    z = berechnen("wind", segs, _spur(700), 4200.0, 180.0)
    assert [f["laeufe"] for f in z["fahrten"]] == [2, 1]
    assert z["fahrten"][0]["dauer_s"] == 180 and z["fahrten"][0]["foil_m"] == 720
    assert z["fahrzeit_s"] == 700 and z["tempo_kmh"] == round(4200 / 700 * 3.6, 1)
    assert z["foil_anteil"] == round(180 / 700, 3)


def test_nicht_fuer_pumpfoil_und_motor_ohne_fahrten():
    from app.sportzahlen import berechnen
    segs = [{"t_start_ms": 0, "duration_s": 60, "distance_m": 360, "i_start": 0, "i_end": 60}]
    assert berechnen("pump", segs, _spur(100), 600.0, 60.0) is None
    m = berechnen("motor", segs, _spur(100), 600.0, 60.0)
    assert "fahrten" not in m and m["fahrzeit_s"] == 100
