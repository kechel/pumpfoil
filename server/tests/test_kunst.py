"""GPS-Kunst-Event (18.11.2026, app/kunst.py): Runden, Einreichen, anonyme Galerie, Herzen, Aufloesung, Moderation."""
import math
import secrets
from datetime import datetime, timedelta, timezone

from app import kunst as K


def _nutzer(name: str, admin: bool = False) -> tuple[int, dict]:
    """Direkt in der DB (die Registrierung ist gedrosselt) + Token."""
    from app import models
    from app.db import SessionLocal
    from app.security import create_access_token
    db = SessionLocal()
    try:
        u = models.User(email=f"{name}-{secrets.token_hex(3)}@t.de", password_hash="x",
                        display_name=f"{name}{secrets.token_hex(2)}", is_admin=admin)
        db.add(u); db.commit()
        return u.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _session(uid: int, start: datetime, sport: str = "pumpfoil") -> tuple[int, str]:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        uuid = secrets.token_hex(16)
        s = models.Session(session_uuid=uuid, user_id=uid, started_at=start, ended_at=start + timedelta(minutes=30),
                           sport="pumpfoil", sport_class=sport, status="analyzed")
        db.add(s); db.flush()
        # Ein Lauf ueber alles: gezeichnet wird nur auf dem Foil.
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=1,
                                     segments_json='[{"t_start_session_ms": 0, "t_end_session_ms": 1000000000}]'))
        db.commit()
        return s.id, uuid
    finally:
        db.close()


def _kreis(n=120, r_m=60.0):
    """GPS-Punkte eines Kreises (t ms, lat, lon)."""
    lat0, lon0 = 54.0, 10.0
    out = []
    for i in range(n):
        w = 2 * math.pi * i / n
        out.append([i * 1000, lat0 + r_m * math.sin(w) / 110_540.0,
                    lon0 + r_m * math.cos(w) / (111_320.0 * math.cos(math.radians(lat0))), 4.0])
    return out


def _event(start: datetime, ende: datetime, global_event: bool = True) -> int:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = models.Team(name=f"Kunst {secrets.token_hex(3)}", slug=f"kunst-{secrets.token_hex(4)}")
        db.add(t); db.flush()
        e = models.TeamEvent(team_id=t.id, titel="Advent", start=start, ende=ende, tafeln_json="[]", vorlage=K.VORLAGE,
                             kunst_json='{"runden_tage": 7, "abstimmen_tage": 2}', global_event=global_event)
        db.add(e); db.commit()
        return e.id
    finally:
        db.close()


def _verschieben(eid: int, tage: float):
    """Event in die Vergangenheit schieben (Phasen weiterschalten, ohne die Uhr zu verstellen)."""
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        e = db.get(models.TeamEvent, eid)
        e.start, e.ende = e.start - timedelta(days=tage), e.ende - timedelta(days=tage)
        db.commit()
    finally:
        db.close()


def test_runden_teilen_das_fenster():
    from app import models
    a = datetime(2026, 11, 29, tzinfo=timezone.utc)
    e = models.TeamEvent(start=a, ende=a + timedelta(days=28), kunst_json='{"runden_tage": 7, "abstimmen_tage": 2}')
    r = K.runden(e, jetzt=a + timedelta(days=8))
    assert [x["nr"] for x in r] == [1, 2, 3, 4]
    assert [x["phase"] for x in r] == ["abstimmen", "einreichen", "kommt", "kommt"]
    assert r[-1]["ende"] == a + timedelta(days=28)
    # 10 Tage mit 3-Tages-Runden: der Rest (1 Tag) haengt an der letzten Runde -> 3 Runden, die letzte 4 Tage.
    e10 = models.TeamEvent(start=a, ende=a + timedelta(days=10), kunst_json='{"runden_tage": 3, "abstimmen_tage": 3}')
    r10 = K.runden(e10)
    assert len(r10) == 3 and r10[-1]["ende"] - r10[-1]["start"] == timedelta(days=4)
    # Keine Nachfrist: direkt nach Rundenende ist Abstimmung.
    assert K.runden(e, jetzt=a + timedelta(days=7, minutes=1))[0]["phase"] == "abstimmen"
    # Ein Event ueber eine Woche = eine Runde.
    e1 = models.TeamEvent(start=a, ende=a + timedelta(days=7), kunst_json='{"runden_tage": 7}')
    assert len(K.runden(e1)) == 1


