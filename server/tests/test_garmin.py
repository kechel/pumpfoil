"""Garmin Connect (app/api/garmin.py, 05.11.2026): Verknuepfen mit PKCE, Push-Import nur fuer Wassersport, nur von
apis.garmin.com, keine Doppelten zu eigenen Aufnahmen, Trennen und Abmelden bei Garmin."""
import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import pytest


class _Antwort:
    def __init__(self, d=None, status=200, content=b""):
        self._d = d or {}
        self.status_code = status
        self.text = ""
        self.content = content

    def json(self):
        return self._d

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


def _konto(client):
    mail = f"garmin-{secrets.token_hex(3)}@b.de"
    client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    tok = client.post("/api/auth/login", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.User).filter_by(email=mail).one().id, {"Authorization": f"Bearer {tok}"}
    finally:
        db.close()


@pytest.fixture
def garmin(monkeypatch):
    from app.api import garmin as g
    monkeypatch.setenv("GARMIN_CLIENT_ID", "cid")
    monkeypatch.setenv("GARMIN_CLIENT_SECRET", "geheim")
    monkeypatch.setenv("GARMIN_OEFFENTLICH", "1")
    return g


def _link(uid, gid=None, ablauf_h=12):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        gid = gid or secrets.token_hex(8)
        db.add(models.GarminLink(user_id=uid, garmin_user_id=gid, access_token="tok", refresh_token="ref",
                                 token_expires_at=datetime.now(timezone.utc) + timedelta(hours=ablauf_h)))
        db.commit()
        return gid
    finally:
        db.close()


def _link_von(uid):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.GarminLink).filter_by(user_id=uid).first()
    finally:
        db.close()


def test_connect_mit_pkce_und_verschluesseltem_verifier(client, garmin):
    uid, kopf = _konto(client)
    url = client.get("/api/integrations/garmin/connect", headers=kopf).json()["authorize_url"]
    q = {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}
    assert url.startswith("https://connect.garmin.com/oauth2Confirm?")
    assert q["client_id"] == "cid" and q["code_challenge_method"] == "S256" and q["response_type"] == "code"
    uid_state, verifier = garmin._state_lesen(q["state"])
    assert uid_state == uid and 43 <= len(verifier) <= 128
    erwartet = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    assert q["code_challenge"] == erwartet
    assert verifier not in url            # der Verifier steht nirgends lesbar in der Adresse


def test_abschliessen_tauscht_mit_verifier_und_speichert(client, garmin, monkeypatch):
    uid, kopf = _konto(client)
    url = client.get("/api/integrations/garmin/connect", headers=kopf).json()["authorize_url"]
    state = parse_qs(urlsplit(url).query)["state"][0]
    gesendet = {}

    def post(u, data=None, **k):
        gesendet.update(data or {})
        return _Antwort({"access_token": "acc", "refresh_token": "ref", "expires_in": 86400,
                         "refresh_token_expires_in": 7775998})

    def get(u, **k):
        return _Antwort({"userId": "g-123"} if u.endswith("/user/id") else {"permissions": ["ACTIVITY_EXPORT"]})

    monkeypatch.setattr(garmin.httpx, "post", post)
    monkeypatch.setattr(garmin.httpx, "get", get)
    r = client.post("/api/integrations/garmin/abschliessen", headers=kopf, json={"code": "c0de", "state": state})
    assert r.status_code == 200 and "garmin=connected" in r.json()["weiter"]
    assert gesendet["grant_type"] == "authorization_code" and gesendet["code_verifier"] == garmin._state_lesen(state)[1]
    assert gesendet["client_secret"] == "geheim"
    link = _link_von(uid)
    assert link.garmin_user_id == "g-123" and link.access_token == "acc" and link.permissions == "ACTIVITY_EXPORT"
    st = client.get("/api/integrations/garmin/status", headers=kopf).json()
    assert st["available"] and st["linked"] and st["activity_export"]


def test_fremder_state_wird_abgelehnt(client, garmin):
    _, kopf_a = _konto(client)
    _, kopf_b = _konto(client)
    url = client.get("/api/integrations/garmin/connect", headers=kopf_a).json()["authorize_url"]
    state = parse_qs(urlsplit(url).query)["state"][0]
    r = client.post("/api/integrations/garmin/abschliessen", headers=kopf_b, json={"code": "x", "state": state})
    assert r.status_code == 403


def _parsed(start):
    return {"started_at": start, "gps_samples": [[0, 47.0, 9.0, 3.0, None, 5.0], [600_000, 47.001, 9.001, 3.0, None, 5.0]],
            "sport": "surfing", "accel_bytes": b"", "accel_hz": None}


def test_push_filtert_und_importiert(client, garmin, monkeypatch):
    uid, _ = _konto(client)
    gid = _link(uid)
    geladen, importiert = [], []
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: geladen.append(u) or _Antwort(content=b"FIT"))
    start = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
    import app.fitimport as fi
    import app.api.sessions as sess
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(start))
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: importiert.append(k) or object())
    ok = "https://apis.garmin.com/wellness-api/rest/activityFile?id=1&token=t"
    body = {"activityFiles": [
        {"userId": gid, "summaryId": "a", "fileType": "FIT", "activityType": "RUNNING", "callbackURL": ok},
        {"userId": gid, "summaryId": "b", "fileType": "FIT", "activityType": "SURFING_V2",
         "callbackURL": "https://boese.example/x"},
        {"userId": "unbekannt", "summaryId": "c", "fileType": "FIT", "activityType": "SURFING", "callbackURL": ok},
        {"userId": gid, "summaryId": "d", "fileType": "FIT", "activityType": "STAND_UP_PADDLEBOARDING_V2",
         "callbackURL": ok},
    ]}
    r = client.post("/api/integrations/garmin/push/activity-files", json=body)
    assert r.status_code == 200
    assert geladen == [ok, ok]                      # jedes Profil, aber nur apis.garmin.com und nur bekannte Nutzer
    assert len(importiert) == 2 and importiert[0]["uuid_prefix"] == "garmin-"
    assert _link_von(uid).last_sync_at is not None


