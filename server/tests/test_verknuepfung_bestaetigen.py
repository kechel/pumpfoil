"""S-014 (Security-Review 29.10.2026): Der Rueckweg vom Hersteller verknuepft nur noch fuer die
Person, die im Browser angemeldet ist UND den Verbinden-Link selbst angefordert hat.

Angriff vorher: eigenen Verbinden-Link (state = eigene uid) einem anderen unterschieben -> dessen
Polar-/Suunto-/…-Konto landet am Konto des Angreifers."""
import secrets

import pytest


class _Antwort:
    status_code = 200
    text = ""

    def __init__(self, d):
        self._d = d

    def json(self):
        return self._d


def _konto(client):
    mail = f"verkn-{secrets.token_hex(3)}@b.de"
    client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    tok = client.post("/api/auth/login", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        return db.query(models.User).filter_by(email=mail).one().id, {"Authorization": f"Bearer {tok}"}
    finally:
        db.close()


def _polar_link(uid):
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        return db.query(models.PolarLink).filter_by(user_id=uid).first()
    finally:
        db.close()


@pytest.fixture
def polar_attrappe(monkeypatch):
    from app import syncprogress
    from app.api import polar
    getauscht = []
    monkeypatch.setattr(polar, "_creds", lambda: ("id", "secret"))
    monkeypatch.setattr(polar.httpx, "post",
                        lambda *a, **k: getauscht.append(1) or _Antwort({"access_token": "a", "x_user_id": 7}))
    monkeypatch.setattr(syncprogress, "anstossen", lambda *a, **k: None)
    return polar, getauscht


@pytest.mark.parametrize("pfad,name", [
    ("polar", "polar"), ("suunto", "suunto"), ("strava", "strava"), ("coros", "coros"),
    ("coros/mcp", "coros-mcp")])
def test_callback_tauscht_nichts_ein_und_reicht_an_die_pwa(client, monkeypatch, pfad, name):
    import httpx
    monkeypatch.setattr(httpx, "post", lambda *a, **k: pytest.fail("Callback darf nicht eintauschen"))
    r = client.get(f"/api/integrations/{pfad}/callback?code=abc&state=xyz", follow_redirects=False)
    assert r.status_code == 303
    ort = r.headers["location"]
    assert f"/konten?verknuepfen={name}" in ort and "code=abc" in ort and "state=xyz" in ort


def test_abbruch_beim_hersteller_wird_durchgereicht(client):
    r = client.get("/api/integrations/suunto/callback?error=access_denied&state=xyz", follow_redirects=False)
    assert "error=access_denied" in r.headers["location"]


def test_fremder_state_verknuepft_nicht(client, polar_attrappe):
    polar, getauscht = polar_attrappe
    angreifer, _ = _konto(client)
    opfer, opfer_kopf = _konto(client)
    state = polar._state_for(angreifer)          # Link, den der Angreifer fuer sich angefordert hat
    r = client.post("/api/integrations/polar/abschliessen", json={"code": "c", "state": state},
                    headers=opfer_kopf)
    assert r.status_code == 403
    assert getauscht == [] and _polar_link(angreifer) is None and _polar_link(opfer) is None


def test_eigener_state_verknuepft(client, polar_attrappe):
    polar, getauscht = polar_attrappe
    uid, kopf = _konto(client)
    r = client.post("/api/integrations/polar/abschliessen",
                    json={"code": "c", "state": polar._state_for(uid)}, headers=kopf)
    assert r.status_code == 200 and r.json()["weiter"] == "/konten?polar=connected"
    assert getauscht and _polar_link(uid) is not None   # Token-Tausch + AccessLink-Registrierung


def test_ohne_anmeldung_kein_abschluss(client, polar_attrappe):
    polar, getauscht = polar_attrappe
    uid, _ = _konto(client)
    r = client.post("/api/integrations/polar/abschliessen", json={"code": "c", "state": polar._state_for(uid)})
    assert r.status_code == 401 and getauscht == []


def test_abgelaufener_state_meldet_fehler_mit_text(client, polar_attrappe):
    _, getauscht = polar_attrappe
    _, kopf = _konto(client)
    r = client.post("/api/integrations/polar/abschliessen", json={"code": "c", "state": "kaputt"}, headers=kopf)
    assert r.status_code == 200
    d = r.json()
    assert d["weiter"] is None and d["titel"] and getauscht == []


def test_ohne_login_ziel_zeigt_namen_und_bestaetigung_verknuepft(client, polar_attrappe):
    """Rueckweg aus den Apps (Browser ohne Anmeldung): Name des Ziel-Kontos, dann Abschluss per Klick."""
    from app import models
    from app.db import SessionLocal
    polar, getauscht = polar_attrappe
    uid, _ = _konto(client)
    db = SessionLocal()
    try:
        db.get(models.User, uid).display_name = "Zielkonto"
        db.commit()
    finally:
        db.close()
    state = polar._state_for(uid)
    assert client.get(f"/api/integrations/polar/ziel?state={state}").json()["name"] == "Zielkonto"
    assert client.get("/api/integrations/polar/ziel?state=kaputt").status_code == 404
    r = client.post("/api/integrations/polar/abschliessen-bestaetigt", json={"code": "c", "state": state})
    assert r.status_code == 200 and r.json()["weiter"] == "/konten?polar=connected"
    assert getauscht and _polar_link(uid) is not None


def test_start_aus_der_app_kommt_in_die_app_zurueck(client, polar_attrappe):
    """Ab dem naechsten App-Release: /connect?app=1 -> Rueckweg auf pumpfoil://konten, die App schliesst
    mit ihrem Token ab."""
    from urllib.parse import parse_qs, urlsplit
    polar, getauscht = polar_attrappe
    uid, kopf = _konto(client)
    auth = client.get("/api/integrations/polar/connect?app=1", headers=kopf).json()["authorize_url"]
    state = parse_qs(urlsplit(auth).query)["state"][0]
    assert state.endswith("~app")
    r = client.get(f"/api/integrations/polar/callback?code=c&state={state}", follow_redirects=False)
    ort = r.headers["location"]
    assert ort.startswith("pumpfoil://konten?") and "verknuepfen=polar" in ort and "~app" not in ort
    roh = parse_qs(urlsplit(ort).query)["state"][0]
    r = client.post("/api/integrations/polar/abschliessen", json={"code": "c", "state": roh}, headers=kopf)
    assert r.status_code == 200 and r.json()["weiter"] == "/konten?polar=connected" and _polar_link(uid)
    # Ohne app=1 bleibt alles beim Web-Weg.
    web = client.get("/api/integrations/polar/connect", headers=kopf).json()["authorize_url"]
    assert not parse_qs(urlsplit(web).query)["state"][0].endswith("~app")


def test_kennung_im_abschluss_wird_ignoriert(client, polar_attrappe):
    polar, _ = polar_attrappe
    uid, kopf = _konto(client)
    r = client.post("/api/integrations/polar/abschliessen",
                    json={"code": "c", "state": polar._state_for(uid) + "~app"}, headers=kopf)
    assert r.status_code == 200 and r.json()["weiter"] == "/konten?polar=connected"