def test_linie_normiert_und_dreht():
    striche = K.linie(_kreis(), 0, 10**9, 90)
    assert len(striche) == 1
    lin = striche[0]
    xs, ys = [p[0] for p in lin], [p[1] for p in lin]
    assert 0 <= min(xs) and max(xs) <= K.BOX and 0 <= min(ys) and max(ys) <= K.BOX
    assert max(xs) - min(xs) > 800          # eingepasst
    # Geschlossene Schleife (Anfang == Ende) darf nicht auf zwei Punkte schrumpfen.
    zu = _kreis(); zu.append([zu[-1][0] + 1000, zu[0][1], zu[0][2], 4.0])
    assert len(K.linie(zu, 0, 10**9, 0)[0]) > 20
    # Nur auf dem Foil: zwei Laeufe -> zwei Striche, das Stueck dazwischen (Weg an Land) faellt weg.
    zwei = K.linie(_kreis(), 0, 10**9, 0, fenster=[(0, 40_000), (80_000, 119_000)])
    assert len(zwei) == 2
    assert K.laeufe('[{"t_start_session_ms": 5, "t_end_session_ms": 9}, {"t_start_ms": 1}]') == [(5, 9)]
    try:
        K.linie(_kreis()[:5], 0, 10**9, 0)
        assert False
    except ValueError as ex:
        assert str(ex) == "zu_wenig_punkte"


def test_einreichen_galerie_herzen_aufloesung(client, monkeypatch):
    jetzt = datetime.now(timezone.utc)
    eid = _event(jetzt - timedelta(days=1), jetzt + timedelta(days=6))      # eine Runde, laeuft
    (ia, ka), (ib, kb), (ic, kc) = _nutzer("A"), _nutzer("B"), _nutzer("C")
    _mod, km = _nutzer("Mod", admin=True)
    gps = {}
    for uid in (ia, ib, ic):
        sid, uuid = _session(uid, jetzt - timedelta(hours=3))
        gps[uuid] = _kreis()
    sid_wing, uuid_w = _session(ia, jetzt - timedelta(hours=2), sport="wingfoil")
    gps[uuid_w] = _kreis()
    _sid_schnee, uuid_s = _session(ia, jetzt - timedelta(hours=1), sport="snowkite")
    monkeypatch.setattr("app.api.kunst.storage.load_gps", lambda u: gps.get(u, []))

    # Kandidaten: alle Sportarten zaehlen (Jan 18.11.: „ALL sports … auch land") — Wingfoil wie Snowkite; die Snowkite-
    # Session hat hier keine GPS-Punkte und faellt deshalb raus.
    kand = client.get(f"/api/kunst/{eid}/kandidaten?runde=1", headers=ka).json()
    assert sid_wing in [k["id"] for k in kand] and len(kand) == 2
    sp = client.get(f"/api/kunst/{eid}/spur/{sid_wing}", headers=ka).json()
    assert len(sp["punkte"]) == 120
    assert client.get(f"/api/kunst/{eid}/spur/{sid_wing}", headers=kb).status_code == 404   # fremde Session

    ids = {}
    for uid, kopf in ((ia, ka), (ib, kb), (ic, kc)):
        sid = next(k["id"] for k in client.get(f"/api/kunst/{eid}/kandidaten?runde=1", headers=kopf).json())
        r = client.post(f"/api/kunst/{eid}/bild", headers=kopf, json={"runde": 1, "session_id": sid, "von_ms": 0,
                                                                     "bis_ms": 200000, "drehung": 45})
        assert r.status_code == 200, r.text
        ids[uid] = r.json()["id"]
    # Austauschen: dieselbe id, kein zweites Bild.
    r = client.post(f"/api/kunst/{eid}/bild", headers=ka, json={"runde": 1, "session_id": sid_wing, "von_ms": 0,
                                                               "bis_ms": 200000, "drehung": 0})
    assert r.json()["id"] == ids[ia]

    d = client.get(f"/api/kunst/{eid}", headers=kb).json()
    r1 = d["runden"][0]
    assert r1["phase"] == "einreichen" and r1["anzahl"] == 3
    assert all("name" not in g and "user_id" not in g for g in r1["galerie"])      # anonym
    # Herzen gibt es erst in der Abstimmung.
    assert client.post(f"/api/kunst/bild/{ids[ia]}/herz", headers=kb).status_code == 409

    _verschieben(eid, 6.5)          # Runde vorbei -> Abstimmung
    assert client.post(f"/api/kunst/{eid}/bild", headers=ka, json={"runde": 1, "session_id": sid_wing, "von_ms": 0,
                                                                  "bis_ms": 200000}).status_code == 409
    assert client.post(f"/api/kunst/bild/{ids[ib]}/herz", headers=kb).status_code == 422      # eigenes
    assert client.post(f"/api/kunst/bild/{ids[ia]}/herz", headers=kb).json() == {"herz": True, "uebrig": 2}
    assert client.post(f"/api/kunst/bild/{ids[ia]}/herz", headers=kc).status_code == 200
    assert client.post(f"/api/kunst/bild/{ids[ic]}/herz", headers=ka).status_code == 200
    # Zwischenstand verborgen: keine Herzenzahl, keine Namen.
    g = client.get(f"/api/kunst/{eid}", headers=kc).json()["runden"][0]
    assert "ergebnis" not in g and all("herzen" not in x for x in g["galerie"])
    # Moderation: entfernen nimmt das Bild aus Galerie und Wertung, nur fuer Moderatoren.
    assert client.post(f"/api/kunst/bild/{ids[ib]}/entfernen", headers=ka, json={"grund": "verboten"}).status_code == 403
    assert client.post(f"/api/kunst/bild/{ids[ib]}/entfernen", headers=km, json={"grund": "Symbol nach 86a"}).status_code == 200
    eigen_b = client.get(f"/api/kunst/{eid}", headers=kb).json()["runden"][0]["eigen"]
    assert eigen_b["entfernt"] == "Symbol nach 86a"

    _verschieben(eid, 3)            # Abstimmung vorbei -> Aufloesung
    erg = client.get(f"/api/kunst/{eid}", headers=kc).json()["runden"][0]["ergebnis"]
    assert [(z["bild_id"], z["platz"], z["herzen"]) for z in erg] == [(ids[ia], 1, 2), (ids[ic], 2, 1)]
    assert erg[0]["name"] and erg[0]["session_id"]


