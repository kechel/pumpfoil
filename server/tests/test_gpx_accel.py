"""GPX mit Beschleunigung als Erweiterung (`…:acceleration time x y z`).

Anlass 27.09.2026: eine selbstgebaute Recorder-App schreibt ~50 Hz Beschleunigung mit Zeitstempel
je Wert in ihr GPX (`urn:foil:gpx:1`). Unser Import las davon nichts — die Session wurde nur aus
GPS ausgewertet, obwohl 89.283 Messwerte in der Datei standen.
"""
import numpy as np

from app.tcximport import ACCEL_BLOCK, parse_track_bytes


def _gpx(n_gps=10, n_acc=3200, hz=50, acc_vorlauf_s=6.0):
    """GPX wie das der Nutzer-App: GPS 1 Hz, Beschleunigung `hz`, die 6 s VOR dem ersten Fix beginnt."""
    kopf = ('<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Foil" '
            'xmlns="http://www.topografix.com/GPX/1/1" '
            'xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" '
            'xmlns:foil="urn:foil:gpx:1"><trk><trkseg>')
    t_acc = [i / hz for i in range(n_acc)]
    teile, k = [kopf], 0
    for g in range(n_gps):
        t_gps = acc_vorlauf_s + g
        teile.append(f'<trkpt lat="{47.6 + g * 1e-5:.7f}" lon="11.18"><time>2026-05-25T16:00:'
                     f'{t_gps:06.3f}Z</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>'
                     f'{100 + g}</gpxtpx:hr></gpxtpx:TrackPointExtension><foil:samples>')
        # Beschleunigungswerte bis zum naechsten Fix an diesen Punkt haengen (wie im Original).
        while k < n_acc and (t_acc[k] < t_gps + 1 or g == n_gps - 1):
            z = -1.0 + 0.2 * np.sin(2 * np.pi * 1.4 * t_acc[k])
            m, sek = divmod(t_acc[k], 60)
            teile.append(f'<foil:acceleration time="2026-05-25T16:{int(m):02d}:{sek:06.3f}Z" '
                         f'x="0.25" y="0.10" z="{z:.6f}"/>')
            k += 1
        teile.append('</foil:samples></extensions></trkpt>')
    teile.append('</trkseg></trk></gpx>')
    return "".join(teile).encode()


def test_beschleunigung_wird_gelesen_mit_exakter_blockzeit():
    p = parse_track_bytes(_gpx(), "lauf.gpx")
    assert p["accel_hz"] == 50
    werte = np.frombuffer(p["accel_bytes"], dtype="<i2").reshape(-1, 3)
    assert len(werte) == 3200
    assert abs(werte[0, 0] / 2048 - 0.25) < 0.001 and abs(werte[0, 1] / 2048 - 0.10) < 0.001
    # Start = frueheste Zeit (die Beschleunigung), GPS beginnt 6 s spaeter.
    assert p["gps_samples"][0][0] == 6000
    bloecke = p["accel_chunks"]
    assert len(bloecke) == -(-3200 // ACCEL_BLOCK)
    assert bloecke[0][0] == 0 and bloecke[1][0] == round(ACCEL_BLOCK / 50 * 1000)
    assert sum(len(b) // 6 for _, b in bloecke) == 3200


def test_gpx_ohne_beschleunigung_bleibt_wie_bisher():
    p = parse_track_bytes(_gpx(n_acc=0), "lauf.gpx")
    assert p["accel_bytes"] == b"" and p["accel_hz"] == 0 and "accel_chunks" not in p
    assert p["gps_samples"][0][4] == 100


def test_upload_legt_bloecke_mit_startzeit_an(client):
    from app import models, storage
    from app.db import SessionLocal
    r = client.post("/api/auth/register", json={"email": "gpx-accel@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post("/api/sessions/upload-fit", headers=auth,
                    files={"file": ("lauf.gpx", _gpx(), "application/gpx+xml")})
    assert r.status_code == 200, r.text
    db = SessionLocal()
    try:
        s = db.get(models.Session, r.json()["id"])
        assert s.accel_hz == 50
        t0 = storage.load_accel_t0(s.session_uuid)
        assert t0[0] == 0 and t0[1] == round(ACCEL_BLOCK / 50 * 1000)
        assert len(storage.load_accel(s.session_uuid)) == 3200
    finally:
        db.close()
