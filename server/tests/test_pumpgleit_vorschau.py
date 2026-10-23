"""`?pumpgleit=1` (Admin-Vorschau pg-1, 23.10.2026): nur lesend, Nicht-Admins unberuehrt; das Paket
analysis/pumpgleit rechnet auf einem kuenstlichen Signal sinnvoll (Pumps im Sinus-Takt, Gleiten in der Pause)."""
import numpy as np

from app.analysis import pumpgleit as PG


def _kuenstlich():
    t = np.arange(0, 90000, 40.0)
    rng = np.random.default_rng(1)
    pump = ((t >= 10000) & (t < 40000)) | ((t >= 45000) & (t < 80000))
    acc = np.zeros((t.size, 3), np.float32)
    acc[:, 2] = 1.0 + np.where(pump, 0.4 * np.sin(2 * np.pi * 1.4 * t / 1000), 0) + rng.normal(0, 0.01, t.size)
    acc[:, 0] = np.where(pump, 0.15 * np.sin(2 * np.pi * 1.4 * t / 1000 + 1), 0) + rng.normal(0, 0.01, t.size)
    gt = np.arange(0, 90000, 1000.0)
    gps = np.column_stack([gt, 47 + np.arange(gt.size) * 3.6e-5, 9 + 0 * gt,
                           np.where((gt >= 8000) & (gt <= 82000), 4.0, 0.5)])
    return {"fs": 25.0, "lo": 0.0, "t": t, "acc": acc, "echt": np.ones(t.size, bool), "gps": gps, "gyro": None}


def test_pumps_im_takt_und_gleiten_in_der_pause():
    a = PG.ableiten(_kuenstlich(), [(10000.0, 80000.0)])[0]
    p = np.asarray(a["pump_ms"])
    assert abs(((p >= 10000) & (p <= 80000)).sum() - 1.4 * 65) <= 0.1 * 1.4 * 65    # ein Pump je Takt
    assert ((p > 40500) & (p < 44500)).sum() == 0                                 # keiner in der Pause
    assert any(x <= 41000 and y >= 44000 for x, y in a["gleit"])                  # die Pause ist Gleiten
    assert a["hinschauen"] == []


def test_zustaendig_nur_pumpen_ohne_wind_und_brett():
    class R:
        detection = "model"

    class S:
        sport_class, placement = "pumpfoil", None
    assert PG.zustaendig(S, R)
    S.sport_class = "wingfoil"
    assert not PG.zustaendig(S, R)
    S.sport_class, S.placement = "efoil", "board"
    assert not PG.zustaendig(S, R)


def test_vorschau_nur_admin_und_schreibt_nichts(client, monkeypatch):
    from app import models
    from app.db import SessionLocal
    tok = client.post("/api/auth/register", json={"email": "pgv@b.de", "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": "Bearer " + tok}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    client.post("/api/ingest/session", headers=uhr, json={"session_uuid": "pgv-1", "started_at": "2026-10-21T19:00:00Z",
                "sport": "pumpfoil", "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000})
    client.post("/api/ingest/session/pgv-1/chunk", headers=uhr, json={"index": 0, "kind": "gps", "encoding": "json",
                "data": [[i * 1000, 47.0 + i * 5e-5, 9.0, 4.0, 120, 6.0] for i in range(90)]})
    sid = client.post("/api/ingest/session/pgv-1/complete", headers=uhr, json={"total_chunks": 1}).json()["session_id"]

    # Die Testsession hat nur GPS (detection gps_only) — die Rechnung selbst prueft der Test oben; hier zaehlt der
    # Weg durch die API: wer sieht die Vorschau, und bleibt die Datenbank unberuehrt.
    def falsch_segmente(s, segmente, n):
        segs = [dict(g, pumps=7, pump_idx=[0], glides=[[0, 1, 2.0, 0]], num_glides=1, longest_glide_s=2.0)
                for g in segmente] or [{"pumps": 7, "glides": [[0, 1, 2.0, 0]], "longest_glide_s": 2.0}]
        return {"segments": segs, "pump_count": 7 * len(segs), "best_glide_s": 2.0, "best_glide_idx": 0,
                "hinschauen": [{"lauf": 0, "start_ms": 1000, "dauer_s": 11.0}], "gleit_s": 2.0}
    monkeypatch.setattr(PG, "zustaendig", lambda s, r: True)
    monkeypatch.setattr(PG, "segmente_ueberlagern", falsch_segmente)

    vorher = client.get(f"/api/sessions/{sid}", headers=auth)
    nicht_admin = client.get(f"/api/sessions/{sid}?pumpgleit=1", headers=auth)
    assert nicht_admin.status_code == 200
    assert nicht_admin.json()["analysis"] == vorher.json()["analysis"]           # kein Admin: unveraendert
    assert "-pg" not in nicht_admin.headers.get("etag", "")

    db = SessionLocal()
    u = db.query(models.User).filter_by(email="pgv@b.de").one(); u.is_admin = True; db.commit()
    s = db.get(models.Session, sid)
    stempel, res_vorher = s.updated_at, (s.result.segments_json, s.result.pump_count, s.result.best_glide_s)
    db.close()
    r = client.get(f"/api/sessions/{sid}?pumpgleit=1", headers=auth)
    assert r.status_code == 200 and r.headers["etag"].endswith('-pg"')
    a = r.json()["analysis"]
    assert a and a.get("segments"), "Testsession braucht mindestens einen Lauf"
    assert a["metrics"]["pumpgleit"]["version"] == PG.VERSION
    assert a["metrics"]["pumpgleit"]["hinschauen"][0]["dauer_s"] == 11.0
    assert all(g["pumps"] == 7 for g in a["segments"])
    db = SessionLocal()
    s = db.get(models.Session, sid)
    assert s.updated_at == stempel                                                  # nichts gespeichert
    assert (s.result.segments_json, s.result.pump_count, s.result.best_glide_s) == res_vorher
    db.close()
