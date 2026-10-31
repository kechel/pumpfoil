"""Teams (31.10.2026, docs/TEAMS.md): Sichtbarkeit, Beitritt, Rechte, Freigabe, Bestenlisten, Loeschen."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail: str, name: str | None = None) -> tuple[int, dict]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    if name:
        client.put("/api/auth/me", headers=kopf, json={"display_name": name})
    me = client.get("/api/auth/me", headers=kopf).json()
    return me["id"], kopf


def _session(uid: int, pumps: int, tage: int = 1, dist: float = 100.0) -> int:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=tage)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t,
                           ended_at=t + timedelta(minutes=40), sport="pumpfoil", sport_class="pumpfoil",
                           is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s)
        db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=3,
                                     pump_count=pumps, foiling_distance_m=300.0, best_distance_m=dist))
        db.commit()
        return s.id
    finally:
        db.close()


def _team(client, kopf, name: str) -> str:
    r = client.post("/api/teams", headers=kopf, json={"name": name})
    assert r.status_code == 200, r.text
    return r.json()["slug"]


def _admin(client, mail: str) -> dict:
    from app import models
    from app.db import SessionLocal
    uid, kopf = _konto(client, mail)
    db = SessionLocal()
    try:
        db.get(models.User, uid).is_admin = True
        db.commit()
    finally:
        db.close()
    return kopf


def test_slug_aus_namen():
    from app import teams as T
    assert T.slug_aus("Illmensee Pumper") == "illmensee-pumper"
    assert T.slug_aus("Jäns Größte Crew!") == "jaens-groesste-crew"
    assert T.slug_aus("Lanškroun Dlouhý rybník") == "lanskroun-dlouhy-rybnik"
    assert T.slug_fehler("ab") == "slug_laenge"
    assert T.slug_fehler("admin") == "slug_reserviert"
    assert T.slug_fehler("a_b") == "slug_zeichen"
    assert T.slug_fehler("-abc") == "slug_zeichen"
    assert T.slug_fehler("illmeseepumper") is None
    assert T.initialen("Jan Kechel") == "JK" and T.initialen("olek") == "OL" and T.initialen("") == "?"


def test_unbestaetigtes_team_fuer_fremde_unsichtbar(client):
    (_, ka), (_, kb) = _konto(client, "tm-a1@t.de"), _konto(client, "tm-b1@t.de")
    slug = _team(client, ka, "Geheimteam Eins")
    assert client.get(f"/api/teams/{slug}", headers=ka).json()["meine_rolle"] == "leiter"
    assert client.get(f"/api/teams/{slug}", headers=kb).status_code == 404
    assert client.post(f"/api/teams/{slug}/beitreten", headers=kb).status_code == 404
    assert slug not in {t["slug"] for t in client.get("/api/teams/liste", headers=kb).json()}
    assert client.get(f"/api/public/teams/{slug}").status_code == 404


def test_einladungslinks_join_und_apply(client):
    (_, ka), (ib, kb), (ic, kc) = (_konto(client, "tm-a2@t.de"), _konto(client, "tm-b2@t.de"),
                                   _konto(client, "tm-c2@t.de"))
    slug = _team(client, ka, "Linkteam Zwei")
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    assert set(links) == {"join", "apply"} and links["join"] != links["apply"]
    # Derselbe Link bei erneutem Abruf (anzeigbar), auch nach Neustart der Abfrage.
    assert client.get(f"/api/teams/{slug}/einladungen", headers=ka).json() == links
    d = client.get(f"/api/teams/einladung/{links['join']}", headers=kb).json()
    assert d["art"] == "join" and d["slug"] == slug
    assert client.post(f"/api/teams/einladung/{links['join']}", headers=kb).json()["status"] == "aktiv"
    assert client.post(f"/api/teams/einladung/{links['apply']}", headers=kc).json()["status"] == "angefragt"
    # Anfrage: sieht das Team, aber keine Bestenlisten.
    assert client.get(f"/api/teams/{slug}", headers=kc).json()["mein_status"] == "angefragt"
    assert client.get(f"/api/teams/{slug}/bestenlisten", headers=kc).status_code == 403
    m = client.get(f"/api/teams/{slug}/mitglieder", headers=ka).json()
    assert [x["user_id"] for x in m["anfragen"]] == [ic]
    assert ib in {x["user_id"] for x in m["mitglieder"]}
    # Neu erzeugter Link: der alte gilt nicht mehr.
    neu = client.post(f"/api/teams/{slug}/einladungen/join/neu", headers=ka).json()["join"]
    assert neu != links["join"]
    assert client.get(f"/api/teams/einladung/{links['join']}", headers=kc).status_code == 404


def test_rechte_moderator(client):
    (_, ka), (ib, kb), (ic, kc), (idd, kd) = (_konto(client, "tm-a3@t.de"), _konto(client, "tm-b3@t.de"),
                                              _konto(client, "tm-c3@t.de"), _konto(client, "tm-d3@t.de"))
    slug = _team(client, ka, "Rechteteam Drei")
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    for k in (kb, kc):
        client.post(f"/api/teams/einladung/{links['join']}", headers=k)
    client.post(f"/api/teams/einladung/{links['apply']}", headers=kd)
    assert client.put(f"/api/teams/{slug}/mitglieder/{ib}/rolle", headers=ka, json={"rolle": "moderator"}).status_code == 200
    # Moderator: annehmen ja, Einstellungen nein, Moderatoren/Leiter entfernen nein.
    assert client.post(f"/api/teams/{slug}/mitglieder/{idd}/annehmen", headers=kb).status_code == 200
    assert client.put(f"/api/teams/{slug}", headers=kb, json={"name": "Gekapert"}).status_code == 403
    assert client.post(f"/api/teams/{slug}/einladungen/join/neu", headers=kb).status_code == 403
    assert client.delete(f"/api/teams/{slug}/mitglieder/{idd}", headers=kb).status_code == 200
    # Einfaches Mitglied darf gar nichts verwalten.
    assert client.get(f"/api/teams/{slug}/einladungen", headers=kc).status_code == 403
    assert client.delete(f"/api/teams/{slug}/mitglieder/{ib}", headers=kc).status_code == 403
    # Leiter kann nicht austreten, ohne zu uebergeben.
    assert client.post(f"/api/teams/{slug}/austreten", headers=ka).status_code == 409
    assert client.put(f"/api/teams/{slug}/mitglieder/{ic}/rolle", headers=ka, json={"rolle": "leiter"}).status_code == 200
    assert client.get(f"/api/teams/{slug}", headers=kc).json()["meine_rolle"] == "leiter"
    assert client.get(f"/api/teams/{slug}", headers=ka).json()["meine_rolle"] == "moderator"


def test_freigabe_nur_fuer_den_auftritt(client):
    (_, ka), (_, kb) = _konto(client, "tm-a4@t.de"), _konto(client, "tm-b4@t.de")
    adm = _admin(client, "tm-adm4@t.de")
    slug = _team(client, ka, "Freigabeteam Vier")
    client.put(f"/api/teams/{slug}", headers=ka, json={"beschreibung": "Wir pumpen.", "oeffentlich": True})
    assert client.post(f"/api/teams/{slug}/freigabe", headers=ka).json()["freigabe"] == "wartet"
    assert client.get("/api/admin/pending", headers=adm).json()["teams"] >= 1
    q = client.get("/api/admin/teams", headers=adm).json()
    tid = next(x["id"] for x in q if x["neu"]["slug"] == slug)
    assert client.post(f"/api/admin/teams/{tid}", headers=adm, json={"ok": True}).json()["freigabe"] == "frei"
    # Jetzt sichtbar fuer Fremde, in der Liste und ohne Login.
    assert client.get(f"/api/teams/{slug}", headers=kb).json()["name"] == "Freigabeteam Vier"
    assert slug in {t["slug"] for t in client.get("/api/teams/liste", headers=kb).json()}
    assert client.get(f"/api/public/teams/{slug}").status_code == 200
    # Umbenennen: intern sofort, aussen erst nach neuer Freigabe; alte Adresse fuehrt weiter hin.
    r = client.put(f"/api/teams/{slug}", headers=ka, json={"name": "Neuer Name Vier", "slug": "neuer-name-vier"})
    assert r.json()["freigabe"] == "wartet" and r.json()["name"] == "Neuer Name Vier"
    aussen = client.get(f"/api/teams/{slug}", headers=kb).json()
    assert aussen["name"] == "Freigabeteam Vier" and aussen["slug"] == slug
    assert client.get("/api/teams/neuer-name-vier", headers=kb).json()["name"] == "Freigabeteam Vier"
    client.post(f"/api/admin/teams/{tid}", headers=adm, json={"ok": True})
    assert client.get(f"/api/teams/{slug}", headers=kb).json()["slug"] == "neuer-name-vier"
    # Alte Adresse bleibt gesperrt, auch fuer andere.
    assert client.post("/api/teams", headers=kb, json={"name": "Dieb", "slug": slug}).status_code == 409


def test_bestenliste_bester_je_person_und_gastform(client):
    (ia, ka), (ib, kb) = _konto(client, "tm-a5@t.de", "Anna Alpha"), _konto(client, "tm-b5@t.de", "Bert")
    (ic, _kc) = _konto(client, "tm-c5@t.de")
    adm = _admin(client, "tm-adm5@t.de")
    slug = _team(client, ka, "Tafelteam Fuenf")
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    client.post(f"/api/teams/einladung/{links['join']}", headers=kb)
    sa1, _sa2 = _session(ia, 500, tage=2), _session(ia, 200, tage=1)
    _session(ib, 300)
    _session(ic, 9999)                      # kein Mitglied -> zaehlt nicht
    client.put(f"/api/teams/{slug}/tafeln", headers=ka, json=[{"kennzahl": "session_pumps"}, {"kennzahl": "sum_pumps"}])
    d = client.get(f"/api/teams/{slug}/bestenlisten?period=30d", headers=kb).json()
    best, summe = d["tafeln"]
    assert [(z["user_id"], z["value"]) for z in best["zeilen"]] == [(ia, 500), (ib, 300)]
    assert best["zeilen"][0]["session_id"] == sa1 and best["zeilen"][0]["rang"] == 1
    assert [(z["user_id"], z["value"]) for z in summe["zeilen"]] == [(ia, 700), (ib, 300)]
    # Oeffentlich + freigegeben -> Gastform ohne Session/Spot/Avatar/Datum.
    client.put(f"/api/teams/{slug}", headers=ka, json={"oeffentlich": True})
    client.post(f"/api/teams/{slug}/freigabe", headers=ka)
    tid = next(x["id"] for x in client.get("/api/admin/teams", headers=adm).json() if x["neu"]["slug"] == slug)
    client.post(f"/api/admin/teams/{tid}", headers=adm, json={"ok": True})
    g = client.get(f"/api/public/teams/{slug}?period=30d").json()
    z = g["tafeln"][0]["zeilen"][0]
    assert set(z) == {"rang", "name", "initialen", "value"} and z["initialen"] == "AA"
    # Nicht oeffentlich -> ohne Login weg, und Fremde sehen die Bestenlisten nicht.
    client.put(f"/api/teams/{slug}", headers=ka, json={"oeffentlich": False})
    assert client.get(f"/api/public/teams/{slug}").status_code == 404
    _ix, kx = _konto(client, "tm-x5@t.de")
    assert client.get(f"/api/teams/{slug}/bestenlisten", headers=kx).status_code == 403


def test_beitreten_knopf_zwei_schalter(client):
    (_, ka), (_, kb), (_, kc) = (_konto(client, "tm-a6@t.de"), _konto(client, "tm-b6@t.de"),
                                 _konto(client, "tm-c6@t.de"))
    adm = _admin(client, "tm-adm6@t.de")
    slug = _team(client, ka, "Knopfteam Sechs")
    client.post(f"/api/teams/{slug}/freigabe", headers=ka)
    tid = next(x["id"] for x in client.get("/api/admin/teams", headers=adm).json() if x["neu"]["slug"] == slug)
    client.post(f"/api/admin/teams/{tid}", headers=adm, json={"ok": True})
    assert client.post(f"/api/teams/{slug}/beitreten", headers=kb).json()["status"] == "angefragt"
    client.put(f"/api/teams/{slug}", headers=ka, json={"automatisch_akzeptieren": True})
    assert client.post(f"/api/teams/{slug}/beitreten", headers=kc).json()["status"] == "aktiv"
    client.put(f"/api/teams/{slug}", headers=ka, json={"anmeldungen_zulassen": False})
    _i, kd = _konto(client, "tm-d6@t.de")
    assert client.post(f"/api/teams/{slug}/beitreten", headers=kd).status_code == 403


def test_loeschen_nur_mit_namen(client):
    (_, ka), (_, kb) = _konto(client, "tm-a7@t.de"), _konto(client, "tm-b7@t.de")
    slug = _team(client, ka, "Loeschteam Sieben")
    assert client.post(f"/api/teams/{slug}/loeschen", headers=ka, json={"name": "falsch"}).status_code == 422
    assert client.post(f"/api/teams/{slug}/loeschen", headers=ka, json={"name": "loeschteam  sieben"}).status_code == 200
    assert client.get(f"/api/teams/{slug}", headers=ka).status_code == 404
    assert client.post("/api/teams", headers=kb, json={"name": "Nachfolger", "slug": slug}).status_code == 409


def test_konto_loeschen_uebergibt_leitung(client):
    from app import loeschung, models
    from app.db import SessionLocal
    (ia, ka), (ib, kb) = _konto(client, "tm-a8@t.de"), _konto(client, "tm-b8@t.de")
    slug = _team(client, ka, "Erbteam Acht")
    solo = _team(client, ka, "Soloteam Acht")
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    client.post(f"/api/teams/einladung/{links['join']}", headers=kb)
    db = SessionLocal()
    try:
        loeschung.konto_loeschen(db, db.get(models.User, ia))
    finally:
        db.close()
    assert client.get(f"/api/teams/{slug}", headers=kb).json()["meine_rolle"] == "leiter"
    db = SessionLocal()
    try:
        assert db.query(models.Team).filter_by(slug=solo).first() is None
    finally:
        db.close()


def test_unter_13_keine_teams(client):
    from app import models
    from app.db import SessionLocal
    ia, ka = _konto(client, "tm-a9@t.de")
    db = SessionLocal()
    try:
        db.get(models.User, ia).social_allowed = False
        db.commit()
    finally:
        db.close()
    assert client.get("/api/teams/mine", headers=ka).status_code == 403


# ------------------------------------------------------------------ Stufe 2 (31.10.2026) ----

def _team_mit(client, ka, kb, name):
    slug = _team(client, ka, name)
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    client.post(f"/api/teams/einladung/{links['join']}", headers=kb)
    return slug, links


def test_team_chat_nur_fuer_aktive_mitglieder(client):
    (_, ka), (ib, kb), (_, kc), (_, kd) = (_konto(client, "tc-a1@t.de"), _konto(client, "tc-b1@t.de"),
                                           _konto(client, "tc-c1@t.de"), _konto(client, "tc-d1@t.de"))
    slug, links = _team_mit(client, ka, kb, "Chatteam Eins")
    scope = client.get(f"/api/teams/{slug}", headers=kb).json()["chat_scope"]
    assert scope and scope.startswith("team:")
    r = client.post(f"/api/chat?scope={scope}", headers=kb, json={"text": "Hallo Team"})
    assert r.status_code == 200, r.text
    assert [m["text"] for m in client.get(f"/api/chat?scope={scope}", headers=ka).json()] == ["Hallo Team"]
    # Fremde und offene Anfragen: kein Zugriff.
    assert client.get(f"/api/chat?scope={scope}", headers=kc).status_code == 403
    client.post(f"/api/teams/einladung/{links['apply']}", headers=kd)
    assert client.post(f"/api/chat?scope={scope}", headers=kd, json={"text": "rein?"}).status_code == 403
    assert client.get(f"/api/teams/{slug}", headers=kd).json()["chat_scope"] is None
    # Nie in der Entdeckungsliste fuer Fremde.
    assert scope not in {r["scope"] for r in client.get("/api/chat/active?limit=20", headers=kc).json()}
    # Ausgetreten: weg aus „Meine Chats", kein Lesen mehr.
    assert scope in {r["scope"] for r in client.get("/api/chat/rooms", headers=kb).json()}
    client.post(f"/api/teams/{slug}/austreten", headers=kb)
    assert scope not in {r["scope"] for r in client.get("/api/chat/rooms", headers=kb).json()}
    assert client.get(f"/api/chat?scope={scope}", headers=kb).status_code == 403


def test_team_loeschen_nimmt_chat_mit(client):
    from app import models
    from app.db import SessionLocal
    (_, ka), (_, kb) = _konto(client, "tc-a2@t.de"), _konto(client, "tc-b2@t.de")
    slug, _l = _team_mit(client, ka, kb, "Chatteam Zwei")
    scope = client.get(f"/api/teams/{slug}", headers=ka).json()["chat_scope"]
    client.post(f"/api/chat?scope={scope}", headers=ka, json={"text": "eins"})
    client.post(f"/api/teams/{slug}/loeschen", headers=ka, json={"name": "Chatteam Zwei"})
    db = SessionLocal()
    try:
        assert db.query(models.ChatMessage).filter_by(scope=scope).count() == 0
        assert db.query(models.ChatRoomState).filter_by(scope=scope).count() == 0
    finally:
        db.close()


def test_statistik_summen(client):
    (ia, ka), (ib, kb) = _konto(client, "tc-a3@t.de"), _konto(client, "tc-b3@t.de")
    slug, _l = _team_mit(client, ka, kb, "Statteam Drei")
    _session(ia, 100)
    _session(ib, 50)
    d = client.get(f"/api/teams/{slug}/statistik?period=30d", headers=kb).json()
    assert d["sessions"] == 2 and d["pumps"] == 150 and d["runs"] == 6 and d["aktive"] == 2 and d["mitglieder"] == 2
    _ix, kx = _konto(client, "tc-x3@t.de")
    assert client.get(f"/api/teams/{slug}/statistik", headers=kx).status_code == 404


def test_logbuch_nur_bei_echtem_rekord(client):
    from app import models, teams as T
    from app.db import SessionLocal
    (ia, ka), (ib, kb) = _konto(client, "tc-a4@t.de", "Alma"), _konto(client, "tc-b4@t.de", "Ben")
    slug, _l = _team_mit(client, ka, kb, "Logteam Vier")
    client.put(f"/api/teams/{slug}/tafeln", headers=ka, json=[{"kennzahl": "session_pumps"}, {"kennzahl": "sum_pumps"}])
    _session(ia, 100)

    def lauf():
        db = SessionLocal()
        try:
            T._cache.clear()
            T.logbuch_snapshot(db)
        finally:
            db.close()

    lauf()
    lb = client.get(f"/api/teams/{slug}/logbuch", headers=kb).json()
    assert {(e["kennzahl"], e["user_id"], e["vorher_user_id"]) for e in lb} == {("session_pumps", ia, None), ("sum_pumps", ia, None)}
    # Nichts Neues -> kein Eintrag.
    lauf()
    assert len(client.get(f"/api/teams/{slug}/logbuch", headers=kb).json()) == 2
    # Alma waechst in der Summe allein weiter: kein Eintrag. Ben bricht den Session-Rekord: Eintrag.
    _session(ia, 20)
    _session(ib, 110)          # Bestwert 110 > 100, Summe 110 < 120
    lauf()
    lb = client.get(f"/api/teams/{slug}/logbuch", headers=kb).json()
    assert len(lb) == 3 and lb[0]["kennzahl"] == "session_pumps" and lb[0]["user_id"] == ib
    assert lb[0]["vorher_user_id"] == ia and lb[0]["vorher_wert"] == 100 and lb[0]["wert"] == 110
    # Ben ueberholt in der Summe (110 + 100 > 120): Eintrag fuer sum_pumps.
    _session(ib, 100)
    lauf()
    lb = client.get(f"/api/teams/{slug}/logbuch", headers=kb).json()
    assert lb[0]["kennzahl"] == "sum_pumps" and lb[0]["user_id"] == ib and lb[0]["vorher_user_id"] == ia
    db = SessionLocal()
    try:
        assert db.query(models.TeamRekord).filter_by(team_id=client.get(f"/api/teams/{slug}", headers=ka).json()["id"]).count() == 2
    finally:
        db.close()


# ------------------------------------------------------------------ Stufe 3: Events ----

def test_event_fenster_einfrieren_abzeichen(client):
    from app import loeschung, models, teams as T
    from app.db import SessionLocal
    (ia, ka), (ib, kb) = _konto(client, "te-a1@t.de", "Eva"), _konto(client, "te-b1@t.de", "Finn")
    (_ix, kx) = _konto(client, "te-x1@t.de")
    adm = _admin(client, "te-adm1@t.de")
    slug, _l = _team_mit(client, ka, kb, "Eventteam Eins")
    jetzt = datetime.now(timezone.utc)
    start, ende = jetzt - timedelta(days=3), jetzt - timedelta(hours=2)
    _session(ia, 300, tage=5)                 # vor dem Fenster -> zaehlt nicht
    _session(ia, 120, tage=2)
    _session(ib, 200, tage=2)
    body = {"titel": "Pump-Wochenende", "start": start.isoformat(), "ende": ende.isoformat(),
            "zeitzone": "Europe/Berlin", "tafeln": [{"kennzahl": "session_pumps"}]}
    assert client.post(f"/api/teams/{slug}/events", headers=kb, json=body).status_code == 403
    r = client.post(f"/api/teams/{slug}/events", headers=ka, json=body)
    assert r.status_code == 200, r.text
    eid = r.json()["id"]
    # Ende vorbei, aber < 24 h: noch Auswertung (live gerechnet).
    ev = next(e for e in client.get(f"/api/teams/{slug}/events", headers=kb).json() if e["id"] == eid)
    assert ev["status"] == "auswertung"
    assert [(z["user_id"], z["value"]) for z in ev["tafeln"][0]["zeilen"]] == [(ib, 200), (ia, 120)]
    assert client.get(f"/api/teams/{slug}/events", headers=kx).status_code == 404
    # 24 h nach dem Ende einfrieren -> spaetere Sessions im Fenster aendern nichts mehr.
    db = SessionLocal()
    try:
        e = db.get(models.TeamEvent, eid)
        assert T.event_einfrieren(db, e, jetzt=ende + timedelta(hours=25)) is True
        db.commit()
    finally:
        db.close()
    _session(ia, 999, tage=2)
    ev = next(e for e in client.get(f"/api/teams/{slug}/events", headers=kb).json() if e["id"] == eid)
    assert ev["status"] == "beendet" and ev["tafeln"][0]["zeilen"][0]["user_id"] == ib
    assert client.put(f"/api/teams/{slug}/events/{eid}", headers=ka, json=body).status_code == 409
    # Abzeichen erst, wenn das Team freigegeben ist.
    assert client.get(f"/api/community/foiler/{ib}", headers=ka).json()["team_abzeichen"] == []
    client.post(f"/api/teams/{slug}/freigabe", headers=ka)
    tid = next(x["id"] for x in client.get("/api/admin/teams", headers=adm).json() if x["neu"]["slug"] == slug)
    client.post(f"/api/admin/teams/{tid}", headers=adm, json={"ok": True})
    abz = client.get(f"/api/community/foiler/{ib}", headers=ka).json()["team_abzeichen"]
    assert [(a["rang"], a["event"], a["team"]) for a in abz] == [(1, "Pump-Wochenende", "Eventteam Eins")]
    # Kontoloeschung entfernt die Zeile aus dem eingefrorenen Ergebnis, Eva rueckt auf.
    db = SessionLocal()
    try:
        loeschung.konto_loeschen(db, db.get(models.User, ib))
    finally:
        db.close()
    ev = next(e for e in client.get(f"/api/teams/{slug}/events", headers=ka).json() if e["id"] == eid)
    assert [(z["user_id"], z["rang"]) for z in ev["tafeln"][0]["zeilen"]] == [(ia, 1)]


def test_event_nur_an_spots_und_pruefungen(client):
    from app import models
    from app.db import SessionLocal
    (ia, ka), (ib, kb) = _konto(client, "te-a2@t.de"), _konto(client, "te-b2@t.de")
    slug, _l = _team_mit(client, ka, kb, "Eventteam Zwei")
    db = SessionLocal()
    try:
        sp = models.Spot(name="Eventsee Zwei", name_source="manual")
        db.add(sp)
        db.commit()
        spot_id = sp.id
    finally:
        db.close()
    s_am_spot = _session(ia, 50, tage=1)
    _session(ib, 500, tage=1)
    db = SessionLocal()
    try:
        db.get(models.Session, s_am_spot).spot_id = spot_id
        db.commit()
    finally:
        db.close()
    jetzt = datetime.now(timezone.utc)
    body = {"titel": "Nur am See", "start": (jetzt - timedelta(days=2)).isoformat(),
            "ende": (jetzt + timedelta(days=1)).isoformat(), "tafeln": [{"kennzahl": "session_pumps"}],
            "spot_ids": [spot_id]}
    eid = client.post(f"/api/teams/{slug}/events", headers=ka, json=body).json()["id"]
    ev = next(e for e in client.get(f"/api/teams/{slug}/events", headers=kb).json() if e["id"] == eid)
    assert ev["status"] == "laeuft" and [z["user_id"] for z in ev["tafeln"][0]["zeilen"]] == [ia]
    # Ende vor Start, ohne Zeitzone, unbekannte Kennzahl: abgelehnt.
    schlecht = dict(body, ende=(jetzt - timedelta(days=3)).isoformat())
    assert client.post(f"/api/teams/{slug}/events", headers=ka, json=schlecht).status_code == 422
    ohne_tz = dict(body, start="2026-11-12T10:00:00", ende="2026-11-13T18:00:00")
    assert client.post(f"/api/teams/{slug}/events", headers=ka, json=ohne_tz).status_code == 422
    assert client.post(f"/api/teams/{slug}/events", headers=ka, json=dict(body, tafeln=[{"kennzahl": "x"}])).status_code == 422
    assert client.delete(f"/api/teams/{slug}/events/{eid}", headers=ka).status_code == 200