def _eigene_session(uid, start, minuten=40):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        dev = models.DeviceToken(user_id=uid, label="fenix", token=secrets.token_hex(16))
        db.add(dev); db.flush()
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, device_id=dev.id, started_at=start,
                           ended_at=start + timedelta(minutes=minuten), status="analyzed")
        db.add(s); db.commit()
        return s.id, s.session_uuid
    finally:
        db.close()


def test_eigene_aufnahme_bekommt_die_garmin_datei(client, garmin, monkeypatch, tmp_path):
    uid, _ = _konto(client)
    gid = _link(uid)
    start = datetime(2026, 11, 2, 9, 0, tzinfo=timezone.utc)
    sid, suuid = _eigene_session(uid, start)
    from app import storage
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    importiert = []
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"GARMIN-FIT"))
    import app.fitimport as fi
    import app.api.sessions as sess
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(start + timedelta(minutes=1)))
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: importiert.append(1) or object())
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "77-file", "fileType": "FIT", "activityType": "SURFING", "deviceName": "fenix 8",
         "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=2"}]})
    assert importiert == []                                   # keine zweite Session
    fit = tmp_path / suuid / "garmin-connect-77-file.fit"
    assert fit.read_bytes() == b"GARMIN-FIT"                  # aber die Garmin-Datei ist vollstaendig da
    assert (tmp_path / suuid / "garmin-connect-77-file.json").exists()


def test_garmin_zuerst_dann_eigene_aufnahme(client, garmin, monkeypatch, tmp_path):
    uid, _ = _konto(client)
    from app import models, storage
    from app.db import SessionLocal
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    start = datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        g = models.Session(session_uuid="garmin-" + secrets.token_hex(8), user_id=uid, started_at=start,
                           ended_at=start + timedelta(minutes=40), status="analyzed", device_model="Garmin fenix 8")
        db.add(g); db.commit()
        gid_s, guuid = g.id, g.session_uuid
    finally:
        db.close()
    (tmp_path / guuid).mkdir(parents=True)
    (tmp_path / guuid / "original.fit").write_bytes(b"VON-GARMIN")
    sid, suuid = _eigene_session(uid, start + timedelta(minutes=2))
    # In der Zwischenzeit haben Leute an der Garmin-Session etwas gemacht — das muss mitkommen (Jan, 05.11.2026).
    db = SessionLocal()
    try:
        db.add(models.SessionLike(user_id=uid, session_id=gid_s))
        db.add(models.SessionPhoto(session_id=gid_s, user_id=uid, url="/media/x.webp"))
        db.add(models.ChatMessage(scope=f"session:{gid_s}", user_id=uid, text="Starke Runde!"))
        db.get(models.Session, gid_s).caption = "Abendrunde"
        db.commit()
    finally:
        db.close()
    db = SessionLocal()
    try:
        eigene = db.get(models.Session, sid)
        assert garmin.nach_eigener_aufnahme(db, eigene) == 1
        g = db.get(models.Session, gid_s)
        assert g.deleted is True and g.merged_into == sid       # ausgeblendet, zeigt auf die eigene …
        assert db.query(models.SessionLike).filter_by(session_id=sid).count() == 1
        assert db.query(models.SessionPhoto).filter_by(session_id=sid).one().merged_from_session_id == gid_s
        assert db.query(models.ChatMessage).filter_by(scope=f"session:{sid}").one().text == "Starke Runde!"
        assert db.get(models.Session, sid).caption == "Abendrunde"
    finally:
        db.close()
    assert (tmp_path / guuid / "original.fit").read_bytes() == b"VON-GARMIN"   # … ihr Ordner unangetastet
    kopien = list((tmp_path / suuid).glob("garmin-connect-*.fit"))
    assert len(kopien) == 1 and kopien[0].read_bytes() == b"VON-GARMIN"


def _alt_machen(uid):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        l = db.query(models.GarminLink).filter_by(user_id=uid).one()
        l.created_at = l.verbunden_am = datetime.now(timezone.utc) - timedelta(hours=1)
        db.commit()
    finally:
        db.close()


def test_abmeldung_direkt_nach_dem_verbinden_wird_uebergangen(client, garmin):
    uid, _ = _konto(client)
    gid = _link(uid)                      # gerade eben verbunden
    client.post("/api/integrations/garmin/push/deregistrations", json={"deregistrations": [{"userId": gid}]})
    assert _link_von(uid) is not None


def test_deregistrierung_und_freigaben(client, garmin):
    uid, _ = _konto(client)
    gid = _link(uid)
    _alt_machen(uid)
    client.post("/api/integrations/garmin/push/permissions",
                json={"userPermissionsChange": [{"userId": gid, "permissions": ["WORKOUT_IMPORT"]}]})
    assert _link_von(uid).permissions == "WORKOUT_IMPORT"
    client.post("/api/integrations/garmin/push/permissions",
                json={"userPermissionsChange": [{"userId": gid, "permissions": []}]})
    assert _link_von(uid).permissions == ""           # ausdruecklich keine Freigabe, nicht „unbekannt"
    client.post("/api/integrations/garmin/push/deregistrations", json={"deregistrations": [{"userId": gid}]})
    assert _link_von(uid) is None


def test_trennen_meldet_bei_garmin_ab(client, garmin, monkeypatch):
    uid, kopf = _konto(client)
    _link(uid)
    geloescht = []
    monkeypatch.setattr(garmin.httpx, "delete", lambda u, **k: geloescht.append(u) or _Antwort())
    assert client.delete("/api/integrations/garmin", headers=kopf).json()["ok"]
    assert geloescht and geloescht[0].endswith("/partner-gateway/rest/user/registration")
    assert _link_von(uid) is None


