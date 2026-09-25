"""Speicherarme Uhren (Forerunner 55 & Co.) starten beim Verknuepfen auf GPS-only.

Jan, 22.09.2026: „lass uns die fr55 bei neu registrierung automatisch immer entsprechend auf
gps-only stellen … also beim neu verknuepfen dieser uhr mit einem konto".

Der Anlass steht in `_gps_only_wenn_speicherarm`: die bisherige Kappung `full -> lite` halbiert
nur die Rate, und auch 10 Hz haelt die Uhr nicht durch (an Nutzer 533 gemessen: 1,6-2,5 Hz). Die
Aufnahme faellt damit ohnehin unter das 15-Hz-Tor und wird als `gps_only` ausgewertet — die
Accel-Daten kosten also nur Puffer und Abstuerze und tragen nichts bei.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest

from app import models
from app.api import devices
from app.db import SessionLocal

FR55 = "006-B4838-00"
FENIX7 = "006-B3906-00"


@pytest.fixture(autouse=True)
def _partmap(monkeypatch):
    """Die Part-Number-Tabelle fuer diese Tests selbst mitbringen.

    WARUM (25.09.2026): `devices._partmap()` liest `watch/bin/partmap.json` — das ist AUSGABE des
    Garmin-Builds und steht in `.gitignore`. Auf dieser Entwickler-VM existiert sie, in der CI
    nicht. Genau daran sind drei dieser Tests ab dem 22.09. in der CI gescheitert, waehrend sie
    lokal gruen blieben: ohne Tabelle heisst jede Part-Number „unbekannt", die Forerunner 55 wird
    nicht als speicherarm erkannt und der Aufnahmemodus bleibt auf `full`.

    Ein Test darf nicht an einer Datei haengen, die im Repo gar nicht liegen kann. Er bringt
    deshalb genau die zwei Zeilen mit, um die es ihm geht — und wird dadurch nebenbei
    unabhaengig davon, was gerade zuletzt gebaut wurde.
    """
    monkeypatch.setattr(devices, "_partmap", lambda: {
        # WOERTLICH wie im echten Build, samt ®: `_is_low_accel_model` vergleicht den Namen als
        # Teilzeichenkette gegen `_LOW_ACCEL_MODEL_HINTS`, und dort steht „Forerunner® 55".
        # Ohne das ® greift die Erkennung nicht — beim ersten Anlauf genau so passiert.
        FR55: {"id": "fr55", "name": "Forerunner\u00ae 55"},
        FENIX7: {"id": "fenix7", "name": "f\u0113nix\u00ae 7 / quatix\u00ae 7"},
    })


def _konto(client, kennung: str) -> dict:
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _paaren(client, auth: dict, label: str) -> dict:
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": label}).json()
    return {"X-Device-Token": paar["device_token"]}


def _config(client, dev: dict, pn: str | None = None) -> dict:
    url = "/api/devices/config?p=garmin&v=1.0.88" + (f"&pn={pn}" if pn else "")
    r = client.get(url, headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def test_fr55_am_label_erkannt_startet_auf_gps(client):
    """Meldet die Uhr ihren Modellnamen schon beim Pairing, greift es sofort."""
    auth = _konto(client, "fr55-label")
    dev = _paaren(client, auth, "Forerunner® 55")
    assert _config(client, dev)["recordMode"] == "gps"


def test_fr55_erst_an_der_part_number_erkannt(client):
    """Beim Pairing steht oft nur „Garmin" — die Hardware verraet sich erst beim ersten Config."""
    auth = _konto(client, "fr55-partnummer")
    dev = _paaren(client, auth, "Garmin")
    assert _config(client, dev)["recordMode"] == "full"      # noch unbekannt
    assert _config(client, dev, FR55)["recordMode"] == "gps"  # jetzt steht es fest
    assert _config(client, dev)["recordMode"] == "gps"        # und es bleibt


def test_normale_uhr_bleibt_auf_full(client):
    """Eine Uhr mit genug Speicher wird nicht angefasst."""
    auth = _konto(client, "fr55-fenix")
    dev = _paaren(client, auth, "Garmin")
    assert _config(client, dev, FENIX7)["recordMode"] == "full"


def test_eigene_einstellung_wird_nicht_ueberschrieben(client):
    """Wer 'full' bewusst waehlt, behaelt es — auch auf einer FR55."""
    auth = _konto(client, "fr55-eigene-wahl")
    dev = _paaren(client, auth, "Garmin")
    gid = client.get("/api/devices/list", headers=auth).json()[0]["id"]
    r = client.put(f"/api/devices/{gid}/record-mode", headers=auth, json={"record_mode": "full"})
    assert r.status_code == 200, r.text
    # 'full' wird auf einer speicherarmen Uhr weiterhin auf 'lite' gekappt — aber eben nicht auf
    # 'gps' gezwungen. Die Entscheidung des Nutzers bleibt stehen.
    assert _config(client, dev, FR55)["recordMode"] == "lite"


def test_wer_schon_gefahren_ist_wird_nicht_umgestellt(client):
    """Rueckwirkungsfrei: nur beim VERKNUEPFEN, nicht bei einer Uhr mit Historie."""
    auth = _konto(client, "fr55-historie")
    dev = _paaren(client, auth, "Garmin")
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    gid = client.get("/api/devices/list", headers=auth).json()[0]["id"]
    db = SessionLocal()
    try:
        db.add(models.Session(session_uuid=str(uuid.uuid4()), user_id=uid, device_id=gid,
                              started_at=datetime(2026, 9, 1, 9, 0, tzinfo=timezone.utc),
                              status="done"))
        db.commit()
    finally:
        db.close()
    assert _config(client, dev, FR55)["recordMode"] == "lite"
