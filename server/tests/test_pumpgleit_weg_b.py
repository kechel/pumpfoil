"""pg-1 Weg B (23.10.2026): zusaetzlich gespeichert, bisherige Felder bitgenau gleich, Anzeige-Schalter liefert pg
bzw. alt, Rekorde lesen mit Schalter die pg-Spalten, Nachtrag ist wiederholbar."""
import base64
import json
import pathlib
import sys
import uuid as _uuid

import numpy as np
import pytest

from app import pumpgleit_anzeige as PA


def _accel(n=3000, scale=1000):
    t = np.arange(n) / 25.0
    pump = ((t >= 15) & (t < 50)) | ((t >= 55) & (t < 105))
    rng = np.random.default_rng(3)
    z = (1.0 + np.where(pump, 0.45 * np.sin(2 * np.pi * 1.4 * t), 0) + rng.normal(0, 0.02, n)) * scale
    x = (np.where(pump, 0.2 * np.sin(2 * np.pi * 1.4 * t + 1), 0) + rng.normal(0, 0.02, n)) * scale
    inter = np.empty(n * 3, dtype="<i2")
    inter[0::3] = x.astype("<i2"); inter[1::3] = rng.normal(0, 20, n).astype("<i2"); inter[2::3] = z.astype("<i2")
    return base64.b64encode(inter.tobytes()).decode()


def _gps(n=120):
    out = []
    for i in range(n):
        v = 4.2 if 12 <= i <= 108 else 0.6
        out.append([i * 1000, 47.86 + i * v / 111320.0, 9.38, v, 0, 5.0])
    return out


@pytest.fixture(scope="module")
def sitzung(client):
    mail = f"pgb-{_uuid.uuid4().hex[:8]}@test.de"
    jwt = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {jwt}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair", json={"code": code}).json()["device_token"]}
    uid = f"pgb-{_uuid.uuid4().hex[:8]}"
    client.post("/api/ingest/session", headers=dev, json={"session_uuid": uid, "started_at": "2026-10-20T09:00:00Z",
                                                         "sport": "pumpfoil", "accel_hz": 25, "accel_scale": 1000})
    r = client.post(f"/api/ingest/session/{uid}/chunks", headers=dev, json={"chunks": [
        {"index": 0, "kind": "gps", "encoding": "json", "t0_ms": 0, "count": 120, "data": _gps()},
        {"index": 1, "kind": "accel", "encoding": "int16-b64", "t0_ms": 0, "count": 3000, "data": _accel()}]})
    assert r.status_code == 200, r.text
    sid = client.post(f"/api/ingest/session/{uid}/complete", headers=dev,
                      json={"ended_at": "2026-10-20T09:02:00Z", "total_chunks": 2}).json()["session_id"]
    return sid, auth, mail


def _laden(sid):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    s = db.get(models.Session, sid)
    return db, s, s.result


def _ohne_pg(segs):
    return [{k: v for k, v in g.items() if not k.startswith("pg_")} for g in segs]


def test_bisherige_felder_bitgenau_und_pg_gesetzt(sitzung, monkeypatch):
    from app.analysis import pumpgleit as PG, run_analysis
    sid, _, _ = sitzung
    db, s, r = _laden(sid)
    # erst OHNE pg-Stufe rechnen, dann mit: alle bisherigen Felder muessen gleich sein
    monkeypatch.setattr(PG, "stufe", lambda *a, **k: False)
    run_analysis(db, s, final=True)
    ohne = (json.loads(r.segments_json), r.pump_count, r.best_glide_s, r.avg_cadence_hz, r.num_runs,
            {k: v for k, v in json.loads(r.metrics_json).items() if k != "pumpgleit"})
    monkeypatch.undo()
    run_analysis(db, s, final=True)
    mit = (json.loads(r.segments_json), r.pump_count, r.best_glide_s, r.avg_cadence_hz, r.num_runs,
           {k: v for k, v in json.loads(r.metrics_json).items() if k != "pumpgleit"})
    assert _ohne_pg(mit[0]) == _ohne_pg(ohne[0]) and mit[1:] == ohne[1:]
    db.close()


def _lauf_einsetzen(r, s):
    """Die kuenstliche Session findet das On-Foil-Modell nicht als Lauf -> einen Lauf von Hand einsetzen
    (nur fuer die Tests der pg-Stufe; Felder wie run_analysis sie schreibt)."""
    off = int(s.trim_start_ms or 0)
    n = len((json.loads(r.track_geojson or "{}").get("geometry") or {}).get("coordinates") or [])
    assert n >= 110
    seg = {"t_start_ms": 14000 - off, "t_end_ms": 106000 - off, "t_start_session_ms": 14000, "t_end_session_ms": 106000,
           "i_start": 14, "i_end": 106, "duration_s": 92.0, "distance_m": 380.0, "pumps": 120, "pump_idx": [20],
           "glides": [], "num_glides": 0, "avg_glide_s": 0.0, "longest_glide_s": 1.4, "avg_pump_hz": 1.3,
           "max_speed_mps": 4.5}
    r.segments_json = json.dumps([seg])
    r.detection, r.num_runs, r.pump_count, r.best_glide_s, r.foiling_time_s = "model", 1, 120, 1.4, 92.0
    return seg