def test_abgelaufenes_token_wird_erneuert(client, garmin, monkeypatch):
    uid, _ = _konto(client)
    _link(uid, ablauf_h=-1)
    gesendet = {}
    monkeypatch.setattr(garmin.httpx, "post", lambda u, data=None, **k: gesendet.update(data) or _Antwort(
        {"access_token": "neu", "refresh_token": "ref2", "expires_in": 86400}))
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        link = db.query(models.GarminLink).filter_by(user_id=uid).one()
        assert garmin.gueltiges_token(link, db) == "neu"
        assert gesendet["grant_type"] == "refresh_token" and gesendet["refresh_token"] == "ref"
        assert link.refresh_token == "ref2"
    finally:
        db.close()


def test_ohne_freigabe_nur_fuer_admins(client, garmin, monkeypatch):
    monkeypatch.delenv("GARMIN_OEFFENTLICH")
    _, kopf = _konto(client)
    assert client.get("/api/integrations/garmin/status", headers=kopf).json()["available"] is False
    assert client.get("/api/integrations/garmin/connect", headers=kopf).status_code == 404


def test_geraet_name():
    from app.api.garmin import geraet_name
    from app.api.sessions import import_geraet
    assert geraet_name("fenix 8") == "Garmin fenix 8" and geraet_name("Garmin Forerunner 965") == "Garmin Forerunner 965"
    assert geraet_name(None) == "Garmin"
    assert import_geraet("garmin-abc", "Garmin fenix 8") == "Garmin fenix 8"
    assert import_geraet("coros-abc", "COROS Apex") is None and import_geraet("garmin-x", None) is None


def test_tester_sehen_es_vor_der_freigabe(client, garmin, monkeypatch):
    monkeypatch.delenv("GARMIN_OEFFENTLICH")
    uid, kopf = _konto(client)
    monkeypatch.setenv("GARMIN_TESTER", f"999999, {uid}")
    assert client.get("/api/integrations/garmin/status", headers=kopf).json()["available"] is True


def test_taeglicher_lauf_erneuert_nur_kurz_vor_ablauf(client, garmin, monkeypatch):
    uid, _ = _konto(client)
    _link(uid)
    from app import models
    from app.db import SessionLocal
    aufrufe = []
    monkeypatch.setattr(garmin.httpx, "post", lambda u, data=None, **k: aufrufe.append(data) or _Antwort(
        {"access_token": "neu", "refresh_token": "ref2", "expires_in": 86400, "refresh_token_expires_in": 7775998}))
    db = SessionLocal()
    try:
        link = db.query(models.GarminLink).filter_by(user_id=uid).one()
        user = db.get(models.User, uid)
        link.refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=60)
        db.commit()
        assert garmin.sync(user, db) == "ok" and aufrufe == []
        link.refresh_expires_at = datetime.now(timezone.utc) + timedelta(days=10)
        db.commit()
        assert garmin.sync(user, db) == "erneuert" and aufrufe[0]["grant_type"] == "refresh_token"
        assert link.refresh_token == "ref2" and link.refresh_expires_at > datetime.now(timezone.utc) + timedelta(days=80)
    finally:
        db.close()


def test_jedes_profil_kommt_bis_es_abgewaehlt_ist(client, garmin, monkeypatch):
    # Jan, 05.11.2026: „alles speichern was kommt bis der user aktiv etwas abgewaehlt hat".
    uid, kopf = _konto(client)
    gid = _link(uid)
    geladen = []
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: geladen.append(u) or _Antwort(content=b"FIT"))
    import app.fitimport as fi
    import app.api.sessions as sess
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)))
    importiert = []
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: importiert.append(1) or object())
    eintrag = {"userId": gid, "summaryId": "s1", "fileType": "FIT", "activityType": "BACKCOUNTRY_SKIING",
               "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=9"}
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [eintrag]})
    assert len(importiert) == 1                                # ungewoehnliches Profil kommt trotzdem
    sports = client.get("/api/integrations/garmin/sports", headers=kopf).json()["sports"]
    assert next(x for x in sports if x["sport_key"] == "BACKCOUNTRY_SKIING")["importieren"] is True
    client.put("/api/integrations/garmin/sports", headers=kopf, json={"BACKCOUNTRY_SKIING": False})
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [{**eintrag, "summaryId": "s2"}]})
    assert len(importiert) == 1                                # nach dem Abwaehlen keine neue Session mehr


def test_eigene_aufnahme_bekommt_datei_auch_bei_abgewaehltem_profil(client, garmin, monkeypatch, tmp_path):
    # 05.11.2026: Garmin meldet Aufnahmen unserer Connect-IQ-App als OTHER. Auch wenn das abgewaehlt ist, muss die Datei
    # an die eigene Aufnahme, nur eine neue Session darf daraus nicht werden.
    uid, _ = _konto(client)
    gid = _link(uid)
    start = datetime(2026, 11, 3, 15, 26, 9, tzinfo=timezone.utc)
    sid, suuid = _eigene_session(uid, start, minuten=17)
    from app import importsports
    from app.db import SessionLocal
    db = SessionLocal()
    importsports.merken(db, uid, "garmin", "OTHER", standard=False)   # vom Nutzer abgewaehlt
    db.close()
    from app import storage
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    geladen, importiert = [], []
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: geladen.append(u) or _Antwort(content=b"CIQ-FIT"))
    import app.api.sessions as sess
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: importiert.append(1) or object())
    url = "https://apis.garmin.com/wellness-api/rest/activityFile?id=5"
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "88-file", "fileType": "FIT", "activityType": "OTHER",
         "startTimeInSeconds": int(start.timestamp()), "callbackURL": url},
        {"userId": gid, "summaryId": "99-file", "fileType": "FIT", "activityType": "OTHER",
         "startTimeInSeconds": int((start + timedelta(hours=5)).timestamp()), "callbackURL": url}]})
    assert importiert == []                                    # abgewaehlt: keine neue Session
    assert (tmp_path / suuid / "garmin-connect-88-file.fit").read_bytes() == b"CIQ-FIT"
    assert not (tmp_path / suuid / "garmin-connect-99-file.fit").exists()


