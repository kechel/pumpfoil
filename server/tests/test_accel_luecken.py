"""Speicher-Sparen der Uhr: Accel nur um bewegte Abschnitte herum, dazwischen ABSICHTLICHE Luecken
(Garmin ab 1.0.92, meta.json `accel_luecken`). Geprueft wird die Zeitachse (timebase.py), dass
NUR angekuendigte Sessions die neue Regel bekommen, das Kennzeichen am Ingest und beim
Zusammenfuehren. Offline-Pruefung an 141 echten Garmin-Sessions: s. Kommentar in timebase.py.
"""
import base64
import json

import numpy as np

from app.analysis.timebase import _accel_chunk_axis, build_timebase


HZ = 26.8   # Garmin liefert real ~26,8 Hz bei 25 angefordert


def _chunks_mit_luecke(luecke_s=300.0, n_voll=1500, n_rest=700):
    """Zwei volle Chunks, ein angefangener (Luecke beginnt), nach der Luecke wieder zwei volle."""
    counts, t0, t = {}, {}, 0.0
    for i, n in enumerate([n_voll, n_voll, n_rest]):
        counts[i], t0[i] = n, int(round(t))
        t += n / HZ * 1000.0
    ende_vor_luecke = t
    t += luecke_s * 1000.0
    for i in (3, 4):
        counts[i], t0[i] = n_voll, int(round(t))
        t += n_voll / HZ * 1000.0
    return counts, t0, ende_vor_luecke, t


def test_luecke_dehnt_den_chunk_davor_nicht_mehr():
    counts, t0, ende_vor, ende = _chunks_mit_luecke()
    t_alt, _, _ = _accel_chunk_axis(counts, t0, 25.0, ende)
    t_neu, hz, grund = _accel_chunk_axis(counts, t0, 25.0, ende, luecken=True)
    rest = slice(3000, 3700)                     # die 700 Samples des angefangenen Chunks
    # alt: ueber die ganze Luecke verteilt -> letzter Wert weit in der Luecke
    assert t_alt[rest][-1] > ende_vor + 200_000
    # neu: mit der echten Rate, endet dort, wo die Uhr aufgehoert hat
    assert abs(t_neu[rest][-1] - (ende_vor - 1000.0 / HZ)) < 50
    assert abs(hz - HZ) < 0.05
    assert "Luecken" in grund
    # die vollen Chunks sind in beiden Fassungen gleich
    assert np.allclose(t_alt[:3000], t_neu[:3000])
    assert np.allclose(t_alt[3700:], t_neu[3700:])


def test_ohne_luecken_identisch():
    """Durchgehende Aufnahme: mit und ohne Kennzeichen exakt dieselbe Achse."""
    counts = {i: 1500 for i in range(10)}
    counts[9] = 412
    t0 = {i: int(round(i * 1500 / HZ * 1000)) for i in range(10)}
    a, ha, _ = _accel_chunk_axis(counts, t0, 25.0, 600_000)
    b, hb, _ = _accel_chunk_axis(counts, t0, 25.0, 600_000, luecken=True)
    assert np.array_equal(a, b) and ha == hb


def test_ohne_kennzeichen_bleibt_alles_beim_alten():
    """Der Bestand (Wear, Pausen, Handys) bekommt die neue Regel NICHT — dort ist ungeklaert, ob
    alt oder neu richtiger ist (09.10.2026: ~370 von 3284 Sessions waeren verschoben worden)."""
    counts, t0, ende_vor, ende = _chunks_mit_luecke()
    acc = np.zeros((sum(counts.values()), 3), dtype=np.int16)
    gps = [[int(t), 54.0, 10.0, 0.0, None, 5.0] for t in range(0, int(ende), 1000)]
    tb_alt = build_timebase(gps, acc, 2048, 25, chunk_counts=counts, t0_by_index=t0)
    tb_neu = build_timebase(gps, acc, 2048, 25, chunk_counts=counts, t0_by_index=t0, accel_luecken=True)
    assert tb_alt.source == tb_neu.source == "exact_chunks"
    assert tb_alt.t_accel_ms[3699] > ende_vor + 200_000
    assert tb_neu.t_accel_ms[3699] < ende_vor


