"""Nationalitaet (settings.land) und die Marke land_gewaehlt fuer den Vorschlag im Einrichtungs-Assistenten (03.11.2026)."""
from __future__ import annotations

import secrets


def test_land_gewaehlt_auch_bei_nicht_angeben(client):
    r = client.post("/api/auth/register", json={"email": f"land-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    s = client.get("/api/settings", headers=kopf).json()
    assert s["land"] == "" and s["land_gewaehlt"] is False
    assert client.put("/api/settings", headers=kopf, json={"land": "pl"}).status_code == 200
    s = client.get("/api/settings", headers=kopf).json()
    assert s["land"] == "PL" and s["land_gewaehlt"] is True
    assert client.put("/api/settings", headers=kopf, json={"land": ""}).status_code == 200
    s = client.get("/api/settings", headers=kopf).json()
    assert s["land"] == "" and s["land_gewaehlt"] is True
