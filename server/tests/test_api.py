"""End-to-End-Test: Register -> Pairing -> Ingest -> Analyse -> Anzeige -> Label."""
from __future__ import annotations

import base64
import math

import numpy as np


def _gps_chunk(n=60, v=5.0):
    lat, lon = 54.0, 10.0
    out = []
    for i in range(n):
        out.append([i * 1000, lat, lon, v, 130, 5.0])
        lon += (v / (111_320.0 * math.cos(math.radians(lat))))
    return out


def _accel_chunk_b64(n=750, scale=2048):
    # Sinus-Pumpen ~1 Hz auf z-Achse, int16, 3 Achsen interleaved.
    t = np.arange(n) / 25.0
    z = (np.sin(2 * math.pi * 1.0 * t) * 0.5 * scale).astype("<i2")
    x = np.zeros(n, dtype="<i2")
    y = np.zeros(n, dtype="<i2")
    inter = np.empty(n * 3, dtype="<i2")
    inter[0::3] = x
    inter[1::3] = y
    inter[2::3] = z
    return base64.b64encode(inter.tobytes()).decode()


def test_full_flow(client):
    # 1. Registrieren
    r = client.post("/api/auth/register", json={"email": "a@b.de", "password": "supersecret"})
    assert r.status_code == 200, r.text
    jwt = r.json()["access_token"]
    auth = {"Authorization": f"Bearer {jwt}"}

    # 2. Pairing-Code (Website)
    r = client.post("/api/devices/pairing-code", headers=auth)
    assert r.status_code == 200, r.text
    code = r.json()["code"]

    # 3. Uhr löst Code ein
    r = client.post("/api/devices/pair", json={"code": code, "label": "Fenix 7X"})
    assert r.status_code == 200, r.text
    dev = {"X-Device-Token": r.json()["device_token"]}

    # 4. Session anmelden
    uuid = "test-uuid-001"
    r = client.post(
        "/api/ingest/session",
        headers=dev,
        json={"session_uuid": uuid, "started_at": "2026-06-20T09:00:00Z"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["received_chunks"] == []

    # 5. GPS- und Accel-Chunk hochladen
    r = client.post(
        f"/api/ingest/session/{uuid}/chunk",
        headers=dev,
        json={"index": 0, "kind": "gps", "encoding": "json", "data": _gps_chunk()},
    )
    assert r.status_code == 200, r.text
    r = client.post(
        f"/api/ingest/session/{uuid}/chunk",
        headers=dev,
        json={"index": 0, "kind": "accel", "encoding": "int16-b64", "data": _accel_chunk_b64()},
    )
    assert r.status_code == 200, r.text

    # Resume: received_chunks zeigt jetzt index 0
    r = client.post(
        "/api/ingest/session",
        headers=dev,
        json={"session_uuid": uuid, "started_at": "2026-06-20T09:00:00Z"},
    )
    assert 0 in r.json()["received_chunks"]

    # 6. Abschließen -> Analyse läuft
    r = client.post(
        f"/api/ingest/session/{uuid}/complete",
        headers=dev,
        json={"ended_at": "2026-06-20T09:01:00Z", "total_chunks": 1},
    )
    assert r.status_code == 200, r.text
    session_id = r.json()["session_id"]

    # 7. Session anzeigen (Web) -> Analyse vorhanden, Foiling erkannt
    r = client.get(f"/api/sessions/{session_id}", headers=auth)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "analyzed"
    # total_distance ist modell-unabhängig; Foiling-Erkennung wird in test_analysis geprüft.
    assert body["analysis"]["total_distance_m"] > 0
    assert body["analysis"]["track_geojson"]["geometry"]["type"] == "LineString"

    # 7b. Rohdaten abrufen (für Labeling/Charts)
    r = client.get(f"/api/sessions/{session_id}/raw", headers=auth)
    assert r.status_code == 200, r.text
    raw = r.json()
    assert len(raw["gps_t_ms"]) == 60
    assert len(raw["accel_mag_g"]) == len(raw["accel_t_ms"]) > 0
    assert raw["accel_hz_effective"] == 25.0 / 4

    # 8. Label setzen
    r = client.post(
        f"/api/sessions/{session_id}/labels",
        headers=auth,
        json={"t_start_ms": 0, "t_end_ms": 5000, "label": "pump"},
    )
    assert r.status_code == 200, r.text
    r = client.get(f"/api/sessions/{session_id}/labels", headers=auth)
    assert len(r.json()) == 1


def test_live_partial_sync_flow(client):
    """Inkrementeller Sync während der Aufnahme: /analyze hält Session 'live' und
    rechnet die bisherigen Daten neu; gleiche UUID -> eine Session (kein Duplikat);
    /complete schließt ab."""
    r = client.post("/api/auth/register", json={"email": "live@b.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}

    uuid = "live-uuid-001"
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-06-20T09:00:00Z"})
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "gps", "encoding": "json", "data": _gps_chunk()})
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "accel", "encoding": "int16-b64", "data": _accel_chunk_b64()})

    # Zwischenanalyse während noch "aufgenommen" wird.
    r = client.post(f"/api/ingest/session/{uuid}/analyze", headers=dev)
    assert r.status_code == 200, r.text
    sid = r.json()["session_id"]
    body = client.get(f"/api/sessions/{sid}", headers=auth).json()
    assert body["status"] == "live"
    assert body["analysis"]["total_distance_m"] > 0

    # Re-Start derselben UUID legt KEINE zweite Session an.
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-06-20T09:00:00Z"})
    n = (len(client.get("/api/sessions?filter=pump", headers=auth).json())
         + len(client.get("/api/sessions?filter=other", headers=auth).json()))
    assert n == 1

    # Abschluss -> analyzed.
    client.post(f"/api/ingest/session/{uuid}/complete", headers=dev,
                json={"ended_at": "2026-06-20T09:02:00Z", "total_chunks": 1})
    assert client.get(f"/api/sessions/{sid}", headers=auth).json()["status"] == "analyzed"


