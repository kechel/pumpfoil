"""Kompakte Uhr-Konfiguration (/api/devices/config-kompakt, app/kompakt_config.py).

Die Testvektoren teilt sich der Server mit der Suunto-App (watch-suunto/test/kompakt.test.mjs liest
denselben Text und muss die erwartete Konfiguration herausbekommen)."""
from __future__ import annotations

import json
from pathlib import Path

FIX = Path(__file__).resolve().parents[2] / "watch-suunto" / "test" / "fixtures" / "kompakt.json"


def test_testvektoren_stimmen():
    from app.kompakt_config import kompakt
    for f in json.loads(FIX.read_text()):
        assert kompakt(f["cfg"], f["std"]) == f["kompakt"], f["name"]
        assert all(ord(c) < 128 for c in f["kompakt"])


def test_endpunkt_liefert_kleinen_text_mit_std(client):
    from app import standard_layouts as SL
    jwt = client.post("/api/auth/register", json={"email": "kompakt@b.de", "password": "supersecret"}).json()["access_token"]
    tok = client.post("/api/devices/mint", params={"label": "Suunto Race"},
                      headers={"Authorization": f"Bearer {jwt}"}).json()["device_token"]
    r = client.get("/api/devices/config-kompakt", params={"p": "suunto", "std": SL.pruefsumme()},
                   headers={"X-Device-Token": tok})
    assert r.status_code == 200
    k = json.loads(r.text)
    assert k["P"] == "s" and k["F"] == "s" and k["Q"] == "s"
    assert len(r.text) < 100, r.text
    # ohne passende Pruefsumme: die Layouts selbst
    r2 = client.get("/api/devices/config-kompakt", params={"p": "suunto", "std": 1}, headers={"X-Device-Token": tok})
    assert json.loads(r2.text)["P"][0].startswith("1,")
