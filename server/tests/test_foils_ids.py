"""GET /api/foils?ids=… — nur die genannten Eintraege (Profil-Unterzeile „Meine Foils", 03.11.2026)."""
from __future__ import annotations

import secrets


def test_foils_nach_ids(client):
    from app import models
    from app.db import SessionLocal
    r = client.post("/api/auth/register", json={"email": f"fids-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    db = SessionLocal()
    try:
        fs = [models.Foil(brand="Testmarke", model=f"M{i}", size=str(1000 + i), span_cm=80.0, area_cm2=1000.0 + i) for i in range(3)]
        db.add_all(fs); db.commit()
        ids = [f.id for f in fs]
    finally:
        db.close()
    r = client.get("/api/foils", params={"ids": f"{ids[0]},{ids[2]}"}, headers=kopf)
    assert r.status_code == 200
    assert sorted(f["id"] for f in r.json()) == sorted([ids[0], ids[2]])
    assert client.get("/api/foils", params={"ids": ""}, headers=kopf).json() == []
