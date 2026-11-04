"""Vorschau der eigenen Profilseite (Home › Profil, 04.11.2026): `als=freunde|alle` zeigt dem Besitzer, was Freunde bzw.
alle anderen sehen — und schaltet auf FREMDEN Seiten nichts frei."""
from __future__ import annotations


def _konto(client, mail: str) -> tuple[int, dict]:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:   # Registrieren ist auf 5/h begrenzt; die Testsuite registriert davor schon viele Konten
        db.query(models.RateEvent).delete()
        db.commit()
    finally:
        db.close()
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def test_vorschau_freunde_und_alle(client):
    ich, k = _konto(client, "vs-a@t.de")
    r = client.put("/api/settings", headers=k, json={
        "public_profile": {"enabled": True, "foil": False}, "weight_kg": 77})
    assert r.status_code == 200, r.text
    url = f"/api/community/foiler/{ich}?titel=false"
    eigen = client.get(url, headers=k).json()
    assert eigen["gewicht_kg"] == 77 and eigen["zeigt"]["foil"] is False
    alle = client.get(url + "&als=alle", headers=k).json()
    assert "gewicht_kg" not in alle and alle["zeigt"]["foil"] is False
    freunde = client.get(url + "&als=freunde", headers=k).json()
    assert freunde["gewicht_kg"] == 77 and all(freunde["zeigt"].values())

    # Seite ganz aus: „alle" sagt ausgeblendet, Freunde sehen sie trotzdem.
    client.put("/api/settings", headers=k, json={"public_profile": {"enabled": False}})
    alle = client.get(url + "&als=alle", headers=k).json()
    assert alle.get("vorschau_ausgeblendet") is True and "rekorde" not in alle
    assert client.get(f"/api/community/foiler/{ich}/titel?als=alle", headers=k).json() == {}
    assert client.get(url + "&als=freunde", headers=k).json().get("vorschau_ausgeblendet") is None


def test_als_freunde_auf_fremder_seite_wirkungslos(client):
    a, ka = _konto(client, "vs-b@t.de")
    b, kb = _konto(client, "vs-c@t.de")
    client.put("/api/settings", headers=kb, json={"public_profile": {"enabled": True, "foil": False}, "weight_kg": 90})
    d = client.get(f"/api/community/foiler/{b}?titel=false&als=freunde", headers=ka).json()
    assert "gewicht_kg" not in d and d["zeigt"]["foil"] is False
    client.put("/api/settings", headers=kb, json={"public_profile": {"enabled": False}})
    assert client.get(f"/api/community/foiler/{b}?als=freunde", headers=ka).status_code == 404
    assert client.get(f"/api/community/foiler/{b}?als=alle", headers=ka).status_code == 404
