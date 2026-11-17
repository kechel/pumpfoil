"""Event-Wertung je Lauf (app/event_laeufe.py, Jan 16.11.2026): Startzeit des Laufs entscheidet, Duplikate einmal."""
from datetime import datetime, timedelta, timezone

from app import event_laeufe as EL

T0 = datetime(2026, 11, 14, 10, 0, tzinfo=timezone.utc)
FENSTER = (datetime(2026, 11, 14, 5, 0, tzinfo=timezone.utc), datetime(2026, 11, 14, 15, 0, tzinfo=timezone.utc))


def _lauf(start_s, dauer_s, m=100.0):
    return {"t_start_session_ms": start_s * 1000, "t_end_session_ms": (start_s + dauer_s) * 1000,
            "distance_m": m, "duration_s": dauer_s, "pumps": 10}


def _s(sid, start, laeufe, uid=1, det="model", hz=25):
    return {"id": sid, "user_id": uid, "started_at": start, "segments_json": laeufe, "detection": det, "accel_hz": hz}


def test_startzeit_des_laufs_entscheidet():
    # Session beginnt VOR dem Fenster: Lauf im Fenster zaehlt; Session im Fenster, Lauf beginnt NACH dem Schluss: zaehlt nicht;
    # Lauf beginnt vor dem Schluss und endet danach: zaehlt vollstaendig.
    vor = _s(1, FENSTER[0] - timedelta(minutes=30), [_lauf(60, 30), _lauf(40 * 60, 30)])
    spaet = _s(2, FENSTER[1] - timedelta(minutes=5), [_lauf(60, 600), _lauf(10 * 60, 30)])
    z = EL.zaehlende([vor, spaet], FENSTER)
    assert z == {1: [1], 2: [0]}
    w = EL.werte("sum_time", [vor, spaet], z, False)
    assert w[1]["value"] == 630


def test_duplikat_zaehlt_einmal_bessere_datenlage():
    uhr = _s(1, T0, [_lauf(100, 60, 300.0)], det="gps_only", hz=0)
    handy = _s(2, T0 + timedelta(seconds=3), [_lauf(98, 61, 280.0)], det="model", hz=50)
    z = EL.zaehlende([uhr, handy], FENSTER)
    assert z == {2: [0]}                                     # nicht der laengere Wert, sondern die bessere Aufnahme
    assert EL.werte("sum_distance", [uhr, handy], z, False)[1]["value"] == 280.0


def test_sprint_aus_zaehlendem_lauf():
    import json
    s = _s(1, FENSTER[1] - timedelta(minutes=2), [_lauf(10, 30), _lauf(200, 30)])
    s["sprint_json"] = json.dumps({"laeufe": [{"sprint_100m": 5.0}, {"sprint_100m": 7.0}]})
    z = EL.zaehlende([s], FENSTER)
    w = EL.werte("sprint_100m", [s], z, False)
    assert w[1]["value"] == 5.0 and w[1]["run_idx"] == 0     # der schnellere Lauf begann nach dem Schluss


def test_sprint_fenster_je_lauf():
    """sprint-VERSION 5: je Lauf die Fenster je Kennzahl (Event-Kategorie in der Session)."""
    from app.analysis import sprint as SP
    lat, out, t = 50.0, [], 0
    for v in [5.0] * 90:
        out.append([t, lat, 7.0, v, None, 4]); lat += v / 111320.0; t += 1000
    erg = SP.session_sprints(out, [{"t_start_session_ms": 0, "t_end_session_ms": 89_000}])
    assert erg["v"] >= 5 and erg["laeufe_fenster"][0]["sprint_100m"] == erg["fenster"]["sprint_100m"]


def test_alte_auswertung_ohne_session_ms_mit_zuschnitt():
    """gps-mvp-Laeufe kennen nur t_start_ms ab dem Zuschnitt -> + trim_start_ms (wie sprint.py)."""
    s = {"id": 1, "user_id": 1, "started_at": FENSTER[1] - timedelta(minutes=15), "detection": "gps_only", "accel_hz": 0,
         "trim": 10 * 60 * 1000, "segments_json": [{"t_start_ms": 6 * 60 * 1000, "t_end_ms": 6 * 60 * 1000 + 30000,
                                                    "distance_m": 100, "duration_s": 30}]}
    assert EL.zaehlende([s], FENSTER) == {}          # 15 min vor Schluss + 10 min Zuschnitt + 6 min = nach dem Schluss
    s["trim"] = 0
    assert EL.zaehlende([s], FENSTER) == {1: [0]}


def test_ausnahme_gilt_fuer_alle_kopien_derselben_fahrt():
    uhr = _s(1, T0, [_lauf(100, 60, 300.0)], det="gps_only", hz=0)
    handy = _s(2, T0, [_lauf(101, 60, 280.0)], det="model", hz=50)
    assert EL.zaehlende([uhr, handy], FENSTER) == {2: [0]}
    assert EL.zaehlende([uhr, handy], FENSTER, aus=frozenset({(2, 101000)})) == {}     # die andere Kopie rueckt nicht nach
