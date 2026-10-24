"""Plausibilitaet der ausgelieferten Session-Zahlen (24.10.2026, Jan nach #18978/#18983: „mach doch mal ein paar
plausibilitaets-tests fuer solche werte"). Regeln in app/plausibel.py; hier (1) die Regeln selbst, (2) Sessions mit
den Fallen aus dem Bestand ueber die echte API: stundenlanges GPS-Zittern im Stand (#18978) und eine Spur, die nicht
1 Hz ist (#18983, Garmin „Speicher sparen")."""
import json
import math
import uuid as _uuid

import pytest

from app import plausibel


def test_regeln_finden_den_fall_18978():
    a = {"max_speed_mps": 6.74, "segments": [{"duration_s": 23, "distance_m": 110.6, "avg_speed_mps": 5.58,
                                              "max_speed_mps": 6.74}],
         "sport_zahlen": {"tempo_kmh": 43.6, "fahrzeit_s": 1698, "foil_anteil": 0.02},
         "track_geojson": {"properties": {"speeds_mps": [0.2, 6.74, 3.0]}}}
    f = plausibel.pruefen(a)
    assert len(f) == 1 and "Tempo Fahrt 43.6" in f[0]
    a["sport_zahlen"]["tempo_kmh"] = 8.4
    assert plausibel.pruefen(a) == []


@pytest.mark.parametrize("aendern, teil", [
    (lambda a: a.update(foiling_distance_m=900.0), "Foil-Strecke"),
    (lambda a: a["segments"][0].update(avg_speed_mps=7.5), "Schnitt"),
    (lambda a: a["segments"][0].update(distance_m=600.0), "Strecke/Dauer"),
    (lambda a: a["segments"][0].update(avg_pump_hz=6.0), "Kadenz"),
    (lambda a: a["sport_zahlen"].update(foil_anteil=1.4), "On-Foil-Anteil"),
    (lambda a: a.update(avg_cadence_hz=-1.0), "Kadenz"),
])
def test_jede_regel_schlaegt_an(aendern, teil):
    a = {"total_distance_m": 800.0, "foiling_distance_m": 600.0, "foiling_time_s": 120.0, "max_speed_mps": 6.0,
         "avg_cadence_hz": 1.5,
         "segments": [{"duration_s": 60, "distance_m": 300.0, "avg_speed_mps": 5.0, "max_speed_mps": 6.0,
                       "avg_pump_hz": 1.5, "pumps": 90}],
         "sport_zahlen": {"tempo_kmh": 18.0, "foil_anteil": 0.5}}
    assert plausibel.pruefen(a) == []
    aendern(a)
    assert any(teil in x for x in plausibel.pruefen(a))


def _wind_gps():
    """300 s Fahrt mit 6 m/s, 2 h Stand mit 8 m GPS-Zittern je Sekunde (#18978), dann wieder 300 s Fahrt — die
    beginnt mit einer Beschleunigung ueber 6 s (ein Sprung von 0,3 auf 6 m/s loest die Despike-Kaskade aus, s. unten)."""
    out, t, lat = [], 0, 47.86
    for _ in range(300):
        out.append([t, lat, 9.38, 6.0, 0, 5.0]); t += 1000; lat += 6.0 / 111320.0
    for i in range(7200):
        out.append([t, lat + (8 if i % 2 else -8) / 111320.0, 9.38, 0.3, 0, 5.0]); t += 1000
    for k in range(300):
        v = min(6.0, 0.3 + k)
        out.append([t, lat, 9.38, v, 0, 5.0]); t += 1000; lat += v / 111320.0
    return out


@pytest.fixture(scope="module")
def wind_session(client):
    mail = f"plaus-{_uuid.uuid4().hex[:8]}@test.de"
    jwt = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {jwt}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    uid = f"plaus-{_uuid.uuid4().hex[:8]}"
    gps = _wind_gps()
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": uid, "started_at": "2026-10-20T09:00:00Z",
                                                         "sport": "pumpfoil", "accel_hz": 25, "accel_scale": 1000})
    chunks = [{"index": k, "kind": "gps", "encoding": "json", "t0_ms": gps[i][0], "count": len(gps[i:i + 600]),
               "data": gps[i:i + 600]} for k, i in enumerate(range(0, len(gps), 600))]
    r = client.post(f"/api/ingest/session/{uid}/chunks", headers=dev, json={"chunks": chunks})
    assert r.status_code == 200, r.text
    sid = client.post(f"/api/ingest/session/{uid}/complete", headers=dev,
                      json={"ended_at": "2026-10-20T11:20:00Z", "total_chunks": len(chunks)}).json()["session_id"]
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    s = db.get(models.Session, sid)
    s.sport_class = "wingfoil"
    db.commit(); db.close()
    return sid, auth


def test_wind_session_plausibel_ueber_die_api(client, wind_session):
    sid, auth = wind_session
    a = client.get(f"/api/sessions/{sid}", headers=auth).json()["analysis"]
    assert a and a.get("sport_zahlen"), a and list(a)
    assert plausibel.pruefen(a) == []
    sz = a["sport_zahlen"]
    # bewegt: 2 x 300 s mit 6 m/s = 21,6 km/h; das Zittern im Stand (2 h, ~115 km Positionsweg) zaehlt nicht
    assert 570 <= sz["fahrzeit_s"] <= 610, sz
    assert abs(sz["tempo_kmh"] - 21.6) < 1.5, sz


def test_spur_mit_luecken_zaehlt_echte_sekunden():
    """#18983 (Garmin „Speicher sparen"): ein Punkt alle 5 s. Ohne Zeiten waeren 120 Punkte 120 s -> 5-facher
    Schnitt; mit Zeiten 600 s. Schritte ueber LUECKE_S (Pause, Dropout) zaehlen gar nicht."""
    from app.sportzahlen import berechnen
    c, v, t = [], [], []
    for i in range(121):
        c.append([9.0, 47.0 + i * 30.0 / 111320.0]); v.append(6.0); t.append(i * 5000.0)
    c.append([9.0, c[-1][1] + 300.0 / 111320.0]); v.append(6.0); t.append(t[-1] + 60000.0)   # 60-s-Luecke
    spur = {"geometry": {"coordinates": c}, "properties": {"speeds_mps": v}}
    z = berechnen("wind", [], spur, 3900.0, 0.0, zeiten_ms=t)
    assert z["fahrzeit_s"] == 600 and abs(z["tempo_kmh"] - 21.6) < 0.2
    assert plausibel.pruefen({"max_speed_mps": 6.0, "sport_zahlen": z,
                              "track_geojson": spur}) == []
    ohne = berechnen("wind", [], spur, 3900.0, 0.0)
    assert ohne["tempo_kmh"] > 100      # so sah der Fehler aus


@pytest.mark.xfail(strict=True, reason="Befund 24.10.2026: Despike-Kaskade in gps.clean_speed_series (Regel 3 vergleicht "
                   "mit dem schon bereinigten linken Nachbarn) — Fix wartet auf Jans OK (Erkennung)")
def test_despike_loescht_keinen_gehaltenen_abschnitt():
    """Springt das Tempo in einem Schritt um > 4 m/s auf > 20 km/h (nach einer GPS-Luecke, Uhr unter Wasser) und
    bleibt dort, darf der Glitch-Filter nur Einzel-Ausreisser glaetten, nicht den ganzen schnellen Abschnitt."""
    import numpy as np
    from app.analysis import gps as G
    sp = np.array([0.3] * 60 + [7.0] * 120 + [0.3] * 60)
    assert float(np.median(G.clean_speed_series(sp, 1)[70:170])) > 6.5