def test_naechster_start_gewinnt(client, garmin):
    # 05.11.2026: eine 7-s-Aufnahme ohne eingetragenes Ende galt als „laeuft noch" und bekam die Datei der Fahrt danach.
    from app.db import SessionLocal
    from app import models
    uid, _ = _konto(client)
    t0 = datetime(2026, 11, 5, 13, 38, 9, tzinfo=timezone.utc)
    kurz, _u1 = _eigene_session(uid, t0, minuten=0)
    lang, _u2 = _eigene_session(uid, t0 + timedelta(seconds=18), minuten=2)
    db = SessionLocal()
    try:
        db.get(models.Session, kurz).ended_at = None
        db.commit()
        treffer = garmin._eigene_aufnahme(db, uid, t0 + timedelta(seconds=19), t0 + timedelta(seconds=109))
        assert treffer.id == lang
        treffer = garmin._eigene_aufnahme(db, uid, t0 + timedelta(seconds=1), t0 + timedelta(seconds=8))
        assert treffer.id == kurz
    finally:
        db.close()


def test_zwei_uhren_gleichzeitig_nur_dieselbe_uhr(client, garmin):
    # 07.11.2026: fēnix (006-B4376) und FR55 (006-B3869) starteten 4 s auseinander; der Import der einen Uhr landete in der
    # Aufnahme der anderen. Mit Produktnummer aus der Datei zaehlt nur noch die Aufnahme derselben Uhr.
    from app.db import SessionLocal
    from app import models
    uid, _ = _konto(client)
    t0 = datetime(2026, 11, 7, 13, 17, 32, tzinfo=timezone.utc)
    fr55, _u1 = _eigene_session(uid, t0, minuten=8)
    fenix, _u2 = _eigene_session(uid, t0 + timedelta(seconds=4), minuten=58)
    db = SessionLocal()
    try:
        db.get(models.DeviceToken, db.get(models.Session, fr55).device_id).part_number = "006-B3869-00"
        db.get(models.DeviceToken, db.get(models.Session, fenix).device_id).part_number = "006-B4376-00"
        db.commit()
        start, ende = t0 + timedelta(seconds=5), t0 + timedelta(minutes=8)
        assert garmin._eigene_aufnahme(db, uid, start, ende, produkt=3869).id == fr55
        assert garmin._eigene_aufnahme(db, uid, start, ende, produkt=4376).id == fenix
        assert garmin._eigene_aufnahme(db, uid, start, ende, produkt=9999) is None   # dritte Uhr: eigene Session
        assert garmin._eigene_aufnahme(db, uid, start, ende).id == fenix              # ohne Nummer wie bisher (Zeit)
        assert garmin.andere_uhr(db, db.get(models.Session, fenix), 3869)
        assert not garmin.andere_uhr(db, db.get(models.Session, fenix), None)
    finally:
        db.close()


def test_offene_aufnahme_nur_bei_fast_gleichem_start(client, garmin):
    from app.db import SessionLocal
    from app import models
    uid, _ = _konto(client)
    t0 = datetime(2026, 11, 5, 9, 0, tzinfo=timezone.utc)
    offen, _u = _eigene_session(uid, t0, minuten=0)
    db = SessionLocal()
    try:
        db.get(models.Session, offen).ended_at = None
        db.commit()
        assert garmin._eigene_aufnahme(db, uid, t0 + timedelta(minutes=30), t0 + timedelta(minutes=40)) is None
        assert garmin._eigene_aufnahme(db, uid, t0 + timedelta(seconds=2), t0 + timedelta(minutes=10)).id == offen
    finally:
        db.close()


def test_eigene_aufnahme_ohne_gps_bekommt_die_datei(client, garmin, monkeypatch, tmp_path):
    # Tanz/Halle: die Garmin-Datei hat kein GPS, gehoert aber zu einer eigenen Aufnahme -> anhaengen, nicht verwerfen.
    uid, _ = _konto(client)
    gid = _link(uid)
    start = datetime(2026, 11, 2, 18, 4, 35, tzinfo=timezone.utc)
    sid, suuid = _eigene_session(uid, start, minuten=72)
    from app import storage
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"TANZ-FIT"))
    import app.fitimport as fi
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: {**_parsed(start), "gps_samples": []})
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "t1-file", "fileType": "FIT", "activityType": "OTHER",
         "startTimeInSeconds": int(start.timestamp()),
         "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=7"}]})
    assert (tmp_path / suuid / "garmin-connect-t1-file.fit").read_bytes() == b"TANZ-FIT"


def test_zaehlt_als_je_profil(client, garmin, monkeypatch):
    # Die Auswahl „zaehlt als" auf der Garmin-Karte muss gespeichert und beim Import benutzt werden (05.11.2026).
    uid, kopf = _konto(client)
    gid = _link(uid)
    r = client.put("/api/settings", headers=kopf, json={"garmin_sport_je_modus": {"OTHER": "wingfoil", "X": "quatsch"}})
    assert r.status_code == 200
    assert client.get("/api/settings", headers=kopf).json()["garmin_sport_je_modus"] == {"OTHER": "wingfoil"}
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"FIT"))
    import app.fitimport as fi
    import app.api.sessions as sess
    aufrufe = []
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)))
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: aufrufe.append(k) or object())
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "z1", "fileType": "FIT", "activityType": "OTHER",
         "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=3"}]})
    assert aufrufe and aufrufe[0]["sport_override"] == "wingfoil"


def test_alte_adresse_leitet_weiter(client, garmin):
    # Benachrichtigungen und geteilte Links auf die Garmin-Session fuehren nach dem Verknuepfen zur eigenen.
    from app import models
    from app.db import SessionLocal
    uid, kopf = _konto(client)
    start = datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc)
    sid, _u = _eigene_session(uid, start)
    db = SessionLocal()
    try:
        g = models.Session(session_uuid="garmin-" + secrets.token_hex(8), user_id=uid, started_at=start,
                           status="analyzed", deleted=True, merged_into=sid)
        db.add(g); db.commit()
        gid_s = g.id
    finally:
        db.close()
    r = client.get(f"/api/sessions/{gid_s}", headers=kopf, follow_redirects=False)
    assert r.status_code == 307 and r.headers["location"] == f"/api/sessions/{sid}"


