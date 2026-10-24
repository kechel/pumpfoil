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


def test_wave_wellen_und_paddeln():
    from app.sportzahlen import berechnen
    segs = [{"t_start_ms": 0, "duration_s": 12, "distance_m": 80, "i_start": 0, "i_end": 12},
            {"t_start_ms": 100_000, "duration_s": 25, "distance_m": 150, "i_start": 100, "i_end": 125}]
    z = berechnen("welle", segs, _spur(200), 1200.0, 37.0, "surf_wave")
    assert z["wellen"] == {"anzahl": 2, "laengste_s": 25, "laengste_m": 150, "reiten_s": 37, "paddeln_s": 163}
    assert "fahrten" not in z


def test_downwind_a_nach_b():
    from app.sportzahlen import berechnen
    segs = [{"t_start_ms": 0, "duration_s": 100, "distance_m": 450, "i_start": 0, "i_end": 100}]
    z = berechnen("welle", segs, _spur(120), 720.0, 100.0, "surf_downwind")
    f = z["fahrten"][0]
    assert abs(f["ab_m"] - 600) <= 2 and abs(f["ab_kmh"] - 21.6) < 0.2   # gerade nach Norden, 6 m/s
    assert abs(f["foil_anteil"] - 0.75) < 0.01
    assert "wellen" not in z


def test_fahrten_efoil_aber_nicht_towed():
    from app.sportzahlen import berechnen
    segs = [{"t_start_ms": 0, "duration_s": 60, "distance_m": 360, "i_start": 0, "i_end": 60}]
    assert len(berechnen("motor", segs, _spur(100), 600.0, 60.0, "efoil")["fahrten"]) == 1
    assert "fahrten" not in berechnen("motor", segs, _spur(100), 600.0, 60.0, "towed")


def test_tempo_ohne_gps_zittern_im_stand():
    """#18978 (24.10.2026): stundenlang liegendes Handy summiert GPS-Zittern zu Kilometern; Schnitt nur aus Bewegung."""
    from app.sportzahlen import berechnen
    t = _spur(101, 5.0)                                         # 100 s mit 5 m/s
    c, v = t["geometry"]["coordinates"], t["properties"]["speeds_mps"]
    for i in range(3000):                                       # danach 3000 s Stand mit 8 m Zittern je Sekunde
        c.append([c[-1][0], c[-1][1] + (8 if i % 2 == 0 else -8) / 111320.0])
        v.append(0.3)
    z = berechnen("wind", [{"t_start_ms": 0, "duration_s": 100, "distance_m": 500, "i_start": 0, "i_end": 100}],
                  t, 24500.0, 100.0)
    assert z["fahrzeit_s"] == 101 and abs(z["tempo_kmh"] - 18.0) < 0.5
