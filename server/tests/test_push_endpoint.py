"""Web-Push nur an bekannte Push-Dienste (Security-Review 29.10.2026, blinde SSRF)."""
from __future__ import annotations

import pytest

from app.push import push_endpoint_ok


@pytest.mark.parametrize("url", [
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QF2x",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
])
def test_echte_dienste(url):
    assert push_endpoint_ok(url)


@pytest.mark.parametrize("url", [
    "http://fcm.googleapis.com/fcm/send/abc",          # kein https
    "https://127.0.0.1/x", "https://localhost:8090/api", "https://169.254.169.254/latest/meta-data",
    "https://fcm.googleapis.com:8443/x",                # fremder Port
    "https://fcm.googleapis.com.evil.de/x",             # Endung zaehlt, nicht Anfang
    "https://evil.de\\@fcm.googleapis.com/x",
    "https://user:pw@fcm.googleapis.com/x",
    "", "kein-url",
])
def test_alles_andere_nicht(url):
    assert not push_endpoint_ok(url)


def test_anmelden_lehnt_interne_adresse_ab(client):
    r = client.post("/api/auth/register", json={"email": "push-ssrf@b.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post("/api/push/subscribe", headers=kopf,
                    json={"endpoint": "http://127.0.0.1:5432/", "keys": {"p256dh": "a", "auth": "b"}})
    assert r.status_code == 422, r.text
    r = client.post("/api/push/subscribe", headers=kopf,
                    json={"endpoint": "https://fcm.googleapis.com/fcm/send/test-ssrf", "keys": {"p256dh": "a", "auth": "b"}})
    assert r.status_code == 200, r.text


def test_api_doku_nicht_oeffentlich(client):
    """Security-Review 29.10.2026: /api/openapi.json lieferte jedem die Routenliste."""
    r = client.get("/api/openapi.json")
    assert '"paths"' not in r.text


def test_mcp_ablehnen_nur_an_registrierte_adresse(client):
    """Security-Review 29.10.2026: „Ablehnen" auf der Zustimmungsseite war eine offene Weiterleitung."""
    r = client.post("/api/auth/register", json={"email": "mcp-ablehnen@b.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post("/oauth/consent", headers=kopf, json={
        "client_id": "gibt-es-nicht", "redirect_uri": "https://evil.example/", "code_challenge": "x" * 43,
        "ablehnen": True})
    assert r.status_code == 400, r.text
