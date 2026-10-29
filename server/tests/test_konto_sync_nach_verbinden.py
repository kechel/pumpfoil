"""Nach dem Verknuepfen gleich importieren (Jan 22.10.2026), wie bei Suunto: Polar und COROS stossen
den Abgleich im Hintergrund an, die Weiterleitung wartet nicht."""


class _Antwort:
    status_code = 200

    def __init__(self, d):
        self._d = d
        self.text = ""

    def json(self):
        return self._d


def _konto(client, mail):
    """(uid, Auth-Header). Seit S-014 schliesst die PWA die Verknuepfung MIT Login ab."""
    client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    tok = client.post("/api/auth/login", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        return db.query(models.User).filter_by(email=mail).one().id, {"Authorization": f"Bearer {tok}"}
    finally:
        db.close()


def test_coros_mcp_callback_stoesst_abgleich_an(client, monkeypatch):
    from app import syncprogress
    from app.api import coros_mcp
    uid, kopf = _konto(client, "coros-sync@b.de")
    gerufen = []
    monkeypatch.setattr(coros_mcp, "_state_lesen", lambda s: (uid, "verifier"))
    monkeypatch.setattr(coros_mcp, "_client_id", lambda: "x")
    monkeypatch.setattr(coros_mcp.httpx, "post", lambda *a, **k: _Antwort(
        {"access_token": "a", "refresh_token": "r", "expires_in": 3600}))
    monkeypatch.setattr(syncprogress, "anstossen", lambda db, u, prov, arbeit, warten=True: gerufen.append((u, prov, warten)))
    r = client.post("/api/integrations/coros/mcp/abschliessen", json={"code": "c", "state": "s"}, headers=kopf)
    assert r.status_code == 200 and "coros=connected" in r.json()["weiter"]
    assert gerufen == [(uid, "coros", False)]


def test_polar_callback_stoesst_abgleich_an(client, monkeypatch):
    from app import syncprogress
    from app.api import polar
    uid, kopf = _konto(client, "polar-sync@b.de")
    gerufen = []
    monkeypatch.setattr(polar, "_creds", lambda: ("id", "secret"))
    monkeypatch.setattr(polar, "_uid_from_state", lambda s: uid)
    monkeypatch.setattr(polar.httpx, "post", lambda *a, **k: _Antwort({"access_token": "a", "x_user_id": 42}))
    monkeypatch.setattr(syncprogress, "anstossen", lambda db, u, prov, arbeit, warten=True: gerufen.append((u, prov, warten)))
    r = client.post("/api/integrations/polar/abschliessen", json={"code": "c", "state": "s"}, headers=kopf)
    assert r.status_code == 200 and "polar=connected" in r.json()["weiter"]
    assert gerufen == [(uid, "polar", False)]