def test_auth_required(client):
    assert client.get("/api/sessions").status_code in (401, 403)
    assert client.post("/api/ingest/session", json={}).status_code in (401, 403, 422)


def test_pair_with_bad_code(client):
    r = client.post("/api/devices/pair", json={"code": "ZZZZZZ"})
    assert r.status_code == 400


def test_mint_device_token(client):
    # Companion-Pairing: eingeloggte App mintet direkt ein Device-Token.
    r = client.post("/api/auth/register", json={"email": "mint@b.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post("/api/devices/mint?label=Apple%20Watch", headers=auth)
    assert r.status_code == 200, r.text
    assert r.json()["device_token"]
    # ohne Auth nicht erlaubt
    assert client.post("/api/devices/mint").status_code in (401, 403)


def test_reverse_pairing_flow(client):
    # Uhr erzeugt Code (pair-init) -> Web-User löst ein (pair-claim) -> Uhr pollt (pair-poll).
    r = client.post("/api/auth/register", json={"email": "rev@b.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    init = client.post("/api/devices/pair-init").json()
    code, claim = init["code"], init["claim_token"]
    # vor dem Einlösen: noch kein Token
    assert client.get(f"/api/devices/pair-poll?claim_token={claim}").json()["device_token"] is None
    # Einlösen durch eingeloggten User
    assert client.post("/api/devices/pair-claim", json={"code": code}, headers=auth).json()["ok"] is True
    # danach liefert das Polling das Device-Token
    assert client.get(f"/api/devices/pair-poll?claim_token={claim}").json()["device_token"]


def test_like_state_in_detail(client):
    # get_session muss liked/like_count korrekt liefern (Apps/Web bauen darauf auf).
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "liker@b.de", "password": "supersecret"}).json()["access_token"]}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    uuid = "like-uuid-001"
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-06-20T09:00:00Z"})
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "gps", "encoding": "json", "data": _gps_chunk()})
    client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                json={"index": 0, "kind": "accel", "encoding": "int16-b64", "data": _accel_chunk_b64()})
    sid = client.post(f"/api/ingest/session/{uuid}/complete", headers=dev,
                      json={"ended_at": "2026-06-20T09:01:00Z", "total_chunks": 1}).json()["session_id"]
    # vor dem Like
    body = client.get(f"/api/sessions/{sid}", headers=auth).json()
    assert body["liked"] is False and body["like_count"] == 0
    # Like umschalten
    r = client.post(f"/api/community/sessions/{sid}/like", headers=auth).json()
    assert r["liked"] is True and r["like_count"] == 1
    # get_session spiegelt den Zustand
    body = client.get(f"/api/sessions/{sid}", headers=auth).json()
    assert body["liked"] is True and body["like_count"] == 1


