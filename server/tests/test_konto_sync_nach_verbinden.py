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
    client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        return db.query(models.User).filter_by(email=mail).one().id
    finally:
        db.close()


def test_coros_mcp_callback_stoesst_abgleich_an(client, monkeypatch):
    from app import syncprogress
    from app.api import coros_mcp
    uid = _konto(client, "coros-sync@b.de")
    gerufen = []
    monkeypatch.setattr(coros_mcp, "_state_lesen", lambda s: (uid, "verifier"))
    monkeypatch.setattr(coros_mcp, "_client_id", lambda: "x")
    monkeypatch.setattr(coros_mcp.httpx, "post", lambda *a, **k: _Antwort(
        {"access_token": "a", "refresh_token": "r", "expires_in": 3600}))
    monkeypatch.setattr(syncprogress, "anstossen", lambda db, u, prov, arbeit, warten=True: gerufen.append((u, prov, warten)))
    r = client.get("/api/integrations/coros/mcp/callback?code=c&state=s", follow_redirects=False)
    assert r.status_code == 302 and "coros=connected" in r.headers["location"]
    assert gerufen == [(uid, "coros", False)]


def test_polar_callback_stoesst_abgleich_an(client, monkeypatch):
    from app import syncprogress
    from app.api import polar
    uid = _konto(client, "polar-sync@b.de")
    gerufen = []
    monkeypatch.setattr(polar, "_creds", lambda: ("id", "secret"))
    monkeypatch.setattr(polar, "_uid_from_state", lambda s: uid)
    monkeypatch.setattr(polar.httpx, "post", lambda *a, **k: _Antwort({"access_token": "a", "x_user_id": 42}))
    monkeypatch.setattr(syncprogress, "anstossen", lambda db, u, prov, arbeit, warten=True: gerufen.append((u, prov, warten)))
    r = client.get("/api/integrations/polar/callback?code=c&state=s", follow_redirects=False)
    assert r.status_code == 303 and "polar=connected" in r.headers["location"]
    assert gerufen == [(uid, "polar", False)]
