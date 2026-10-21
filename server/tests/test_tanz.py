"""Tanz-Abschnitte der Tanz-App (21.10.2026): kommen im /complete mit, Besitzer korrigiert im Web."""


def _konto(client, mail):
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    return auth, uhr


def _session(client, uhr, uuid, sport="dance"):
    assert client.post("/api/ingest/session", headers=uhr, json={
        "session_uuid": uuid, "started_at": "2026-10-21T19:00:00Z", "sport": sport,
        "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000}).status_code == 200
    hr = [[i * 1000, 100] for i in range(60)]
    assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
        "index": 0, "kind": "hr", "encoding": "json", "data": hr}).status_code == 200


def test_tanz_abschnitte_von_der_uhr_und_korrektur_im_web(client):
    from app.db import SessionLocal
    from app import models
    auth, uhr = _konto(client, "tanz-abschnitte@b.de")
    _session(client, uhr, "tanz-abschn-1")
    tz = [[30000, 330000, "tango", "boogie", 2, 126, 0],
          [400000, -1, "lw", None, 0, 92, 10],
          [500000, 600000, None, "salsa", 3, 0, 0],
          [700000, 760000, "lw", "ww", 4, 90, 60],
          [800000, 800000, None, "jive", 5, 0, 0],
          [1, 2, "quatsch", "<script>", 7, 9999, 500],
          "kaputt"]
    r = client.post("/api/ingest/session/tanz-abschn-1/complete", headers=uhr, json={"total_chunks": 1, "tanz": tz})
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    d = client.get(f"/api/sessions/{sid}/tanz", headers=auth).json()
    a = d["abschnitte"]
    assert len(a) == 6
    assert a[3]["quelle"] == "nachtraeglich" and a[4]["quelle"] == "marker"
    assert a[0] == {"start_ms": 30000, "ende_ms": 330000, "vorschlag": "tango", "gewaehlt": "boogie",
                    "quelle": "geaendert", "tempo": 126, "dreh": 0}
    assert a[1]["ende_ms"] is None and a[1]["quelle"] == "auto"
    assert a[2]["quelle"] == "manuell" and a[2]["vorschlag"] is None
    assert a[5]["vorschlag"] is None and a[5]["gewaehlt"] is None and a[5]["tempo"] is None and a[5]["dreh"] is None
    # Korrektur im Web: Abschnitt 1 ist Langsamer Walzer
    d = client.put(f"/api/sessions/{sid}/tanz", headers=auth,
                   json={"abschnitte": [{"index": 1, "gewaehlt": "lw"}, {"index": 99, "gewaehlt": "jive"}]}).json()
    assert d["abschnitte"][1]["gewaehlt"] == "lw" and d["abschnitte"][1]["quelle"] == "web"
    assert d["abschnitte"][0]["gewaehlt"] == "boogie"
    # fremde Nutzer sehen nichts
    fremd, _ = _konto(client, "tanz-fremd@b.de")
    assert client.get(f"/api/sessions/{sid}/tanz", headers=fremd).status_code == 404
    db = SessionLocal()
    try:
        assert db.get(models.Session, sid).sport == "dance"
    finally:
        db.close()


def test_tanz_nur_bei_dance_sessions(client):
    auth, uhr = _konto(client, "tanz-pump@b.de")
    _session(client, uhr, "tanz-pump-1", sport="pumpfoil")
    r = client.post("/api/ingest/session/tanz-pump-1/complete", headers=uhr,
                    json={"total_chunks": 1, "tanz": [[0, 1000, "lw", None, 0, 90, 0]]})
    assert r.status_code == 200
    assert client.get(f"/api/sessions/{r.json()['session_id']}/tanz", headers=auth).status_code == 404