def test_datenwege_der_uhr(client, garmin, monkeypatch):
    # Zwei Wege getrennt schaltbar (05.11.2026): speicherarme Uhr + Garmin Connect -> eigener Roh-Weg aus, FIT-Accel an.
    from app.api import devices
    from app.db import SessionLocal
    from app import models
    uid, _ = _konto(client)
    db = SessionLocal()
    try:
        dev = models.DeviceToken(user_id=uid, label="instinct", token=secrets.token_hex(16), platform="garmin")
        db.add(dev); db.commit()
        ohne = devices._datenwege(db, dev, memtot=92, minimal=1)
        assert ohne == {}                                                    # ohne Verknuepfung: nichts Neues
        assert devices._datenwege(db, dev, memtot=763, minimal=None) == {}
        _link(uid)
        mit = devices._datenwege(db, dev, memtot=92, minimal=1)
        assert mit == {"gc": True, "rohGps": False, "rohAccel": False, "fitAccel": True}
        assert devices._datenwege(db, dev, memtot=763, minimal=None) == {"gc": True, "rohGps": True, "rohAccel": True,
                                                                          "fitAccel": True}
        monkeypatch.setenv("UHR_WEGE_NUTZER", '{"%d": {"rohGps": false}, "999999": {"rohAccel": false}}' % uid)
        w = devices._datenwege(db, dev, memtot=763, minimal=None)      # nur dieses Konto, nur dieser Schalter
        assert w["rohGps"] is False and w["rohAccel"] is True and w["fitAccel"] is True
        monkeypatch.setenv("UHR_WEGE_NUTZER", "kaputt")
        assert devices._datenwege(db, dev, memtot=763, minimal=None)["rohGps"] is True
        monkeypatch.delenv("UHR_WEGE_NUTZER")
        monkeypatch.setenv("UHR_LOWMEM_GC_NUR_FIT", "0")
        assert devices._datenwege(db, dev, memtot=92, minimal=1) == {"gc": True, "rohGps": True, "rohAccel": True,
                                                                      "fitAccel": False}
        monkeypatch.setenv("UHR_WEG_FIT", "0")
        monkeypatch.setenv("UHR_WEG_ROH_GPS", "0")
        assert devices._datenwege(db, dev, memtot=763, minimal=None) == {"gc": True, "rohGps": False, "rohAccel": True,
                                                                          "fitAccel": False}
    finally:
        db.close()


def _duenne_eigene(uid, start, tmp_path, minuten=30):
    """Eigene Aufnahme mit `duenn` in der meta.json (Datenwege aus), Sportart + Foil von der Uhr."""
    import json
    from app import models
    from app.db import SessionLocal
    sid, suuid = _eigene_session(uid, start, minuten=minuten)
    (tmp_path / suuid).mkdir(parents=True, exist_ok=True)
    (tmp_path / suuid / "meta.json").write_text(json.dumps({"duenn": True}))
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        s.sport_class = "wingfoil"
        s.caption = "von der Uhr"
        db.commit()
    finally:
        db.close()
    return sid, suuid


def test_duenne_eigene_dann_garmin(client, garmin, monkeypatch, tmp_path):
    # Uhr mit Datenwegen aus: Meta kommt zuerst, die Garmin-FIT wird die Session, die eigene geht darin auf.
    from app import models, storage
    from app.db import SessionLocal
    uid, _ = _konto(client)
    gid = _link(uid)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    start = datetime(2026, 11, 4, 9, 0, tzinfo=timezone.utc)
    sid, _u = _duenne_eigene(uid, start, tmp_path, minuten=10)   # Garmins Datei (_parsed) deckt 10 min
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"FIT"))
    import app.fitimport as fi
    import app.api.sessions as sess
    import app.analysis as an
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(start))
    monkeypatch.setattr(an, "run_analysis", lambda db, s: None)
    aufrufe = []

    def _import(db, user, raw, parsed, **k):
        aufrufe.append(k)
        g = models.Session(session_uuid="garmin-" + secrets.token_hex(6), user_id=user.id, started_at=start,
                           ended_at=start + timedelta(minutes=30), status="analyzed", sport_class=k["sport_override"])
        db.add(g); db.commit()
        return g
    monkeypatch.setattr(sess, "import_parsed_session", _import)
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "d1", "fileType": "FIT", "activityType": "OTHER",
         "startTimeInSeconds": int(start.timestamp()),
         "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=8"}]})
    assert aufrufe and aufrufe[0]["ausser_id"] == sid and aufrufe[0]["sport_override"] == "wingfoil"
    db = SessionLocal()
    try:
        eigene = db.get(models.Session, sid)
        g = db.get(models.Session, eigene.merged_into)
        assert eigene.deleted and g.session_uuid.startswith("garmin-") and not g.deleted
        assert g.sport_class == "wingfoil" and g.caption == "von der Uhr"
    finally:
        db.close()


def test_garmin_dann_duenne_eigene(client, garmin, monkeypatch, tmp_path):
    # Andere Reihenfolge: die Garmin-Session ist schon da, die duenne eigene Aufnahme geht beim Abschluss darin auf.
    from app import models, storage
    from app.db import SessionLocal
    import app.analysis as an
    uid, _ = _konto(client)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    monkeypatch.setattr(an, "run_analysis", lambda db, s: None)
    start = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        g = models.Session(session_uuid="garmin-" + secrets.token_hex(6), user_id=uid, started_at=start,
                           ended_at=start + timedelta(minutes=30), status="analyzed", sport_class="pumpfoil")
        db.add(g); db.commit()
        gid_s = g.id
    finally:
        db.close()
    sid, _u = _duenne_eigene(uid, start + timedelta(seconds=1), tmp_path)
    db = SessionLocal()
    try:
        assert garmin.nach_eigener_aufnahme(db, db.get(models.Session, sid)) == 1
        g = db.get(models.Session, gid_s)
        assert not g.deleted and g.sport_class == "wingfoil"
        assert db.get(models.Session, sid).merged_into == gid_s
    finally:
        db.close()


