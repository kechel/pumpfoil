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


def _chunks_mit_luecke(luecke_s=300.0, n_voll=1500, n_rest=700, hz=HZ, paket_s=1.0):
    """Zwei volle Chunks, ein angefangener (Luecke beginnt), nach der Luecke wieder zwei volle. t0 =
    Ankunft des ersten, t1 = Ankunft des letzten Pakets (wie die Uhr ab 1.0.92)."""
    counts, t0, t1, t = {}, {}, {}, 0.0
    for i, n in enumerate([n_voll, n_voll, n_rest]):
        counts[i], t0[i] = n, int(round(t))
        t += n / hz * 1000.0
        t1[i] = int(round(t - paket_s * 1000))
    ende_vor_luecke = t
    t += luecke_s * 1000.0
    for i in (3, 4):
        counts[i], t0[i] = n_voll, int(round(t))
        t += n_voll / hz * 1000.0
        t1[i] = int(round(t - paket_s * 1000))
    return counts, t0, t1, ende_vor_luecke, t


def test_luecke_dehnt_den_chunk_davor_nicht_mehr():
    counts, t0, t1, ende_vor, ende = _chunks_mit_luecke()
    t_alt, _, _ = _accel_chunk_axis(counts, t0, 25.0, ende)
    t_neu, hz, grund = _accel_chunk_axis(counts, t0, 25.0, ende, luecken=True, t1_by_index=t1)
    rest = slice(3000, 3700)                     # die 700 Samples des angefangenen Chunks
    assert t_alt[rest][-1] > ende_vor + 200_000  # alt: ueber die Luecke verteilt
    assert abs(t_neu[rest][-1] - (ende_vor - 1000.0 / HZ)) < 50
    assert abs(hz - HZ) < 0.05
    assert "Luecken" in grund
    assert np.allclose(t_alt[:3000], t_neu[:3000])
    assert np.allclose(t_alt[3700:], t_neu[3700:])


def test_fr55_echte_rate_viel_niedriger_als_angefordert():
    """#14075 (09.10.2026): FR55 fordert 10 Hz an, liefert ~2,5 Hz in Paketen alle ~3 s, und mit Sparen
    ist kein Chunk voll. Die erste Fassung fand keine Referenz und die Bandpruefung (2,5/10 < 0,5) warf
    die exakte Achse weg -> Durchschnittsrate quer ueber die Luecken. Mit t1 bleibt die Achse exakt."""
    counts = {0: 510, 1: 210, 2: 530}
    t0 = {0: 111_000, 1: 315_000, 2: 522_000}
    t1 = {0: 312_000, 1: 396_000, 2: 732_000}       # 0->1 lueckenlos (ein Paket), 1->2 Luecke
    t, hz, grund = _accel_chunk_axis(counts, t0, 10.0, 740_000, luecken=True, t1_by_index=t1)
    assert t is not None and "Luecken" in grund
    assert abs(hz - 2.5) < 0.05
    assert t[719] < 400_000                         # Chunk 1 endet vor der Luecke, nicht bei 522 s
    # ohne Kennzeichen: wie bisher (Band verwirft -> Rueckfall der Aufrufer)
    alt, _, _ = _accel_chunk_axis(counts, t0, 10.0, 740_000)
    assert alt is None


def test_ohne_luecken_identisch():
    """Durchgehende Aufnahme: mit und ohne Kennzeichen exakt dieselbe Achse."""
    counts = {i: 1500 for i in range(10)}
    counts[9] = 412
    t0 = {i: int(round(i * 1500 / HZ * 1000)) for i in range(10)}
    t1 = {i: int(round((i + 1) * 1500 / HZ * 1000)) - 1000 for i in range(10)}
    a, ha, _ = _accel_chunk_axis(counts, t0, 25.0, 600_000)
    b, hb, _ = _accel_chunk_axis(counts, t0, 25.0, 600_000, luecken=True, t1_by_index=t1)
    assert np.allclose(a[:-412], b[:-412]) and abs(ha - hb) < 1e-9


def test_ohne_kennzeichen_bleibt_alles_beim_alten():
    """Der Bestand (Wear, Pausen, Handys) bekommt die Lueckenregel NICHT — auch wenn t1 da waere."""
    counts, t0, t1, ende_vor, ende = _chunks_mit_luecke()
    acc = np.zeros((sum(counts.values()), 3), dtype=np.int16)
    gps = [[int(t), 54.0, 10.0, 0.0, None, 5.0] for t in range(0, int(ende), 1000)]
    tb_alt = build_timebase(gps, acc, 2048, 25, chunk_counts=counts, t0_by_index=t0, t1_by_index=t1)
    tb_neu = build_timebase(gps, acc, 2048, 25, chunk_counts=counts, t0_by_index=t0,
                            accel_luecken=True, t1_by_index=t1)
    assert tb_alt.source == tb_neu.source == "exact_chunks"
    assert tb_alt.t_accel_ms[3699] > ende_vor + 200_000
    assert tb_neu.t_accel_ms[3699] < ende_vor


def test_luecke_nach_vollem_chunk():
    """Die Luecke beginnt genau, als ein Chunk voll war: t1 zeigt sie trotzdem."""
    counts, t0, t1, t = {}, {}, {}, 0.0
    for i in range(3):
        counts[i], t0[i] = 1500, int(round(t)); t += 1500 / HZ * 1000; t1[i] = int(t) - 1000
    ende_vor = t
    t += 120_000
    for i in (3, 4):
        counts[i], t0[i] = 1500, int(round(t)); t += 1500 / HZ * 1000; t1[i] = int(t) - 1000
    tn, _, _ = _accel_chunk_axis(counts, t0, 25.0, t, luecken=True, t1_by_index=t1)
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
    # t1_ms am Chunk landet als eigenes Sidecar
    import base64 as _b64
    r = client.post("/api/ingest/session/luecken-mit/chunk", headers=dev, json={
        "index": 0, "kind": "accel", "encoding": "int16-b64", "t0_ms": 1000, "t1_ms": 61000,
        "data": _b64.b64encode(bytes(6 * 10)).decode()})
    assert r.status_code == 200, r.text
    assert storage.load_accel_t1("luecken-mit") == {0: 61000}
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
    t1 = storage.load_accel_t1("merge-luecken-test")
    assert t1[1] == int(round(t1_ende := t[799])) and t0[2] - t1[1] > 5000
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
