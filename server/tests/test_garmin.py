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
    db = SessionLocal()
    try:
        eigene = db.get(models.Session, sid)
        assert garmin.nach_eigener_aufnahme(db, eigene) == 1
        assert db.get(models.Session, gid_s).deleted is True    # ausgeblendet …
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
    monkeypatch.setattr(sess, "import_parsed_session", lambda *a, **k: object())
    eintrag = {"userId": gid, "summaryId": "s1", "fileType": "FIT", "activityType": "BACKCOUNTRY_SKIING",
               "callbackURL": "https://apis.garmin.com/wellness-api/rest/activityFile?id=9"}
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [eintrag]})
    assert len(geladen) == 1                                   # ungewoehnliches Profil kommt trotzdem
    sports = client.get("/api/integrations/garmin/sports", headers=kopf).json()["sports"]
    assert next(x for x in sports if x["sport_key"] == "BACKCOUNTRY_SKIING")["importieren"] is True
    client.put("/api/integrations/garmin/sports", headers=kopf, json={"BACKCOUNTRY_SKIING": False})
    client.post("/api/integrations/garmin/push/activity-files", json={"activityFiles": [{**eintrag, "summaryId": "s2"}]})
    assert len(geladen) == 1                                   # nach dem Abwaehlen nicht mehr


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
    assert geladen == [url]                                    # nur die zur eigenen Aufnahme geladen
    assert importiert == []
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