def test_garmin_ohne_gps_zuerst_wird_geparkt(client, garmin, monkeypatch, tmp_path):
    # 05.11.2026: 8-s-Aufnahme ohne GPS-Fix kam zuerst ueber Garmin (Uhr nicht gekoppelt) und wurde verworfen. Jetzt:
    # Dateien unserer App parken, beim Abschluss der eigenen Aufnahme anhaengen; fremde Aktivitaeten weiter verwerfen.
    from app import models, storage
    from app.db import SessionLocal
    uid, _ = _konto(client)
    gid = _link(uid)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    monkeypatch.setattr(garmin, "_eingang_dir", lambda u: tmp_path / "eingang" / str(u))
    start = datetime(2026, 11, 5, 16, 59, 22, tzinfo=timezone.utc)
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"OHNE-GPS"))
    import app.fitimport as fi
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: {**_parsed(start), "gps_samples": [], "dauer_ms": 8000})
    url = "https://apis.garmin.com/wellness-api/rest/activityFile?id=4"
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "p1-file", "fileType": "FIT", "activityType": "SURFING", "activityName": "Pumpfoil",
         "callbackURL": url},
        {"userId": gid, "summaryId": "y1-file", "fileType": "FIT", "activityType": "YOGA", "activityName": "Yoga",
         "callbackURL": url}]})
    assert (tmp_path / "eingang" / str(uid) / "p1-file.fit").exists()
    assert not (tmp_path / "eingang" / str(uid) / "y1-file.fit").exists()     # fremde Aktivitaet: weg
    sid, suuid = _eigene_session(uid, start, minuten=0)
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        s.ended_at = start + timedelta(seconds=8)
        db.commit()
        garmin.nach_eigener_aufnahme(db, s)
        garmin.nach_eigener_aufnahme(db, s)     # zweimal: nichts doppelt
    finally:
        db.close()
    assert (tmp_path / suuid / "garmin-connect-p1-file.fit").read_bytes() == b"OHNE-GPS"
    assert '"angehaengt_an"' in (tmp_path / "eingang" / str(uid) / "p1-file.json").read_text()


def test_hoehere_accel_rate_gewinnt(client, garmin, monkeypatch, tmp_path):
    # Jan, 05.11.2026: „wer mehr hat gewinnt" — Garmin mit 100 Hz gegen unsere 25 Hz -> Garmin wird die Session;
    # Garmin mit weniger -> unsere bleibt, Garmins Datei wird nur angehaengt.
    from app import models, storage
    from app.db import SessionLocal
    import app.fitimport as fi
    import app.api.sessions as sess
    import app.analysis as an
    uid, _ = _konto(client)
    gid = _link(uid)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    monkeypatch.setattr(an, "run_analysis", lambda db, s: None)
    monkeypatch.setattr(garmin, "rate_eigene", lambda s: 25.0)
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"FIT"))
    erzeugt = []

    def _import(db, user, raw, parsed, **k):
        g = models.Session(session_uuid="garmin-" + secrets.token_hex(6), user_id=user.id, started_at=parsed["started_at"],
                           ended_at=parsed["started_at"] + timedelta(minutes=10), status="analyzed")
        db.add(g); db.commit(); erzeugt.append(g.id)
        return g
    monkeypatch.setattr(sess, "import_parsed_session", _import)
    url = "https://apis.garmin.com/wellness-api/rest/activityFile?id=11"
    # 08.11.2026 (#20815/#20823): Garmin mit 100 Hz, aber nach 10 von 30 min gestoppt -> unsere bleibt (Deckung).
    for minute, hz, eigene_min, garmin_gewinnt in ((0, 100, 10, True), (20, 10, 10, False), (40, 100, 30, False)):
        start = datetime(2026, 11, 5, 8, minute, tzinfo=timezone.utc)
        sid, suuid = _eigene_session(uid, start, minuten=eigene_min)
        n = int(hz * 600)
        monkeypatch.setattr(fi, "parse_fit_bytes", lambda b, start=start, n=n: {
            **_parsed(start), "accel_bytes": b"\0" * (6 * n), "dauer_ms": 600_000})
        client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
            {"userId": gid, "summaryId": f"r{minute}", "fileType": "FIT", "activityType": "OTHER",
             "startTimeInSeconds": int(start.timestamp()), "callbackURL": url}]})
        db = SessionLocal()
        try:
            eigene = db.get(models.Session, sid)
            if garmin_gewinnt:
                g = db.get(models.Session, eigene.merged_into)
                assert eigene.deleted and g.session_uuid.startswith("garmin-") and g.device_id == eigene.device_id
            else:
                assert not eigene.deleted and (tmp_path / suuid / f"garmin-connect-r{minute}.fit").exists()
        finally:
            db.close()
    assert len(erzeugt) == 1


def test_zweite_uhr_mit_garmin_profil_wird_eigene_session(client, garmin, monkeypatch, tmp_path):
    # Olek, 05.11.2026: zwei Uhren gleichzeitig — Uhr A mit unserer App, Uhr B mit Garmins Profil „Foil".
    # Die Aktivitaet von Uhr B darf NICHT an die Session von Uhr A, sie wird eine eigene Session.
    from app import storage
    uid, _ = _konto(client)
    gid = _link(uid)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    start = datetime(2026, 11, 6, 9, 0, tzinfo=timezone.utc)
    sid, suuid = _eigene_session(uid, start, minuten=60)
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"FIT-B"))
    import app.fitimport as fi
    import app.api.sessions as sess
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(start + timedelta(seconds=5)))
    importiert = []
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: importiert.append(1) or object())
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
        {"userId": gid, "summaryId": "b1", "fileType": "FIT", "activityType": "OTHER", "activityName": "Foil",
         "startTimeInSeconds": int(start.timestamp()) + 5,
         "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=12"}]})
    assert importiert == [1]                                              # eigene Session fuer Uhr B
    assert not (tmp_path / suuid / "garmin-connect-b1.fit").exists()     # nichts an Uhr A gehaengt



