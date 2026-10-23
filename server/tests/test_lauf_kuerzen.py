"""„Anfang/Ende kürzen" (Web, 23.10.2026): ein aussortierter Bereich am Rand eines Laufs kürzt genau diesen
Lauf — der Kürzen-Dialog (web/src/components/LaufKuerzen.tsx) speichert nichts anderes."""


def _konto(client, mail):
    tok = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": "Bearer " + tok}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    return auth, uhr


def _gps_lauf(client, uhr, uuid):
    """60 s stehen, 120 s mit 6 m/s geradeaus, 60 s stehen — ein GPS-Lauf."""
    assert client.post("/api/ingest/session", headers=uhr, json={
        "session_uuid": uuid, "started_at": "2026-10-20T10:00:00Z", "sport": "pumpfoil",
        "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000}).status_code == 200
    pts, x = [], 0.0
    for i in range(240):
        v = 6.0 if 60 <= i < 180 else 0.0
        x += v
        lat = 47.0 + x / 111_320.0
        pts.append([i * 1000, lat, 9.0, 4.0, 120, v])
    assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
        "index": 0, "kind": "gps", "encoding": "json", "data": pts}).status_code == 200
    r = client.post(f"/api/ingest/session/{uuid}/complete", headers=uhr, json={"total_chunks": 1})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


def _laeufe(client, auth, sid):
    a = client.get(f"/api/sessions/{sid}", headers=auth).json()["analysis"]
    return [(s["t_start_ms"], s["t_end_ms"]) for s in (a or {}).get("segments") or []]


def test_rand_aussortieren_kuerzt_den_lauf(client):
    auth, uhr = _konto(client, "lauf-kuerzen@b.de")
    sid = _gps_lauf(client, uhr, "lauf-kuerzen-1")
    vorher = _laeufe(client, auth, sid)
    assert len(vorher) == 1, vorher
    von, bis = vorher[0]
    # Ende um 30 s kuerzen (so schickt es der Dialog: [neues Ende, altes Ende], Session-ms; hier kein Trim)
    r = client.post(f"/api/sessions/{sid}/runs/exclude", headers=auth, json={"start_ms": bis - 30_000, "end_ms": bis})
    assert r.status_code == 200, r.text
    nachher = _laeufe(client, auth, sid)
    assert len(nachher) == 1, nachher
    assert abs(nachher[0][0] - von) <= 2000                       # Anfang bleibt
    assert abs(nachher[0][1] - (bis - 30_000)) <= 3000            # Ende ~30 s frueher
    # rueckgaengig ueber den Hinweis-Kasten: Bereich wieder aufnehmen
    assert client.post(f"/api/sessions/{sid}/runs/include", headers=auth, json={"range_index": 0}).status_code == 200
    assert abs(_laeufe(client, auth, sid)[0][1] - bis) <= 2000
