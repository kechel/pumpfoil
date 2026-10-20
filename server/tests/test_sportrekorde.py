"""Rekorde je Sportart (app/sportrekorde.py, 20.10.2026)."""
from app import manoever, sportrekorde


def _bestes(metrik_key, je_session):
    m = next(x for xs in sportrekorde.JE_SPORT.values() for x in xs if x.key == metrik_key)
    merk = {(m.cache, sid): e for sid, e in je_session.items()}
    b = sportrekorde.bestes(None, m, [(sid,) for sid in je_session], merk)
    return None if b is None else (b[0][0], b[1][0])


def _z(halse_durch, halse_ab, wende_durch=0, wende_ab=0):
    return {"zahlen": {"halse": {"durch": halse_durch, "ab": halse_ab}, "wende": {"durch": wende_durch, "ab": wende_ab}}}


def test_quote_erst_ab_mindestzahl_und_gleichstand_nach_anzahl():
    # 5/5 = 100 % zaehlt nicht (unter 20 Halsen); 30/30 und 40/40 sind beide 100 % -> mehr Halsen gewinnt
    w = _bestes("jibe_quote", {1: _z(5, 0), 2: _z(30, 0), 3: _z(40, 0), 4: _z(45, 5)})
    assert w == (1.0, 3)
    assert _bestes("jibe_quote", {1: _z(5, 0)}) is None
    assert _bestes("tack_quote", {1: _z(0, 0, 9, 0), 2: _z(0, 0, 10, 2)}) == (10 / 12, 2)


def test_paddle_up_quote_und_anzahl():
    v = lambda erg: {"ergebnis": erg, "foil_s": 30.0 if erg == "foil" else None}  # noqa: E731
    a = {"auf_foil": 3, "versuche": [v("foil")] * 3 + [v("nein")] * 7}         # 30 %, 3 Erfolge
    b = {"auf_foil": 2, "versuche": [v("foil")] * 2 + [v("nein")] * 2}         # 50 %, aber nur 4 Versuche
    assert _bestes("paddle_quote", {1: a, 2: b}) == (0.3, 1)
    assert _bestes("paddle_success", {1: a, 2: b}) == (3.0, 1)
    assert _bestes("paddle_foil_longest", {1: a}) == (30.0, 1)


def test_downwind_tempo_erst_ab_2_km():
    e1 = {"fahrten": [{"ab_m": 1500, "ab_kmh": 30.0}]}
    e2 = {"fahrten": [{"ab_m": 5000, "ab_kmh": 18.0}]}
    assert _bestes("dw_ab_speed", {1: e1, 2: e2}) == (18.0, 2)
    assert _bestes("dw_ab", {1: e1, 2: e2}) == (5000.0, 2)


def test_gps_sprung_zaehlt_nicht_als_tempo():
    # 40 Punkte mit 1 Hz, 5 m/s nach Norden; Punkt 20 springt 2 km weg
    t = [i * 1000 for i in range(40)]
    lat = [47.0 + i * 5 / 111320 for i in range(40)]
    lat[20] += 2000 / 111320
    lon = [8.0] * 40
    _t, _k, tempo = manoever._kurs_tempo(t, lat, lon)
    import numpy as np
    assert np.nanmax(tempo) <= manoever.MAX_TEMPO_KMH


def test_endpunkte(client):
    r = client.post("/api/auth/register", json={"email": "sportrek@x.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/sessions/sport-rekorde", headers=auth).json() == {"sportarten": []}
    rec = client.get("/api/community/records?sport=wingfoil&period=all&accel_only=false", headers=auth).json()["all"]
    for k in ("jibe_quote", "tack_quote", "vmg_best", "upwind_m", "jibes_foil", "ride_longest", "ride_farthest"):
        assert k in rec and rec[k]["session_id"] is None
    rec = client.get("/api/community/records?sport=pumpfoil&period=all", headers=auth).json()["all"]
    assert "jibe_quote" not in rec   # Pumpfoil bleibt wie es war
    sp = client.get("/api/community/spot-records?spot=x&sport=sup_paddle", headers=auth).json()
    assert "paddle_quote" in sp