def test_profilname_wird_eigene_auswahlzeile(client, garmin, monkeypatch):
    # Jan, 05.11.2026: eigene Profile („Foil", „Snowkite" …) laufen unter „Andere" — der Profilname ist die Info.
    uid, kopf = _konto(client)
    gid = _link(uid)
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"FIT"))
    import app.fitimport as fi
    import app.api.sessions as sess
    aufrufe = []
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: aufrufe.append(k) or object())
    client.put("/api/settings", headers=kopf, json={"garmin_sport_je_modus": {"OTHER:Snowkite": "snowkite"}})
    for i, name in enumerate(("Foil", "Snowkite")):
        monkeypatch.setattr(fi, "parse_fit_bytes", lambda b, name=name, i=i: {
            **_parsed(datetime(2026, 11, 1, 10 + i, 0, tzinfo=timezone.utc)), "sport_name": name})
        client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [
            {"userId": gid, "summaryId": f"n{i}", "fileType": "FIT", "activityType": "OTHER",
             "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=13"}]})
    sports = {x["sport_key"]: x["label"] for x in client.get("/api/integrations/garmin/sports", headers=kopf).json()["sports"]}
    assert sports.get("OTHER:Foil") == "Foil (Other)" and "OTHER:Snowkite" in sports
    assert aufrufe[1]["sport_override"] == ("snowkite" if "snowkite" in __import__("app.api.sessions", fromlist=["SPORTS"]).SPORTS else None)
    assert garmin.modus_schluessel("SURFING", "Surfing") == ("SURFING", "Surfing")
    assert garmin.modus_schluessel("OTHER", "Pumpfoil") == ("OTHER", "Other")


def test_tanz_aufnahme_geht_mit_abschnitten_in_der_garmin_session_auf(client, garmin, monkeypatch):
    # #20252 (06.11.2026): die Tanz-App-Aufnahme ging in der Garmin-Session auf (104 Hz gegen 25 Hz), aber `sport` blieb
    # Garmins „training" und die Tanz-Abschnitte hingen an der ausgeblendeten eigenen Session.
    from app import models, tanz
    from app.api import garmin as g_mod
    from app.db import SessionLocal
    monkeypatch.setattr("app.analysis.run_analysis", lambda db, s: None)
    uid, _kopf = _konto(client)
    start = datetime(2026, 11, 6, 8, 9, 23, tzinfo=timezone.utc)
    eid, _u = _eigene_session(uid, start, minuten=1)
    db = SessionLocal()
    try:
        eigene = db.get(models.Session, eid)
        eigene.sport = "dance"
        g = models.Session(session_uuid="garmin-" + secrets.token_hex(8), user_id=uid, sport="training",
                           started_at=start + timedelta(seconds=1), ended_at=start + timedelta(seconds=65),
                           status="analyzed")
        db.add(g); db.flush()
        tanz.speichern(db, eid, [{"start_ms": 500, "ende_ms": 30000, "vorschlag": "samba", "gewaehlt": None,
                                  "quelle": "auto", "tempo": 100, "dreh": 10}], "uhr",
                       fenster_uhr=[{"t_ms": 10000, "tempo": 100, "klar": 0.5, "quer": 0.1, "umdr": None}],
                       orte=[{"t_ms": 2000, "lat": 47.9, "lon": 9.3, "genauigkeit": 5}])
        db.commit()
        g_mod.in_garmin_session_aufgehen(db, eigene, g)
        db.expire_all()
        g2 = db.get(models.Session, g.id)
        assert g2.sport == "dance"
        assert db.get(models.Session, eid).merged_into == g.id
        assert tanz.laden(db, eid) is None
        t = tanz.laden(db, g.id)
        # 1 s spaeter gestartet -> Session-ms um 1000 frueher, nie unter 0.
        assert [(a["start_ms"], a["ende_ms"]) for a in t["abschnitte"]] == [(0, 29000)]
        assert [(a["start_ms"], a["ende_ms"]) for a in t["uhr"]] == [(0, 29000)]
        assert t["fenster_uhr"][0]["t_ms"] == 9000 and t["orte"][0]["t_ms"] == 1000
    finally:
        db.close()


def test_warteschlange_uebersteht_neustart(client, garmin, monkeypatch):
    # 06.11.2026: Garmins Download-Adresse gilt nur einmal, die Verarbeitung laeuft nach der 200 im Serverprozess. Bricht
    # ein Neustart sie ab, holt der Start sie aus der Warteschlange nach — mit der schon geladenen Datei, ohne Download.
    uid, _ = _konto(client)
    gid = _link(uid)
    start = datetime(2026, 11, 1, 10, 0, tzinfo=timezone.utc)
    import app.fitimport as fi
    import app.api.sessions as sess
    monkeypatch.setattr(fi, "parse_fit_bytes", lambda b: _parsed(start))
    importiert = []
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: importiert.append(a[2]) or object())
    e = {"userId": gid, "summaryId": f"ws-{secrets.token_hex(3)}", "fileType": "FIT", "activityType": "SURFING",
         "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=9&token=t"}
    # Zustand nach dem Abbruch: Push abgelegt, Datei geladen und gesichert, Import nie fertig.
    garmin.warteschlange_merken([e])
    garmin._ws_datei_merken(e, b"GESICHERT")
    monkeypatch.setattr(garmin.httpx, "get", lambda *a, **k: (_ for _ in ()).throw(AssertionError("kein Download")))
    assert garmin.warteschlange_nachholen(datetime.now(timezone.utc) + timedelta(seconds=5)) == 1
    assert importiert == [b"GESICHERT"]
    assert not list(garmin._ws_dir().glob(f"{garmin._ws_schluessel(e)}.*"))
    # Normalfall: der Push legt ab, die Verarbeitung raeumt auf.
    monkeypatch.setattr(garmin.httpx, "get", lambda u, **k: _Antwort(content=b"FIT"))
    e2 = {**e, "summaryId": f"ws-{secrets.token_hex(3)}"}
    assert client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [e2]}).status_code == 200
    assert not list(garmin._ws_dir().glob(f"{garmin._ws_schluessel(e2)}.*"))


