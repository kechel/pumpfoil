"""Fliegende Sprints (analysis/sprint.py, 09.11.2026): bestes Fenster aus dem Uhr-Tempo, Gegenprobe gegen die Positionen,
Luecken zaehlen nicht; Sprint-Bestenlisten nur in Events und nur fuer Clients mit `?sprint=1`."""
from __future__ import annotations

import math


def _spur(tempi: list[float], t0_ms: int = 0, gps_sprung_bei: int | None = None, luecke_bei: int | None = None) -> list:
    """1-Hz-Spur nach Norden mit den gegebenen Tempi (m/s); optional ein GPS-Sprung (Position 80 m daneben) oder eine
    Luecke von 6 s."""
    lat, lon = 50.0, 7.0
    out, t = [], t0_ms
    for k, v in enumerate(tempi):
        if luecke_bei is not None and k == luecke_bei:
            t += 6000
        la = lat + (80 / 111320 if gps_sprung_bei is not None and k == gps_sprung_bei else 0.0)
        out.append([t, la, lon, v, None, 4])
        lat += v / 111320.0
        t += 1000
    return out


def test_gleichmaessig():
    from app.analysis import sprint as SP
    gps = _spur([5.0] * 90)                       # 18 km/h, 90 s, 445 m
    w = SP.lauf_sprints(gps, 0, 89_000)
    for kz in ("sprint_100m", "sprint_200m", "sprint_300m", "sprint_60s"):
        assert math.isclose(w[kz], 5.0, abs_tol=0.05), (kz, w)


def test_fliegend_schnellstes_stueck():
    from app.analysis import sprint as SP
    gps = _spur([4.0] * 30 + [6.0] * 30 + [4.0] * 30)   # 30 s Spurt mittendrin
    w = SP.lauf_sprints(gps, 0, 89_000)
    assert math.isclose(w["sprint_100m"], 6.0, abs_tol=0.05)     # 100 m passen ganz in den Spurt (180 m)
    assert 4.0 < w["sprint_200m"] < 6.0
    assert "sprint_300m" in w and w["sprint_300m"] < w["sprint_200m"]


def test_fenster_liegt_im_spurt():
    """v3 (11.11.2026): Lage des besten Fensters fuer die Anzeige — 100 m liegen ganz im Spurt (30-60 s)."""
    from app.analysis import sprint as SP
    gps = _spur([4.0] * 30 + [6.0] * 30 + [4.0] * 30)
    f: dict = {}
    w = SP.lauf_sprints(gps, 0, 89_000, f)
    a, b = f["sprint_100m"]
    assert 29_000 <= a and b <= 61_000 and math.isclose((b - a) / 1000, 100 / w["sprint_100m"], abs_tol=0.3)
    assert math.isclose((f["sprint_60s"][1] - f["sprint_60s"][0]) / 1000, 60, abs_tol=0.01)
    erg = SP.session_sprints(gps, [{"t_start_session_ms": 0, "t_end_session_ms": 89_000}])
    assert erg["fenster"]["sprint_100m"] == [a, b] and erg["lauf"]["sprint_100m"] == 0


def test_zu_kurz_kein_wert():
    from app.analysis import sprint as SP
    w = SP.lauf_sprints(_spur([5.0] * 15), 0, 14_000)    # 70 m, 14 s
    assert w == {}


def test_gps_sprung_faellt_raus():
    from app.analysis import sprint as SP
    # Uhr-Tempo meldet einen Ausreisser (15 m/s fuer 3 s), die Positionen gehen normal weiter -> Fenster mit dem
    # Ausreisser passt nicht zur Positionsstrecke und zaehlt nicht.
    tempi = [5.0] * 60
    gps = _spur(tempi)
    for k in (30, 31, 32):
        gps[k][3] = 15.0
    w = SP.lauf_sprints(gps, 0, 59_000)
    assert w["sprint_100m"] < 5.5


def test_luecke_faellt_raus():
    from app.analysis import sprint as SP
    gps = _spur([5.0] * 60, luecke_bei=30)              # Uhr 6 s unter Wasser, je Stueck 145 m
    w = SP.lauf_sprints(gps, 0, 70_000)
    assert "sprint_200m" not in w and "sprint_60s" not in w   # passen nur ueber die Luecke
    assert math.isclose(w["sprint_100m"], 5.0, abs_tol=0.05)


def test_ohne_uhr_tempo_nichts():
    from app.analysis import sprint as SP
    gps = _spur([5.0] * 60)
    for p in gps:
        p[3] = None
    assert SP.lauf_sprints(gps, 0, 59_000) is None


