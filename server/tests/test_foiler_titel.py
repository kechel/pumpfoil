"""Foiler-Seite ohne Rekord-Titel + Titel einzeln (03.11.2026): die Seite steht, bevor der teure Teil fertig ist."""
from __future__ import annotations

import secrets


def _konto(client, tag):
    r = client.post("/api/auth/register", json={"email": f"ft-{tag}-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def test_seite_ohne_titel_und_titel_einzeln(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    voll = client.get(f"/api/community/foiler/{a}", headers=kb).json()
    assert "titel" in voll and "spot_titel" in voll            # Apps: unveraendert mit Titeln
    ohne = client.get(f"/api/community/foiler/{a}", params={"titel": "false"}, headers=kb).json()
    assert "titel" not in ohne and "spot_titel" not in ohne
    nur = client.get(f"/api/community/foiler/{a}/titel", headers=kb).json()
    assert set(nur) == {"titel", "titel_accel", "spot_titel"}


def test_titel_gleiche_sperren_wie_die_seite(client):
    (a, ka), (b, kb) = _konto(client, "a"), _konto(client, "b")
    assert client.put("/api/settings", headers=ka, json={"public_profile": {"enabled": False}}).status_code == 200
    assert client.get(f"/api/community/foiler/{a}", headers=kb).status_code == 404
    assert client.get(f"/api/community/foiler/{a}/titel", headers=kb).status_code == 404