def test_stufe_setzt_pg_und_laesst_alt(sitzung):
    from app.analysis import pumpgleit as PG
    sid, _, _ = sitzung
    db, s, r = _laden(sid)
    seg = _lauf_einsetzen(r, s)
    assert PG.stufe(s, r, rechnen=True)
    g = json.loads(r.segments_json)[0]
    assert {k: v for k, v in g.items() if not k.startswith("pg_")} == seg          # bisherige Felder gleich
    assert r.pump_count == 120 and r.best_glide_s == 1.4
    assert r.pg_version == PG.VERSION and abs(r.pg_pump_count - 1.4 * 85) <= 15     # Sinus 1,4 Hz in 85 s
    assert g["pg_pumps"] == r.pg_pump_count and any(x[0] <= 52000 and x[1] >= 53000 for x in
                                                    [(q[3], q[3] + q[2] * 1000) for q in g["pg_glides"]])
    assert json.loads(r.metrics_json)["pumpgleit"]["version"] == PG.VERSION
    db.commit(); db.close()


def test_zwischenanalyse_und_fremde_sportart_ohne_pg(sitzung):
    from app.analysis import pumpgleit as PG
    sid, _, _ = sitzung
    db, s, r = _laden(sid)
    _lauf_einsetzen(r, s)
    PG.stufe(s, r, rechnen=False)                       # Zwischenanalyse
    assert r.pg_version is None and r.pg_pump_count is None
    s.sport_class = "wingfoil"
    PG.stufe(s, r, rechnen=True)
    assert r.pg_version is None and "pumpgleit" not in json.loads(r.metrics_json or "{}")
    s.sport_class = "pumpfoil"
    PG.stufe(s, r, rechnen=True)
    assert r.pg_version is not None
    db.commit(); db.close()


def test_schalter_an_und_aus(client, sitzung, monkeypatch):
    sid, auth, _ = sitzung
    db, s, r = _laden(sid)
    segs = json.loads(r.segments_json); pg_pc, alt_pc = r.pg_pump_count, r.pump_count
    db.close()
    monkeypatch.setattr(PA, "AN", False)
    a = client.get(f"/api/sessions/{sid}", headers=auth)
    assert a.json()["analysis"]["pump_count"] == alt_pc
    assert [g["pumps"] for g in a.json()["analysis"]["segments"]] == [g["pumps"] for g in segs]
    monkeypatch.setattr(PA, "AN", True)
    b = client.get(f"/api/sessions/{sid}", headers=auth)
    assert b.headers["etag"] != a.headers["etag"]                  # Schalter wechselt das ETag
    assert b.json()["analysis"]["pump_count"] == pg_pc
    assert [g["pumps"] for g in b.json()["analysis"]["segments"]] == \
        [g["pg_pumps"] if g.get("pg_pumps") is not None else g["pumps"] for g in segs]
    assert [g["longest_glide_s"] for g in b.json()["analysis"]["segments"]] == \
        [g["pg_longest_glide_s"] if g.get("pg_pumps") is not None else g["longest_glide_s"] for g in segs]


def test_lauf_ohne_pg_zeigt_alt(monkeypatch):
    monkeypatch.setattr(PA, "AN", True)
    alt = {"pumps": 9, "glides": [], "longest_glide_s": 1.2}
    assert PA.seg(alt) == alt
    neu = {"pumps": 9, "pg_pumps": 7, "glides": [], "pg_glides": [[1, 2, 2.0, 0]], "longest_glide_s": 1.2,
           "pg_longest_glide_s": 2.0}
    assert PA.seg(neu)["pumps"] == 7 and PA.seg(neu)["glides"] == [[1, 2, 2.0, 0]]

    class R:
        pg_version, pg_pump_count, pump_count, best_glide_s, pg_best_glide_s = None, None, 5, 1.0, None
    assert PA.pump_count(R) == 5 and PA.best_glide_s(R) == 1.0


def test_rekordspalten_mit_schalter(monkeypatch):
    from app import models
    from app.api.community import REC_COL
    monkeypatch.setattr(PA, "AN", False)
    assert REC_COL["glide"][0] is models.AnalysisResult.best_glide_s
    assert REC_COL["session_pumps"][0] is models.AnalysisResult.pump_count
    monkeypatch.setattr(PA, "AN", True)
    assert "coalesce" in str(REC_COL["glide"][0]).lower() and "pg_best_glide_s" in str(REC_COL["glide"][0])
    assert "pg_pump_count" in str(REC_COL["session_pumps"][0])
    assert REC_COL["distance"][0] is models.AnalysisResult.best_distance_m


