"""10K-Vorpruefung (app/zehnk.py) an kuenstlichen Spuren."""
from app.zehnk import pruefe

M_LAT = 1 / 111_195.0  # Grad je Meter Nord


def _lauf(t0, von_m, bis_m, schritt=5.0):
    """Lauf genau nach Norden von von_m nach bis_m, 5 m/s, ein Fix je Sekunde."""
    pts, t, d = [], t0, von_m
    richt = 1 if bis_m >= von_m else -1
    while (d - bis_m) * richt <= 0:
        pts.append([t, 47.0 + d * M_LAT, 9.0, 5.0, 0, 3.0])
        d += richt * schritt
        t += 1000
    seg = {"t_start_session_ms": pts[0][0], "t_end_session_ms": pts[-1][0], "distance_m": abs(bis_m - von_m)}
    return pts, seg


def _session(stuecke):
    gps, segs = [], []
    for p, s in stuecke:
        gps += p
        segs.append(s)
    return gps, segs


def test_raus_zurueck_und_steg_runden():
    st = [_lauf(0, 0, 2500), _lauf(600_000, 2500, 0)]
    t = 1_200_000
    for _ in range(6):  # 6 km am Steg: 500 m hin und zurueck (genau 10,0 km reicht nicht, 2 Fixes danach noetig)
        st.append(_lauf(t, 0, 500)); t += 200_000
        st.append(_lauf(t, 500, 0)); t += 200_000
    r = pruefe(*_session(st))
    assert r["status"] == "geschafft", r


def test_zu_wenig_strecke():
    r = pruefe(*_session([_lauf(0, 0, 2500), _lauf(600_000, 2500, 0)]))
    assert r["status"] == "fehlt" and not r["zurueck"]


def test_boot_zurueck_ist_fremdkraft():
    # raus 2,5 km, dann in 2 min (75 km/h... hier 2,5 km in 300 s = 30 km/h) ohne Lauf zurueck, dann 10 km Runden
    st = [_lauf(0, 0, 2500)]
    t = 800_000
    for _ in range(8):
        st.append(_lauf(t, 0, 500)); t += 200_000
        st.append(_lauf(t, 500, 0)); t += 200_000
    r = pruefe(*_session(st))
    assert r["status"] == "fremdkraft", r
    assert r["fremd"][0]["art"] == "versatz"


def test_schwimmen_zum_ufer_ist_keine_fremdkraft():
    # Sturz bei 1000 m, 400 m in 10 min zum naechsten Startpunkt geschwommen (2,4 km/h)
    st = [_lauf(0, 0, 1000), _lauf(1_000_000, 1400, 2500), _lauf(1_400_000, 2500, 0)]
    t = 2_000_000
    for _ in range(6):
        st.append(_lauf(t, 0, 500)); t += 200_000
        st.append(_lauf(t, 500, 0)); t += 200_000
    r = pruefe(*_session(st))
    assert r["fremd"] == [] and r["status"] == "geschafft", r


def test_einweg_zurueckpaddeln_und_kurzer_lauf_am_start():
    # 10,5 km in einem Lauf raus (bis 2,5 km Luftlinie und zurueck auf 2,5), dann 2,5 km langsam paddelnd zurueck
    # (3 km/h, unter der Versatz-Schwelle), kurzer Lauf am Start
    st = [_lauf(0, 0, 2500)]
    t = 600_000
    for _ in range(8):
        st.append(_lauf(t, 2500, 2000)); t += 200_000
        st.append(_lauf(t, 2000, 2500)); t += 200_000
    st.append(_lauf(t + 3_000_000, 0, 200))
    r = pruefe(*_session(st))
    assert r["status"] == "fremdkraft", r
    assert r["fremd"][-1]["art"] == "rueckweg_ohne_foil"


def test_viele_kurze_schwimmstrecken_auf_dem_rueckweg_erlaubt():
    # 3 km raus, zurueck in Laeufen mit je 130 m Schwimmen Richtung Start dazwischen (5 x 130 = 650 m: ueber 500 m,
    # aber unter 25 % von 3 km = 750 m -> erlaubt), danach Runden am Steg
    st = [_lauf(0, 0, 3000)]
    t, pos = 700_000, 3000
    for _ in range(5):
        st.append(_lauf(t, pos - 130, pos - 600)); t += 300_000
        pos -= 600
    for _ in range(6):
        st.append(_lauf(t, 0, 500)); t += 200_000
        st.append(_lauf(t, 500, 0)); t += 200_000
    r = pruefe(*_session(st))
    assert r["status"] == "geschafft", r
