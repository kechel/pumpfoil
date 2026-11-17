"""Sprint-Bestenlisten im Team (17.11.2026, Nutzerwunsch): nur mit `?sprint=1`, nur Pumpfoil/Foil Scoot, alte Clients
bekommen sie nicht und verlieren sie beim Speichern nicht."""
from __future__ import annotations

import secrets


def _konto(client, mail: str):
    mail = mail.replace("@", f"-{secrets.token_hex(3)}@")
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_sprint_tafeln_im_team(client):
    kopf = _konto(client, "team-sprint@b.de")
    r = client.post("/api/teams", headers=kopf, json={"name": "Sprint " + secrets.token_hex(3)})
    assert r.status_code == 200, r.text
    slug = r.json()["slug"]
    tafeln = [{"kennzahl": "session_pumps"}, {"kennzahl": "sprint_100m"}, {"kennzahl": "sprint_60s"}]
    # alter Client (ohne sprint=1): Sprint-Kennzahl wird abgelehnt
    assert client.put(f"/api/teams/{slug}/tafeln", headers=kopf, json=tafeln).status_code == 422
    # nur Pumpfoil/Foil Scoot
    assert client.put(f"/api/teams/{slug}/tafeln?sprint=1", headers=kopf,
                      json=[{"kennzahl": "sprint_100m", "sportart": "wingfoil"}]).status_code == 422
    r = client.put(f"/api/teams/{slug}/tafeln?sprint=1", headers=kopf, json=tafeln)
    assert r.status_code == 200, r.text
    assert [x["kennzahl"] for x in r.json()["tafeln"]] == ["session_pumps", "sprint_100m", "sprint_60s"]
    # alter Client sieht sie nicht ...
    alt = client.get(f"/api/teams/{slug}/bestenlisten", headers=kopf).json()
    assert [x["kennzahl"] for x in alt["tafeln"]] == ["session_pumps"]
    neu = client.get(f"/api/teams/{slug}/bestenlisten?sprint=1", headers=kopf).json()
    assert [x["kennzahl"] for x in neu["tafeln"]] == ["session_pumps", "sprint_100m", "sprint_60s"]
    # ... und loescht sie beim Speichern nicht
    assert client.put(f"/api/teams/{slug}/tafeln", headers=kopf, json=[{"kennzahl": "sum_pumps"}]).status_code == 200
    neu = client.get(f"/api/teams/{slug}/bestenlisten?sprint=1", headers=kopf).json()
    assert [x["kennzahl"] for x in neu["tafeln"]] == ["sum_pumps", "sprint_100m", "sprint_60s"]
