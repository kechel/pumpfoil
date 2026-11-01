"""Von Hand hochgeladene Datei einer geloeschten Session (Jan, 01.11.2026).

Ein Nutzer lud seine FIT hoch, loeschte die Session und bekam sie danach nicht wieder hinein — die
geloeschte Zeile sperrte als Grabstein jeden Import mit gleichem Hash oder gleicher Startzeit, und die
Seite meldete dazu „keine Aktivitaet". Jetzt: gleiche Datei holt die Session zurueck, eine andere Datei
mit derselben Startzeit (zugeschnitten) wird neu angelegt. Die Kontoverknuepfungen behalten die Sperre.
"""


def _gpx(n=30):
    teile = ['<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Test" '
             'xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg>']
    for i in range(n):
        teile.append(f'<trkpt lat="{47.6 + i * 3e-5:.7f}" lon="11.18"><time>2026-05-25T16:00:{i:02d}Z</time></trkpt>')
    teile.append('</trkseg></trk></gpx>')
    return "".join(teile).encode()


def _auth(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _hoch(client, auth, daten):
    return client.post("/api/sessions/upload-fit", headers=auth,
                       files={"file": ("lauf.gpx", daten, "application/gpx+xml")})


def test_gleiche_datei_holt_geloeschte_zurueck(client):
    auth = _auth(client, "geloescht-gleich@test.de")
    r = _hoch(client, auth, _gpx())
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    assert client.delete(f"/api/sessions/{sid}", headers=auth).json()["deleted"] is True

    r = _hoch(client, auth, _gpx())
    assert r.status_code == 200, r.text
    assert "skipped" not in r.json()
    assert r.json()["id"] == sid                       # dieselbe Session, nicht eine zweite
    assert client.get(f"/api/sessions/{sid}", headers=auth).status_code == 200


def test_zugeschnittene_datei_wird_neu_angelegt(client):
    from app import models
    from app.db import SessionLocal
    auth = _auth(client, "geloescht-anders@test.de")
    sid = _hoch(client, auth, _gpx(30)).json()["id"]
    client.delete(f"/api/sessions/{sid}", headers=auth)

    r = _hoch(client, auth, _gpx(20))                  # gleiche Startzeit, anderer Inhalt
    assert r.status_code == 200, r.text
    neu = r.json()["id"]
    assert neu != sid
    db = SessionLocal()
    try:
        assert db.get(models.Session, sid).deleted is True
        assert db.get(models.Session, neu).deleted is not True
    finally:
        db.close()


def test_noch_vorhandene_session_bleibt_einmalig(client):
    auth = _auth(client, "geloescht-doppelt@test.de")
    a = _hoch(client, auth, _gpx()).json()["id"]
    b = _hoch(client, auth, _gpx()).json()["id"]
    assert a == b


def test_kontoverknuepfung_behaelt_die_sperre(client):
    from app import models
    from app.api.sessions import import_parsed_session
    from app.db import SessionLocal
    from app.tcximport import parse_track_bytes
    auth = _auth(client, "geloescht-konto@test.de")
    sid = _hoch(client, auth, _gpx()).json()["id"]
    client.delete(f"/api/sessions/{sid}", headers=auth)
    db = SessionLocal()
    try:
        user = db.get(models.Session, sid).user
        roh = _gpx()
        s = import_parsed_session(db, user, roh, parse_track_bytes(roh, "lauf.gpx"),
                                  src_label="polar", uuid_prefix="polar-")
        assert s is None
        assert db.get(models.Session, sid).deleted is True
    finally:
        db.close()


def _hoch_mit(client, auth, daten, **params):
    q = "&".join(f"{k}={v}" for k, v in params.items())
    return client.post(f"/api/sessions/upload-fit?{q}", headers=auth,
                       files={"file": ("lauf.gpx", daten, "application/gpx+xml")})


def test_andere_datei_zu_vorhandener_fahrt_fragt_nach_und_ersetzt(client):
    # Bis 01.11.2026 landete eine zugeschnittene Datei STILL auf der vorhandenen Session.
    auth = _auth(client, "ersetzen@test.de")
    alt = _hoch(client, auth, _gpx(30)).json()["id"]

    r = _hoch_mit(client, auth, _gpx(20), rueckfrage=1)
    assert r.json()["skipped"] == "exists_different"
    assert r.json()["existing_id"] == alt

    r = _hoch_mit(client, auth, _gpx(20), rueckfrage=1, ersetzen=alt)
    assert r.status_code == 200, r.text
    neu = r.json()["id"]
    assert neu != alt
    assert client.get(f"/api/sessions/{alt}", headers=auth).status_code == 404
    assert client.get(f"/api/sessions/{neu}", headers=auth).status_code == 200


def test_gleiche_datei_fragt_nicht(client):
    auth = _auth(client, "ersetzen-gleich@test.de")
    a = _hoch(client, auth, _gpx()).json()["id"]
    r = _hoch_mit(client, auth, _gpx(), rueckfrage=1)
    assert r.json()["id"] == a and "skipped" not in r.json()


def test_ohne_rueckfrage_altes_verhalten(client):
    # Die Apps kennen die Rueckfrage nicht: dort bleibt es bei der vorhandenen Session.
    auth = _auth(client, "ersetzen-app@test.de")
    a = _hoch(client, auth, _gpx(30)).json()["id"]
    assert _hoch(client, auth, _gpx(20)).json()["id"] == a


def test_fremde_id_ersetzt_nichts(client):
    auth = _auth(client, "ersetzen-fremd@test.de")
    a = _hoch(client, auth, _gpx(30)).json()["id"]
    r = _hoch_mit(client, auth, _gpx(20), rueckfrage=1, ersetzen=a + 999)
    assert r.json()["skipped"] == "exists_different"
    assert client.get(f"/api/sessions/{a}", headers=auth).status_code == 200