def test_team_event_nur_fuer_mitglieder(client):
    jetzt = datetime.now(timezone.utc)
    eid = _event(jetzt - timedelta(days=1), jetzt + timedelta(days=6), global_event=False)
    _ix, kx = _nutzer("X")
    assert client.get(f"/api/kunst/{eid}", headers=kx).status_code == 404


def test_anlegen_ueber_den_event_dialog(client):
    """Vorlage „gpskunst" braucht keine Bestenliste; Runden-Einstellungen kommen mit zurueck."""
    _uid, kopf = _nutzer("Leiter")
    r = client.post("/api/teams", headers=kopf, json={"name": f"Kunstteam {secrets.token_hex(3)}"})
    assert r.status_code == 200, r.text
    slug = r.json()["slug"]
    jetzt = datetime.now(timezone.utc)
    body = {"titel": "Advent", "start": jetzt.isoformat(), "ende": (jetzt + timedelta(days=28)).isoformat(),
            "tafeln": [], "vorlage": "gpskunst", "kunst_runden_tage": 7, "kunst_abstimmen_tage": 2}
    ev = client.post(f"/api/teams/{slug}/events", headers=kopf, json=body)
    assert ev.status_code == 200, ev.text
    assert ev.json()["kunst"] == {"runden_tage": 7, "abstimmen_tage": 2, "test": False, "phasen": {}}
    d = client.get(f"/api/kunst/{ev.json()['id']}", headers=kopf).json()
    assert len(d["runden"]) == 4 and d["teilnehmen"] and d["moderieren"]
    # Ohne Vorlage bleibt eine leere Bestenliste verboten.
    assert client.post(f"/api/teams/{slug}/events", headers=kopf, json={**body, "vorlage": None}).status_code == 422