def test_settings_roundtrip(client):
    # Apps (Foils-Katalog) persistieren my_foils/foil_id via PUT /api/settings.
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "settings@b.de", "password": "supersecret"}).json()["access_token"]}
    r = client.put("/api/settings", headers=auth, json={
        "my_foils": [3, 1, 2], "foil_id": 2, "weight_kg": 88,
        "off_foil_view": [12, 17, 99],   # 99 ist ungültig -> wird gefiltert
    })
    assert r.status_code == 200, r.text
    s = client.get("/api/settings", headers=auth).json()
    assert s.get("my_foils") == [1, 2, 3]   # sortiert + dedupliziert
    assert s.get("foil_id") == 2
    assert s.get("weight_kg") == 88
    assert s.get("off_foil_view") == [12, 17]   # gültige Feld-IDs (0..20), 99 raus


def test_foils_and_stats_shapes(client):
    # Endpoints, auf denen Foils-Katalog/-Rechner/-Statistik der Apps bauen.
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "foils@b.de", "password": "supersecret"}).json()["access_token"]}
    assert isinstance(client.get("/api/foils", headers=auth).json(), list)
    assert isinstance(client.get("/api/foils/brands", headers=auth).json(), list)
    assert isinstance(client.get("/api/community/foil-stats", headers=auth).json(), list)


def test_mint_token_can_ingest(client):
    # Companion-gemintetes Token muss für den echten Upload-Pfad funktionieren.
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "mintingest@b.de", "password": "supersecret"}).json()["access_token"]}
    tok = client.post("/api/devices/mint?label=Apple%20Watch", headers=auth).json()["device_token"]
    dev = {"X-Device-Token": tok}
    r = client.post("/api/ingest/session", headers=dev,
                    json={"session_uuid": "mint-ingest-1", "started_at": "2026-06-20T09:00:00Z"})
    assert r.status_code == 200, r.text
    assert r.json()["received_chunks"] == []


def test_device_config_includes_foil_alarms(client):
    # /api/devices/config liefert je my_foil den Auto-Alarm-Korridor (Uhr-Picker).
    auth = {"Authorization": "Bearer " + client.post(
        "/api/auth/register", json={"email": "cfgfoils@b.de", "password": "supersecret"}).json()["access_token"]}
    foils = client.get("/api/foils", headers=auth).json()
    assert foils, "Test-DB sollte Foils enthalten (foils.json seed)"
    fid = foils[0]["id"]
    client.put("/api/settings", headers=auth, json={"my_foils": [fid], "weight_kg": 95})
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    cfg = client.get("/api/devices/config", headers=dev).json()
    assert "foils" in cfg
    mine = [f for f in cfg["foils"] if f["id"] == fid]
    assert len(mine) == 1
    f = mine[0]
    assert f["label"] and 0 < f["min"] < f["max"]   # sinnvoller Korridor