# --- Von Hand hochgeladene FIT-Dateien (09.11.2026) -----------------------------------------------------------------

def _fit_parsed(start, hz, name="Pumpfoil", produkt=None):
    return {**_parsed(start), "accel_bytes": b"\0" * (6 * int(hz * 600)), "dauer_ms": 600_000, "sport_name": name,
            "garmin_produkt": produkt}


def test_fit_upload_zur_eigenen_aufnahme(client, garmin, monkeypatch, tmp_path):
    """FIT-Datei unserer App nach dem Uhr-Upload: bessere Datei (100 Hz, deckt ab) wird die Session, die eigene geht
    darin auf; schlechtere haengt nur an der eigenen; Datei einer anderen App (zweite Uhr) bleibt aussen vor."""
    from app import models, storage
    from app.db import SessionLocal
    import app.api.sessions as sess
    import app.analysis as an
    uid, _ = _konto(client)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    monkeypatch.setattr(an, "run_analysis", lambda db, s: None)
    monkeypatch.setattr(garmin, "rate_eigene", lambda s: 25.0)

    def _import(db, user, raw, parsed, **k):
        g = models.Session(session_uuid="fit-" + secrets.token_hex(6), user_id=user.id, started_at=parsed["started_at"],
                           ended_at=parsed["started_at"] + timedelta(minutes=10), status="analyzed")
        db.add(g); db.commit()
        return g
    monkeypatch.setattr(sess, "import_parsed_session", _import)
    db = SessionLocal()
    try:
        user = db.get(models.User, uid)
        # 1) bessere Datei: wird die Session
        start = datetime(2026, 11, 8, 14, 0, tzinfo=timezone.utc)
        sid, _su = _eigene_session(uid, start, minuten=10)
        g = garmin.fit_zur_eigenen_aufnahme(db, user, b"FIT1", _fit_parsed(start + timedelta(seconds=2), 100), "a.fit")
        eigene = db.get(models.Session, sid)
        assert g.session_uuid.startswith("fit-") and eigene.deleted and eigene.merged_into == g.id
        assert g.device_id == eigene.device_id
        # 2) schlechtere Datei: haengt an der eigenen, keine neue Session
        start = datetime(2026, 11, 8, 15, 0, tzinfo=timezone.utc)
        sid, suuid = _eigene_session(uid, start, minuten=10)
        g = garmin.fit_zur_eigenen_aufnahme(db, user, b"FIT2", _fit_parsed(start, 10), "b.fit")
        assert g.id == sid and not db.get(models.Session, sid).deleted
        assert list((tmp_path / suuid).glob("fit-upload-*.fit"))
        # 3) andere App auf der zweiten Uhr: kein Bezug zur eigenen Aufnahme
        start = datetime(2026, 11, 8, 16, 0, tzinfo=timezone.utc)
        sid, _su = _eigene_session(uid, start, minuten=10)
        assert garmin.fit_zur_eigenen_aufnahme(db, user, b"FIT3", _fit_parsed(start, 100, name="Foil"), "c.fit") is None
        # 4) Start zu weit weg: andere Fahrt
        assert garmin.fit_zur_eigenen_aufnahme(db, user, b"FIT4", _fit_parsed(start + timedelta(minutes=5), 100), "d.fit") is None
    finally:
        db.close()


def test_fit_zuerst_dann_eigene_aufnahme(client, garmin, monkeypatch, tmp_path):
    """Andere Reihenfolge (Nutzer-Meldung 08.11.2026): erst die FIT-Datei hochgeladen, dann synct die Uhr. Bessere FIT-Datei
    bleibt die Session, die eigene geht darin auf; FIT einer anderen App bleibt eine eigene Session."""
    from app import models, storage
    from app.db import SessionLocal
    import app.fitimport as fi
    import app.analysis as an
    uid, _ = _konto(client)
    monkeypatch.setattr(storage, "session_dir", lambda u: tmp_path / u)
    monkeypatch.setattr(storage, "ensure_session_dir", lambda u: (tmp_path / u).mkdir(parents=True, exist_ok=True) or tmp_path / u)
    monkeypatch.setattr(an, "run_analysis", lambda db, s: None)
    monkeypatch.setattr(garmin, "rate_eigene", lambda s: 25.0)
    monkeypatch.setattr(storage, "duenn", lambda u: False)
    db = SessionLocal()
    try:
        ergebnisse = []
        for i, (name, eigene_geht_auf) in enumerate((("Pumpfoil", True), ("FoilApp", False))):
            start = datetime(2026, 11, 8, 10 + i, 0, tzinfo=timezone.utc)
            f = models.Session(session_uuid="fit-" + secrets.token_hex(6), user_id=uid, started_at=start,
                               ended_at=start + timedelta(minutes=10), status="analyzed")
            db.add(f); db.commit()
            (tmp_path / f.session_uuid).mkdir(parents=True)
            (tmp_path / f.session_uuid / "original.fit").write_bytes(f"FIT{i}".encode())
            monkeypatch.setattr(fi, "parse_fit_bytes", lambda b, start=start, name=name: _fit_parsed(start, 100, name=name))
            sid, _su = _eigene_session(uid, start + timedelta(seconds=2), minuten=10)
            eigene = db.get(models.Session, sid)
            garmin.nach_eigener_aufnahme(db, eigene)
            db.refresh(eigene); db.refresh(f)
            ergebnisse.append((eigene.deleted, eigene.merged_into == f.id, f.deleted))
        assert ergebnisse == [(True, True, False), (False, False, False)]
    finally:
        db.close()