def test_testmodus_nur_admin_alte_sessions_und_phasen(client, monkeypatch):
    """Testmodus (Jan 18.11.): Sessions der letzten 60 Tage zaehlen, Phasen von Hand — beides nur fuer Admins."""
    jetzt = datetime.now(timezone.utc)
    eid = _event(jetzt - timedelta(hours=1), jetzt + timedelta(days=20))      # 3 Runden, Runde 1 laeuft
    (ia, ka), (ib, kb) = _nutzer("A"), _nutzer("B")
    _adm, kadm = _nutzer("Adm", admin=True)
    gps = {}
    alt, uuid = _session(ia, jetzt - timedelta(days=30))                       # weit vor der Runde
    gps[uuid] = _kreis()
    sb, uuid_b = _session(ib, jetzt - timedelta(days=10))
    gps[uuid_b] = _kreis()
    monkeypatch.setattr("app.api.kunst.storage.load_gps", lambda u: gps.get(u, []))
    assert client.get(f"/api/kunst/{eid}/kandidaten?runde=1", headers=ka).json() == []
    assert client.post(f"/api/kunst/{eid}/test", headers=ka, json={"test": True}).status_code == 403
    assert client.post(f"/api/kunst/{eid}/test", headers=kadm, json={"test": True}).json()["test"] is True
    assert [k["id"] for k in client.get(f"/api/kunst/{eid}/kandidaten?runde=1", headers=ka).json()] == [alt]
    for kopf, sid in ((ka, alt), (kb, sb)):
        assert client.post(f"/api/kunst/{eid}/bild", headers=kopf, json={"runde": 1, "session_id": sid, "von_ms": 0,
                                                                        "bis_ms": 10**9}).status_code == 200
    # Runde 1 sofort in die Abstimmung, dann ins Ergebnis.
    assert client.post(f"/api/kunst/{eid}/phase", headers=ka, json={"runde": 1, "phase": "abstimmen"}).status_code == 403
    client.post(f"/api/kunst/{eid}/phase", headers=kadm, json={"runde": 1, "phase": "abstimmen"})
    r1 = client.get(f"/api/kunst/{eid}", headers=kb).json()["runden"][0]
    assert r1["phase"] == "abstimmen"
    bild_a = next(g["id"] for g in r1["galerie"] if not g["eigen"])
    assert client.post(f"/api/kunst/bild/{bild_a}/herz", headers=kb).status_code == 200
    client.post(f"/api/kunst/{eid}/phase", headers=kadm, json={"runde": 1, "phase": "fertig"})
    erg = client.get(f"/api/kunst/{eid}", headers=ka).json()["runden"][0]["ergebnis"]
    assert erg[0]["bild_id"] == bild_a and erg[0]["herzen"] == 1
    # Aus: Phasen verworfen, wieder nach der Uhr.
    client.post(f"/api/kunst/{eid}/test", headers=kadm, json={"test": False})
    assert client.get(f"/api/kunst/{eid}", headers=ka).json()["runden"][0]["phase"] == "einreichen"


def test_karte_erst_nach_aufloesung(client, monkeypatch):
    """Echter Track zum Bild: erst im Ergebnis, Norden oben (Koordinaten wie gemessen), fuer Fremde nicht vorher."""
    jetzt = datetime.now(timezone.utc)
    eid = _event(jetzt - timedelta(days=1), jetzt + timedelta(days=6))
    (ia, ka), (ib, kb) = _nutzer("A"), _nutzer("B")
    sid, uuid = _session(ia, jetzt - timedelta(hours=2))
    gps = {uuid: _kreis()}
    monkeypatch.setattr("app.api.kunst.storage.load_gps", lambda u: gps.get(u, []))
    bid = client.post(f"/api/kunst/{eid}/bild", headers=ka, json={"runde": 1, "session_id": sid, "von_ms": 0,
                                                                 "bis_ms": 10**9, "drehung": 90}).json()["id"]
    assert client.get(f"/api/kunst/bild/{bid}/karte", headers=kb).status_code == 409
    assert client.get(f"/api/kunst/bild/{bid}/karte", headers=ka).status_code == 200    # eigenes immer
    _verschieben(eid, 9)
    k = client.get(f"/api/kunst/bild/{bid}/karte", headers=kb).json()["striche"]
    assert len(k) == 1 and abs(k[0][0][0] - 54.0) < 0.01          # echte Breite, nicht gedreht/normiert
    assert client.get(f"/api/kunst/{eid}", headers=kb).json()["runden"][0]["ergebnis"][0]["karte"] is True