def test_session_bester_lauf():
    from app.analysis import sprint as SP
    gps = _spur([4.0] * 40, t0_ms=0) + _spur([6.0] * 40, t0_ms=100_000)
    segs = [{"t_start_session_ms": 0, "t_end_session_ms": 39_000},
            {"t_start_ms": 100_000, "t_end_ms": 139_000}]       # zweiter ohne Session-ms: t_start_ms + Zuschnitt
    erg = SP.session_sprints(gps, segs, 0)
    assert erg["lauf"]["sprint_100m"] == 1 and math.isclose(erg["best"]["sprint_100m"], 6.0, abs_tol=0.05)
    assert len(erg["laeufe"]) == 2


def test_event_sprint_nur_mit_schalter(client, monkeypatch):
    import json
    from datetime import datetime, timedelta, timezone
    from app import models
    from app.db import SessionLocal
    from test_sportmix import _frei, _konto
    _frei()
    (uid, k) = _konto(client, "sprint-off@t.de", "Sprint Team")
    slug = client.post("/api/teams", headers=k, json={"name": "Sprint Test Team"}).json()["slug"]
    db = SessionLocal()
    s = models.Session(session_uuid="sprint-test-1", user_id=uid, started_at=datetime.now(timezone.utc) - timedelta(hours=2),
                       ended_at=datetime.now(timezone.utc) - timedelta(hours=1), sport="pumpfoil", sport_class="pumpfoil",
                       is_pumpfoil=True, status="analyzed", data_quality="ok")
    db.add(s)
    db.commit()
    db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=1,
                                 foiling_distance_m=500, sprint_100m_mps=5.5, sprint_60s_mps=5.0))
    db.commit()
    db.close()
    jetzt = datetime.now(timezone.utc)
    body = {"titel": "Sprint-Wochenende", "start": (jetzt - timedelta(days=1)).isoformat(),
            "ende": (jetzt + timedelta(days=1)).isoformat(),
            "tafeln": [{"kennzahl": "sum_distance", "sportart": "pumpfoil", "accel_only": False},
                       {"kennzahl": "sprint_100m", "sportart": "pumpfoil", "accel_only": False}]}
    r = client.post(f"/api/teams/{slug}/events?sprint=1", headers=k, json=body)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    assert [t["kennzahl"] for t in r.json()["tafeln"]] == ["sum_distance", "sprint_100m"]
    zeilen = r.json()["tafeln"][1]["zeilen"]
    assert zeilen and zeilen[0]["user_id"] == uid and math.isclose(zeilen[0]["value"], 5.5)
    alt = client.get(f"/api/teams/{slug}/events/{eid}", headers=k).json()
    assert [t["kennzahl"] for t in alt["tafeln"]] == ["sum_distance"]           # alte Apps sehen sie nicht
    # Alte App speichert das Event (ohne die Sprint-Liste, die sie nie sah) -> sie bleibt erhalten.
    body2 = {**body, "titel": "Sprint-WE", "tafeln": body["tafeln"][:1]}
    assert client.put(f"/api/teams/{slug}/events/{eid}", headers=k, json=body2).status_code == 200
    db = SessionLocal()
    gespeichert = json.loads(db.get(models.TeamEvent, eid).tafeln_json)
    db.close()
    assert [x["kennzahl"] for x in gespeichert] == ["sum_distance", "sprint_100m"]
    # Team-Bestenlisten (ausserhalb von Events) nehmen die Sprints nicht an.
    r = client.put(f"/api/teams/{slug}/tafeln", headers=k,
                   json=[{"kennzahl": "sprint_100m", "sportart": "pumpfoil", "accel_only": False}])
    assert r.status_code == 422


def test_team_wertung_sprint_durchschnitt():
    # Geschwindigkeiten addiert man nicht: Sprint-Team-Wertung = Durchschnitt der besten N, sonst Summe.
    from app import teams as T
    zuordnung = {"mitglieder": {"1": [10], "2": [10], "3": [10], "4": [20]},
                 "teams": {"10": {"slug": "a", "name": "A", "logo_url": None, "farbe": None, "land": None},
                           "20": {"slug": "b", "name": "B", "logo_url": None, "farbe": None, "land": None}}}
    zeilen = [{"user_id": 1, "value": 6.0}, {"user_id": 2, "value": 5.0}, {"user_id": 3, "value": 1.0},
              {"user_id": 4, "value": 5.8}]
    summe = {x["slug"]: x for x in T.team_wertung(None, zeilen, 2, None, zuordnung)}
    assert summe["a"]["value"] == 11.0 and summe["a"]["rang"] == 1
    schnitt = {x["slug"]: x for x in T.team_wertung(None, zeilen, 2, None, zuordnung, schnitt=True)}
    assert schnitt["a"]["value"] == 5.5 and schnitt["a"]["fahrer"] == 2 and schnitt["a"]["rang"] == 1
    # Unterzahl (Jan 12.11.2026): B hat nur 1 von 2 Fahrern -> kein Rang, obwohl 5,8 > 5,5.
    assert schnitt["b"]["value"] == 5.8 and schnitt["b"].get("ungewertet") and "rang" not in schnitt["b"]
    # Summe: keine Mindestzahl (Unterzahl kostet dort ohnehin). n = 0 (alle): keine Mindestzahl.
    assert summe["b"]["rang"] == 2 and not summe["b"].get("ungewertet")
    alle = {x["slug"]: x for x in T.team_wertung(None, zeilen, 0, None, zuordnung, schnitt=True)}
    assert alle["b"]["rang"] == 1 and not alle["b"].get("ungewertet")
    # Genau n Fahrer reichen: n = 1 -> beide gewertet.
    eins = {x["slug"]: x for x in T.team_wertung(None, zeilen, 1, None, zuordnung, schnitt=True)}
    assert eins["a"]["rang"] == 1 and eins["b"]["rang"] == 2
    # Siegertreppchen: Teamgroesse aus der Zuordnung (alle Mitglieder, nicht nur die mit Wert).
    assert summe["a"]["mitglieder"] == 3 and summe["b"]["mitglieder"] == 1 and summe["a"]["teilnehmer"] == 3


