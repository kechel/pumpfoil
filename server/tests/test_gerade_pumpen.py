"""„Gerade am Pumpen" — welcher Spot, und wann jemand NICHT mehr zaehlt (Jan, 15.10.2026).

Positionsmeldung der Uhr beim ersten GPS-Fix (<= 1 km um einen Spot, sonst zaehlt er nicht), der
Spot der hochgeladenen Session ersetzt sie, und 0 Laeufe oder Loeschen nimmt ihn sofort heraus.
"""
from datetime import datetime, timedelta, timezone


def _konto(client, name):
    r = client.post("/api/auth/register", json={"email": f"{name}@pos.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    tok = client.post("/api/devices/pair", json={"code": code}).json()["device_token"]
    return auth, {"X-Device-Token": tok}, client.get("/api/auth/me", headers=auth).json()["id"]


def _zustand(uid):
    from app.db import SessionLocal
    from app.api import devices as D
    db = SessionLocal()
    try:
        return uid in D._aktive_nutzer(db), D._spot_des_nutzers(db, uid, D._spots_mit_ort(db))
    finally:
        db.close()


def _session(uid, uuid, spot_id, num_runs=None, deleted=False, alter_min=1):
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    jetzt = datetime.now(timezone.utc)
    s = models.Session(session_uuid=uuid, user_id=uid, started_at=jetzt - timedelta(hours=1),
                       created_at=jetzt - timedelta(minutes=alter_min), spot_id=spot_id,
                       status="analyzed", deleted=deleted)
    db.add(s); db.flush()
    if num_runs is not None:
        db.add(models.AnalysisResult(session_id=s.id, algo_version="t", detection="model", num_runs=num_runs))
    db.commit()
    sid = s.id
    db.close()
    return sid


def _spots():
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    # Weit weg von allen anderen Testdaten.
    a = models.Spot(name="PosSeeA", lat=-70.0, lon=100.0)
    b = models.Spot(name="PosSeeB", lat=-70.5, lon=101.0)
    db.add_all([a, b]); db.commit()
    ids = a.id, b.id
    db.close()
    return ids


def test_position_am_spot_und_fern(client):
    a, b = _spots()
    auth, uhr, uid = _konto(client, "posfern")
    _session(uid, "pos-alt-1", b, num_runs=3, alter_min=60 * 24 * 3)   # alte Session an B
    client.get("/api/devices/config", headers=uhr)                     # App-Start
    assert _zustand(uid) == (True, b)                                   # ohne Meldung: wie bisher

    r = client.post("/api/devices/position", headers=uhr, json={"lat": -70.004, "lon": 100.003})
    assert r.status_code == 200 and r.json()["spot"] is True            # ~0,5 km von A
    assert _zustand(uid) == (True, a)

    r = client.post("/api/devices/position", headers=uhr, json={"lat": -70.02, "lon": 100.0})
    assert r.json()["spot"] is False                                    # ~2,2 km: zu weit
    assert _zustand(uid) == (False, None)


def test_position_wird_nicht_gespeichert_und_geprueft(client):
    from app.db import SessionLocal
    from app import models
    _spots()
    _auth, uhr, uid = _konto(client, "posdaten")
    assert client.post("/api/devices/position", headers=uhr, json={"lat": "x"}).status_code == 422
    assert client.post("/api/devices/position", headers=uhr, json={"lat": 0, "lon": 0}).status_code == 422
    assert client.post("/api/devices/position", headers=uhr, json={"lat": 91, "lon": 0}).status_code == 422
    assert client.post("/api/devices/position", json={"lat": 1, "lon": 1}).status_code == 401
    client.post("/api/devices/position", headers=uhr, json={"lat": -70.0, "lon": 100.0})
    db = SessionLocal()
    d = db.query(models.DeviceToken).filter_by(token=uhr["X-Device-Token"]).one()
    assert d.pos_at is not None and d.pos_spot_id is not None
    assert not hasattr(d, "pos_lat")      # Koordinaten werden nicht gespeichert
    db.close()


def test_noch_nicht_analysiert_ist_kein_signal(client):
    a, b = _spots()
    _auth, uhr, uid = _konto(client, "posupload")
    client.post("/api/devices/position", headers=uhr, json={"lat": -70.0, "lon": 100.0})
    # Hochgeladen, noch nicht analysiert -> noch kein Signal, Position gilt weiter
    _session(uid, "pos-up-0", None, num_runs=None, alter_min=0)
    assert _zustand(uid) == (True, a)


def test_upload_mit_laeufen_setzt_spot(client):
    a, b = _spots()
    _auth, uhr, uid = _konto(client, "poslaeufe")
    client.post("/api/devices/position", headers=uhr, json={"lat": -70.0, "lon": 100.0})
    _session(uid, "pos-up-1", b, num_runs=4, alter_min=0)              # juenger als die Meldung
    assert _zustand(uid) == (True, b)
    # ohne bekannten Spot, aber mit Laeufen: zaehlt, ohne Spot
    _session(uid, "pos-up-2", None, num_runs=2, alter_min=-1)
    assert _zustand(uid) == (True, None)


def test_null_laeufe_oder_geloescht_nimmt_sofort_raus(client):
    a, b = _spots()
    _auth, uhr, uid = _konto(client, "posnull")
    client.get("/api/devices/config", headers=uhr)
    _session(uid, "pos-alt-2", a, num_runs=3, alter_min=60 * 24)       # gestern an A
    assert _zustand(uid) == (True, a)
    _session(uid, "pos-null", a, num_runs=0, alter_min=0)              # Emulator: 0 Laeufe
    assert _zustand(uid) == (False, None)

    _auth2, uhr2, uid2 = _konto(client, "posweg")
    client.get("/api/devices/config", headers=uhr2)
    sid = _session(uid2, "pos-del", a, num_runs=5, alter_min=0)
    assert _zustand(uid2) == (True, a)
    client.delete(f"/api/sessions/{sid}", headers=_auth2)
    assert _zustand(uid2) == (False, None)


def test_neue_position_nach_null_laeufen_zaehlt_wieder(client):
    a, b = _spots()
    _auth, uhr, uid = _konto(client, "poswieder")
    _session(uid, "pos-null-2", a, num_runs=0, alter_min=5)
    client.get("/api/devices/config", headers=uhr)
    assert _zustand(uid)[0] is False
    client.post("/api/devices/position", headers=uhr, json={"lat": -70.5, "lon": 101.0})
    assert _zustand(uid) == (True, b)