def test_rekorde_lesen_pg(client, sitzung, monkeypatch):
    sid, auth, mail = sitzung
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    u = db.query(models.User).filter_by(email=mail).one(); u.is_admin = True
    r = db.query(models.AnalysisResult).filter_by(session_id=sid).one()
    r.pg_best_glide_s, r.best_glide_s, r.pg_best_glide_idx = 14.4, 1.1, 0
    db.commit(); db.close()
    monkeypatch.setattr(PA, "AN", True)
    from app.api.community import REC_COL, _community
    db = SessionLocal()
    row = _community(db.query(REC_COL["glide"][0], models.Session.id), None, True, "pumpfoil") \
        .filter(models.Session.id == sid).first()
    db.close()
    if row is not None:              # Session ist community-sichtbar (is_pumpfoil) -> pg-Wert
        assert row[0] == 14.4


def test_nachtrag_wiederholbar(sitzung):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "scripts" / "pumpgleit"))
    import nachtrag
    sid, _, _ = sitzung
    db, s, r = _laden(sid)
    r.pg_version = None
    vorher_alt = (_ohne_pg(json.loads(r.segments_json)), r.pump_count, r.best_glide_s)
    db.commit(); db.close()
    nachtrag._init(False, False, False)
    a = nachtrag.eine(sid)
    assert a["status"] == "geschrieben", a
    db, s, r = _laden(sid)
    erst = r.segments_json
    assert (_ohne_pg(json.loads(r.segments_json)), r.pump_count, r.best_glide_s) == vorher_alt
    db.close()
    b = nachtrag.eine(sid)
    assert b["status"] == "schon_da"
    nachtrag._init(False, True, False)       # --neu: rechnet erneut, Ergebnis gleich
    c = nachtrag.eine(sid)
    assert c["status"] == "geschrieben"
    db, s, r = _laden(sid)
    assert r.segments_json == erst
    db.close()


def test_preset_ansicht_liefert_pg(client, sitzung, monkeypatch):
    """Empfindlichkeit light/attempts: die eigene Ansicht zeigt die Preset-Laeufe (sensitivity_json) — auch dort
    pg-Werte, Summe passend zu den Laeufen. Ein Preset mit anderen Laufgrenzen wird eigen gerechnet."""
    from app import models
    from app.analysis import pumpgleit as PG
    sid, auth, mail = sitzung
    db, s, r = _laden(sid)
    seg = _lauf_einsetzen(r, s)
    kurz = dict(seg, t_end_session_ms=80000, t_end_ms=80000 - int(s.trim_start_ms or 0), i_end=80, duration_s=66.0)
    r.sensitivity_json = json.dumps({
        "light": {"foiling_time_s": 92.0, "foiling_distance_m": 380.0, "num_runs": 1, "segments": [seg]},
        "attempts": {"foiling_time_s": 66.0, "foiling_distance_m": 270.0, "num_runs": 1, "segments": [kurz]}})
    u = db.query(models.User).filter_by(email=mail).one(); u.foil_sensitivity = "light"
    assert PG.stufe(s, r, rechnen=True)
    c = json.loads(r.sensitivity_json)
    assert c["light"]["pg_pump_count"] == r.pg_pump_count and c["light"]["segments"][0]["pg_pumps"] == r.pg_pump_count
    assert c["attempts"]["pg_version"] == PG.VERSION and c["attempts"]["segments"][0]["pg_pumps"] < r.pg_pump_count
    assert {k: v for k, v in c["light"]["segments"][0].items() if not k.startswith("pg_")} == seg   # alt gleich
    db.commit(); db.close()
    monkeypatch.setattr(PA, "AN", True)
    a = client.get(f"/api/sessions/{sid}", headers=auth).json()["analysis"]
    assert a["pump_count"] == c["light"]["pg_pump_count"]
    assert a["segments"][0]["pumps"] == c["light"]["segments"][0]["pg_pumps"]
    assert a["segments"][0]["glides"] == c["light"]["segments"][0]["pg_glides"]
    monkeypatch.setattr(PA, "AN", False)
    b = client.get(f"/api/sessions/{sid}", headers=auth).json()["analysis"]
    assert b["segments"][0]["pumps"] == 120


def test_nachtrag_ergaenzt_nur_presets(sitzung):
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "scripts" / "pumpgleit"))
    import nachtrag
    from app.analysis import pumpgleit as PG
    sid, _, _ = sitzung
    db, s, r = _laden(sid)
    assert r.pg_version == PG.VERSION and r.sensitivity_json
    PG._presets_leeren(r)                     # Stand vor dem Preset-Fix: kanonisch pg, Presets ohne
    kanon = r.segments_json
    db.commit(); db.close()
    nachtrag._init(False, False, False)
    a = nachtrag.eine(sid)
    assert a["status"] == "presets", a
    db, s, r = _laden(sid)
    assert r.segments_json == kanon and json.loads(r.sensitivity_json)["light"]["pg_version"] == PG.VERSION
    db.close()
    assert nachtrag.eine(sid)["status"] == "schon_da"