def test_event_bis_zehn_bestenlisten(client):
    # Limit je Event 6 -> 10 (09.11.2026): 10 gehen, 11 nicht.
    from datetime import datetime, timedelta, timezone
    from test_sportmix import _frei, _konto
    _frei()
    (_uid, k) = _konto(client, "zehn-tafeln@t.de", "Zehn Tafeln")
    slug = client.post("/api/teams", headers=k, json={"name": "Zehn Tafeln Team"}).json()["slug"]
    jetzt = datetime.now(timezone.utc)
    kz = ["sum_distance", "sum_runs", "sum_pumps", "sum_time", "sprint_100m", "sprint_200m", "sprint_300m", "sprint_60s",
          "session_pumps", "sum_distance"]
    def body(n):
        return {"titel": "Viele Listen", "start": (jetzt + timedelta(days=1)).isoformat(),
                "ende": (jetzt + timedelta(days=2)).isoformat(),
                "tafeln": [{"kennzahl": kz[i % len(kz)], "sportart": "pumpfoil", "accel_only": i >= 9} for i in range(n)]}
    r = client.post(f"/api/teams/{slug}/events?sprint=1", headers=k, json=body(10))
    assert r.status_code == 200, r.text
    assert len(r.json()["tafeln"]) == 10
    assert client.post(f"/api/teams/{slug}/events?sprint=1", headers=k, json=body(11)).status_code == 422


def test_aufgefuelltes_tempo_zaehlt_nicht(monkeypatch):
    # Uhr meldet Tempo 0 (keine Messung); der Standard-Ladeweg wuerde es aus den Positionen auffuellen. Die Sprints
    # duerfen davon nichts sehen: ohne Uhr-Tempo kein Wert.
    from app.analysis import sprint as SP
    from app import storage

    class R:
        segments_json = '[{"t_start_session_ms": 0, "t_end_session_ms": 59000}]'
    class S:
        session_uuid = "x"
        trim_start_ms = 0
    gps = _spur([5.0] * 60)
    for p in gps:
        p[3] = 0.0
    monkeypatch.setattr(storage, "load_gps", lambda uuid, roh=False: gps if roh else storage.tempo_auffuellen([list(p) for p in gps]))
    r = R()
    SP.setzen(S(), r)
    assert r.sprint_100m_mps == 0.0 and r.sprint_60s_mps == 0.0


def test_global_events_ics(client, monkeypatch):
    # Kalender-Abo (09.11.2026): ein Feed ohne Login, nur globale Events, nur Titel/Zeit/Beschreibung/Link.
    from datetime import datetime, timedelta, timezone
    from test_sportmix import _frei, _konto
    _frei()
    (_uid, k) = _konto(client, "ics@t.de", "Ics Team")
    slug = client.post("/api/teams", headers=k, json={"name": "Ics Offiziell"}).json()["slug"]
    monkeypatch.setenv("TEAM_GLOBAL", slug)
    jetzt = datetime.now(timezone.utc)
    def ev(titel, glob):
        return client.post(f"/api/teams/{slug}/events", headers=k, json={
            "titel": titel, "beschreibung": "Fast; really, fast", "start": (jetzt + timedelta(days=2)).isoformat(),
            "ende": (jetzt + timedelta(days=3)).isoformat(), "tafeln": [{"kennzahl": "sum_pumps"}], "global_event": glob})
    assert ev("Sprint Weekend", True).status_code == 200
    ev("Nur intern", False)
    r = client.get("/api/public/events/global.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    t = r.text
    assert t.startswith("BEGIN:VCALENDAR\r\n") and t.endswith("END:VCALENDAR\r\n")
    assert "SUMMARY:Sprint Weekend" in t and "Nur intern" not in t
    assert "Fast\; really\\, fast" in t
    assert all(len(z.encode()) <= 75 for z in t.split("\r\n"))