def test_luecke_nach_vollem_chunk():
    """Die Luecke beginnt genau, als ein Chunk voll war (kein angefangener Rest): der volle Chunk
    vor der Luecke bekommt die Referenzrate der anderen vollen Chunks."""
    counts, t0, t = {}, {}, 0.0
    for i in range(3):
        counts[i], t0[i] = 1500, int(round(t)); t += 1500 / HZ * 1000
    ende_vor = t
    t += 120_000
    for i in (3, 4):
        counts[i], t0[i] = 1500, int(round(t)); t += 1500 / HZ * 1000
    tn, _, _ = _accel_chunk_axis(counts, t0, 25.0, t, luecken=True)
    assert tn[4499] < ende_vor


def _geraet(client, email):
    client.post("/api/auth/register", json={"email": email, "password": "geheim123", "name": "L"})
    tok = client.post("/api/auth/login", json={"email": email, "password": "geheim123"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {tok}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = client.post("/api/devices/pair", json={"code": code, "label": "fenix 5X"}).json()["device_token"]
    return {"X-Device-Token": dev}


def test_ingest_kennzeichen_landet_in_meta(client):
    from app import storage

    dev = _geraet(client, "luecken@example.com")
    r = client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": "luecken-mit", "started_at": "2026-10-09T09:00:00Z", "accel_luecken": True})
    assert r.status_code == 200, r.text
    assert storage.accel_luecken("luecken-mit") is True
    r = client.post("/api/ingest/session", headers=dev, json={
        "session_uuid": "luecken-ohne", "started_at": "2026-10-09T10:00:00Z"})
    assert r.status_code == 200, r.text
    assert storage.accel_luecken("luecken-ohne") is False
    # meta.json alter Uhren bleibt wie bisher: kein neuer Schluessel
    meta = json.loads((storage.session_dir("luecken-ohne") / "meta.json").read_text())
    assert "accel_luecken" not in meta


def test_zusammenfuehren_trennt_an_luecken():
    from app import storage
    from app.merge import _save_accel_mit_ankern

    t1 = np.arange(800) / HZ * 1000.0
    t2 = t1[-1] + 200_000 + np.arange(600) / HZ * 1000.0
    arr = np.zeros((1400, 3), dtype=np.int16)
    t = np.concatenate([t1, t2])
    n = _save_accel_mit_ankern("merge-luecken-test", [(arr, t)], luecken=True)
    t0 = storage.load_accel_t0("merge-luecken-test")
    # 800 -> 500 + 300, dann neuer Chunk an der Luecke: 500 + 100
    assert n == 4
    assert t0[2] == int(round(t2[0]))
    storage.markiere_accel_luecken("merge-luecken-test")
    assert storage.accel_luecken("merge-luecken-test") is True
    # ohne Kennzeichen: wie bisher, Chunks laufen ueber die Luecke
    assert _save_accel_mit_ankern("merge-ohne-test", [(arr, t)]) == 3


def test_speicherbudget_median_statt_minimum(client):
    from app.db import SessionLocal
    from app import models
    from app.api.devices import _storage_budget_kb

    db = SessionLocal()
    try:
        u = models.User(email="budget@example.com", password_hash="x")
        db.add(u); db.flush()
        geraete = []
        for i, kb in enumerate([105, 178, 190, 0]):
            d = models.DeviceToken(user_id=u.id, token=f"budget-tok-{i}", label="Instinct 2X",
                                   platform="garmin", part_number="006-TEST-I2X", storage_full_kb=kb)
            db.add(d); geraete.append(d)
        db.commit()
        # eigene Messung sticht
        assert _storage_budget_kb(db, geraete[0]) == 105
        # ohne eigene: Median der drei Messungen, nicht der Ausreisser 105
        assert _storage_budget_kb(db, geraete[3]) == 178
    finally:
        db.rollback(); db.close()
