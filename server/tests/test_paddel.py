"""Paddelschlaege und Paddle-up-Versuche (app/paddel.py, 20.10.2026) an kuenstlichen Daten."""
import numpy as np

from app import paddel

HZ = 25.0


def _sitzung(abschnitte):
    """abschnitte: (Dauer s, Schlagfrequenz Hz, Ausschlag, Tempo km/h) -> t_s, accel, gps."""
    t, acc, gps, t0 = [], [], [], 0.0
    for dauer, fq, amp, kmh in abschnitte:
        n = int(dauer * HZ)
        tt = t0 + np.arange(n) / HZ
        z = 1.0 + amp * np.maximum(np.sin(2 * np.pi * fq * tt), 0) ** 4
        t.append(tt)
        acc.append(np.c_[np.zeros(n), np.zeros(n), z])
        gps += [[int(s * 1000), 47.0, 8.0, kmh / 3.6] for s in np.arange(t0, t0 + dauer, 1.0)]
        t0 += dauer
    return np.concatenate(t), np.concatenate(acc), gps


def test_schlaege_sprint_und_foil():
    t, acc, gps = _sitzung([(120, 0.8, 0.2, 5), (6, 1.2, 0.6, 7), (40, 1.7, 0.6, 14), (120, 0.8, 0.2, 5),
                            (6, 1.2, 0.6, 7), (60, 0.8, 0.2, 5)])
    lauf = (126.0, 166.0)
    e = paddel.auswerten(t, acc, HZ, gps, [lauf])
    assert e is not None
    # ~0,8 Hz in rund 300 s normalem Paddeln -> um 48 Schlaege/min
    assert 40 <= e["schlaege_pro_min"] <= 55
    assert [v["ergebnis"] for v in e["versuche"]] == ["foil", "nein"]
    assert e["auf_foil"] == 1 and e["versuche"][0]["foil_s"] == 40.0
    assert 5 <= e["versuche"][0]["schlaege"] <= 9


def test_kurz_ohne_lauf():
    t, acc, gps = _sitzung([(120, 0.8, 0.2, 5), (6, 1.2, 0.6, 7), (2, 1.2, 0.6, 11), (60, 0.8, 0.2, 5)])
    e = paddel.auswerten(t, acc, HZ, gps, [])
    assert [v["ergebnis"] for v in e["versuche"]] == ["kurz"]


def test_zu_wenig_daten():
    t, acc, gps = _sitzung([(20, 0.8, 0.2, 5)])
    assert paddel.auswerten(t, acc, HZ, gps, []) is None


def test_endpunkt_nur_sup(client):
    from datetime import datetime, timezone
    r = client.post("/api/auth/register", json={"email": "paddel@x.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    ids = []
    for h, uuid, sport in ((10, "pad1", "sup_paddle"), (14, "pad2", "pumpfoil")):
        t = datetime(2026, 7, 1, h, tzinfo=timezone.utc).isoformat()
        client.post("/api/ingest/session", headers=dev, json={"session_uuid": uuid, "started_at": t, "sport_class": sport})
    from app.db import SessionLocal
    from app.models import Session as S
    db = SessionLocal()
    ids = [x.id for x in db.query(S).filter(S.session_uuid.in_(["pad1", "pad2"]))]
    db.close()
    assert len(ids) == 2
    for sid in ids:
        r = client.get(f"/api/sessions/{sid}/paddel", headers=auth)
        assert r.status_code == 200 and r.json() is None   # ohne Accel bzw. nicht SUP: nichts
