"""Zusammenfuehren-Vorschlag fuer IMPORTIERTE Sessions + Einstufung beim Zusammenfuehren (09.10.2026).

Anlass: Chasingbirds (Suunto, Rad-Modus) — eine Pumpfoil-Session kam als 7 Aufnahmen, der Vorschlag
blieb aus, weil Importe keine `device_id` haben. Und: die zusammengefuehrte Session verlor die
Einstufung „Pumpfoil" des Menschen, rechnete also mit `detection=none` (0 Laeufe)."""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app import merge


def _nutzer(client, kennung):
    r = client.post("/api/auth/register", json={"email": f"{kennung}@test.de", "password": "supersecret"})
    from app.db import SessionLocal
    from app import models
    db = SessionLocal()
    try:
        return db.query(models.User).filter_by(email=f"{kennung}@test.de").one().id
    finally:
        db.close()


def _teil(db, uid, quelle, start, minuten=10, device_id=None):
    from app import models, storage
    u = f"{quelle}-{_uuid.uuid4().hex}"
    storage.ensure_session_dir(u)
    storage.save_gps_chunk(u, 0, [[i * 1000, 46.9661, 7.385, 4.0] for i in range(minuten * 60)])
    s = models.Session(session_uuid=u, user_id=uid, device_id=device_id, sport="cycling",
                       started_at=start, ended_at=start + timedelta(minutes=minuten),
                       gps_hz=1, accel_hz=25, accel_scale=2048, status="analyzed",
                       place_lat=46.9661, place_lon=7.385, is_pumpfoil=True)
    db.add(s); db.flush()
    return s


def _gruppen(db, uid):
    return [[s.session_uuid.split("-", 1)[0] for s in g] for g in merge.merge_suggestions(db, uid)]


def test_vorschlag_fuer_teile_aus_demselben_import_konto(client, monkeypatch):
    from app.db import SessionLocal
    monkeypatch.setattr(merge, "_eligible", lambda s: not s.deleted and s.merged_into is None)
    uid = _nutzer(client, "mi-1")
    t0 = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        _teil(db, uid, "suunto", t0)
        _teil(db, uid, "suunto", t0 + timedelta(minutes=12))
        _teil(db, uid, "suunto", t0 + timedelta(minutes=25))
        db.commit()
        assert _gruppen(db, uid) == [["suunto", "suunto", "suunto"]]
    finally:
        db.close()


def test_kein_vorschlag_fuer_hochgeladene_dateien_und_gemischte_quellen(client, monkeypatch):
    from app.db import SessionLocal
    monkeypatch.setattr(merge, "_eligible", lambda s: not s.deleted and s.merged_into is None)
    t0 = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        u1 = _nutzer(client, "mi-2")
        _teil(db, u1, "fit", t0); _teil(db, u1, "fit", t0 + timedelta(minutes=12))
        u2 = _nutzer(client, "mi-3")
        _teil(db, u2, "suunto", t0); _teil(db, u2, "polar", t0 + timedelta(minutes=12))
        u3 = _nutzer(client, "mi-4")      # ueberlappend = zwei Uhren gleichzeitig -> nie
        _teil(db, u3, "suunto", t0); _teil(db, u3, "suunto", t0 + timedelta(minutes=5))
        db.commit()
        assert _gruppen(db, u1) == [] and _gruppen(db, u2) == [] and _gruppen(db, u3) == []
    finally:
        db.close()


def test_eigenes_geraet_unveraendert():
    a = SimpleNamespace(device_id=7, session_uuid="x"); b = SimpleNamespace(device_id=7, session_uuid="y")
    c = SimpleNamespace(device_id=None, session_uuid="suunto-1")
    assert merge._gleiche_quelle(a, b) and not merge._gleiche_quelle(a, c) and not merge._gleiche_quelle(c, a)


def test_einstufung_der_staerksten_quelle():
    def s(cls, src, dq="ok", ov=None):
        return SimpleNamespace(sport_class=cls, sport_source=src, data_quality=dq, pumpfoil_override=ov)
    e = merge._einstufung([s("pumpfoil", "default"), s("pumpfoil", "admin", ov=True), s("pumpfoil", "default")])
    assert e == {"sport_class": "pumpfoil", "sport_source": "admin", "data_quality": "ok", "pumpfoil_override": True}
    e = merge._einstufung([s("pumpfoil", "default"), s("pumpfoil", "owner")])
    assert e["sport_source"] == "owner" and "pumpfoil_override" not in e
    assert merge._einstufung([s("pumpfoil", "default")])["sport_source"] == "default"


def test_zusammengefuehrt_behaelt_einstufung_und_gps_erkennung(client, monkeypatch):
    """Ende-zu-Ende: zwei Rad-Teile, vom Besitzer auf Pumpfoil gestellt -> die neue Session ist
    owner/pumpfoil und wird mit der GPS-Erkennung gerechnet (vorher: default + detection none)."""
    from app.db import SessionLocal
    from app import models
    monkeypatch.setattr(merge, "can_merge", lambda ss: (True, ""))
    uid = _nutzer(client, "mi-5")
    t0 = datetime(2026, 10, 9, 12, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        a = _teil(db, uid, "suunto", t0); b = _teil(db, uid, "suunto", t0 + timedelta(minutes=12))
        for x in (a, b):
            x.sport_class = "pumpfoil"; x.sport_source = "owner"
        db.commit()
        ns = merge.merge_sessions(db, [a, b])
        assert (ns.sport, ns.sport_class, ns.sport_source) == ("cycling", "pumpfoil", "owner")
        r = db.query(models.AnalysisResult).filter_by(session_id=ns.id).order_by(models.AnalysisResult.id.desc()).first()
        assert r is not None and r.detection == "gps_only"
    finally:
        db.close()
