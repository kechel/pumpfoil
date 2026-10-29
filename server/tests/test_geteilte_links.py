"""Die Liste der eigenen Teilen-Links im Profil (Jan, 25.09.2026).

Zwei Dinge werden geprueft, und beide waeren im Betrieb still falsch:
der Reihenfolge-Effekt bei den Routen, und dass die Liste wirklich nur die eigenen zeigt.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _session(uid, **f):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid,
                           started_at=datetime.now(timezone.utc) - timedelta(hours=2),
                           sport="pumpfoil", place_name="Teststrand", is_pumpfoil=True, **f)
        db.add(s); db.commit()
        return s.id
    finally:
        db.close()


def test_liste_zeigt_nur_eigene_und_nur_mit_link(client):
    kopf = _konto(client, "teilen-liste@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    fremd = _konto(client, "teilen-fremd@b.de")
    fremd_uid = client.get("/api/auth/me", headers=fremd).json()["id"]

    mit = _session(uid)
    ohne = _session(uid)
    geloescht = _session(uid, deleted=True)
    fremde = _session(fremd_uid)

    # Links erzeugen — ueber den echten Weg, nicht per DB.
    client.post(f"/api/sessions/{mit}/share", headers=kopf)
    client.post(f"/api/sessions/{geloescht}/share", headers=kopf)
    client.post(f"/api/sessions/{fremde}/share", headers=fremd)

    ids = [z["id"] for z in client.get("/api/sessions/geteilte", headers=kopf).json()]
    assert mit in ids
    for nicht in (ohne, geloescht, fremde):
        assert nicht not in ids


def test_route_wird_nicht_als_session_id_gelesen(client):
    """`/geteilte` muss VOR `/{session_id}` stehen — sonst 422 statt einer Liste."""
    kopf = _konto(client, "teilen-route@b.de")
    r = client.get("/api/sessions/geteilte", headers=kopf)
    assert r.status_code == 200, r.text
    assert isinstance(r.json(), list)


def test_zuruecknehmen_verschwindet_aus_der_liste(client):
    kopf = _konto(client, "teilen-weg@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session(uid)
    client.post(f"/api/sessions/{sid}/share", headers=kopf)
    assert sid in [z["id"] for z in client.get("/api/sessions/geteilte", headers=kopf).json()]
    assert client.request("DELETE", f"/api/sessions/{sid}/share", headers=kopf).status_code == 200
    assert sid not in [z["id"] for z in client.get("/api/sessions/geteilte", headers=kopf).json()]


def _alter_link(sid, tage):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        db.get(models.Session, sid).share_created_at = datetime.now(timezone.utc) - timedelta(days=tage)
        db.commit()
    finally:
        db.close()


def test_link_laeuft_nach_vier_wochen_ab(client):
    """Jan, 29.10.2026: Teilen-Links verschwinden nach 28 Tagen, als haette man sie widerrufen."""
    kopf = _konto(client, f"teilen-ablauf-{secrets.token_hex(3)}@b.de")
    uid = client.get("/api/auth/me", headers=kopf).json()["id"]
    sid = _session(uid)
    r = client.post(f"/api/sessions/{sid}/share", headers=kopf).json()
    alt = r["token"]
    bis = datetime.fromisoformat(r["gueltig_bis"])
    assert timedelta(days=27) < bis - datetime.now(timezone.utc) <= timedelta(days=28)
    assert client.get(f"/api/public/session/{alt}").status_code == 200

    _alter_link(sid, 27)
    assert client.get(f"/api/public/session/{alt}").status_code == 200
    _alter_link(sid, 29)
    assert client.get(f"/api/public/session/{alt}").status_code == 404
    assert sid not in [z["id"] for z in client.get("/api/sessions/geteilte", headers=kopf).json()]
    assert client.get(f"/api/sessions/{sid}", headers=kopf).json()["share_token"] is None
    # Neu teilen gibt einen NEUEN Link — der alte lebt nicht wieder auf.
    neu = client.post(f"/api/sessions/{sid}/share", headers=kopf).json()["token"]
    assert neu != alt and client.get(f"/api/public/session/{alt}").status_code == 404


def test_beispiel_link_laeuft_nie_ab():
    from types import SimpleNamespace
    from app import teilen
    s = SimpleNamespace(id=9535, share_token="x",
                        share_created_at=datetime.now(timezone.utc) - timedelta(days=400))
    assert teilen.gueltig_bis(s) is None
