"""Magnetometer-Kanal (kind="mag") — fuer vorn/hinten am Brett per Kompass (docs/GROUND-TRUTH.md 12d).

Wie der Gyro-Kanal: ankommen, richtig abgelegt werden, im Fortschritt mitzaehlen, nichts
Bestehendes verschieben. Ausgewertet wird er erst, wenn das Kompass-Verfahren steht.
"""
import numpy as np

from test_gyro_channel import _dreiachs_b64, _geraet, _gps_chunk


def test_mag_chunk_wird_abgelegt_und_zaehlt_mit(client):
    from app import storage

    auth, dev = _geraet(client)
    uuid = "mag-uuid-001"
    r = client.post("/api/ingest/session", headers=dev,
                    json={"session_uuid": uuid, "started_at": "2026-09-27T09:00:00Z",
                          "accel_hz": 50, "placement": "board"})
    assert r.status_code == 200, r.text
    for index, kind, daten in ((0, "gps", _gps_chunk()), (1, "accel", _dreiachs_b64()),
                               (2, "gyro", _dreiachs_b64()), (3, "mag", _dreiachs_b64(amplitude=450))):
        enc = "json" if kind == "gps" else "int16-b64"
        r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                        json={"index": index, "kind": kind, "encoding": enc,
                              "t0_ms": index * 1000, "data": daten})
        assert r.status_code == 200, (kind, r.text)
    d = storage.session_dir(uuid)
    assert (d / "mag" / "3.bin").exists() and (d / "mag" / "3.t0").read_text() == "3000"
    assert not (d / "gyro" / "3.bin").exists() and not (d / "accel" / "3.bin").exists()
    m = storage.load_mag(uuid)
    assert m.shape == (750, 3) and 440 <= int(np.abs(m[:, 2]).max()) <= 450   # ~45 µT bei 10/µT
    assert storage.load_mag_t0(uuid) == {3: 3000}
    liste = client.get("/api/sessions/in-progress", headers=auth).json()
    eintrag = next(e for e in liste if e["session_uuid"] == uuid)
    assert eintrag["upload_received"] == 4 and eintrag["accel_received"] == 1


def test_mag_verlangt_base64_string(client):
    _, dev = _geraet(client)
    uuid = "mag-uuid-002"
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-09-27T09:00:00Z"})
    r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                    json={"index": 0, "kind": "mag", "encoding": "int16-b64", "data": [[1, 2, 3]]})
    assert r.status_code == 400
