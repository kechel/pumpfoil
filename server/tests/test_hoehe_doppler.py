"""Beste VMG aus dem Doppler (26.10.2026, Alex #18998): ein GPS-Sprung im Stand darf keine VMG ergeben."""
import math

from app.manoever import hoehe

M_LAT = 111320.0


def _spur(stuecke):
    """stuecke: (sekunden, kurs_grad, spur_kmh, doppler_kmh) -> t_ms, lat, lon, doppler_mps."""
    t_ms, lat, lon, dop = [], [], [], []
    x = y = 0.0
    t = 0
    m_lon = M_LAT * math.cos(math.radians(60.0))
    for dauer, kurs, spur, dopp in stuecke:
        for _ in range(dauer):
            x += spur / 3.6 * math.sin(math.radians(kurs))
            y += spur / 3.6 * math.cos(math.radians(kurs))
            t_ms.append(t * 1000.0)
            lat.append(60.0 + y / M_LAT)
            lon.append(25.0 + x / m_lon)
            dop.append(dopp / 3.6)
            t += 1
    return t_ms, lat, lon, dop


def test_gps_sprung_im_stand_ist_keine_vmg():
    # Wind aus Nord. 60 s Halbwind nach Ost, dann „springt" die Position 5 s mit 50 km/h nach Nord,
    # waehrend der Doppler 4 km/h sagt (Uhr steht), dann wieder Halbwind.
    t_ms, lat, lon, dop = _spur([(60, 90, 20, 20), (5, 0, 50, 4), (60, 90, 20, 20)])
    alt = hoehe(t_ms, lat, lon, lambda _t: 0.0)
    neu = hoehe(t_ms, lat, lon, lambda _t: 0.0, doppler_mps=dop)
    assert alt["vmg_max_kmh"] > 15          # Spur-Tempo: der Sprung wird zur VMG
    assert neu["vmg_max_kmh"] < 5           # Doppler: im Stand gibt es keine Hoehe


def test_echter_kurs_am_wind_bleibt():
    # 60 s mit 45 Grad zum Wind bei 24 km/h -> VMG ~17 km/h, Doppler und Spur einig.
    t_ms, lat, lon, dop = _spur([(60, 45, 24, 24), (60, 315, 24, 24)])
    h = hoehe(t_ms, lat, lon, lambda _t: 0.0, doppler_mps=dop)
    # Glaettung der Spur rundet die Kurve ab -> knapp ueber cos(45), nie Richtung volles Tempo.
    assert 15 < h["vmg_max_kmh"] < 19
