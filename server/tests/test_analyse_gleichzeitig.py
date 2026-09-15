"""Zwei Analysen derselben Session gleichzeitig duerfen sich nicht gegenseitig killen.

Der Fehler (15.09.2026, Jans Session #8517): `run_analysis` las die Ergebniszeile mit
`first()` und legte sie bei Bedarf an — zwischen Lesen und Commit vergehen aber Sekunden bis
Minuten. Legte in dieser Zeit eine ZWEITE Analyse die Zeile an, brach der Commit mit
`duplicate key value violates unique constraint analysis_results_session_id_key` ab. Traf es
die FINALE Analyse, blieb die Session fuer immer auf „complete" — in der Liste als „wird
verarbeitet", ohne Benachrichtigung und ohne Auto-Zuschnitt.
"""
from __future__ import annotations

from test_api import _accel_chunk_b64, _gps_chunk


def _session(client, kennung: str) -> int:
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    dev = {"X-Device-Token": client.post("/api/devices/pair",
                                         json={"code": code, "label": "Wear OS"}).json()["device_token"]}
    uuid = f"uuid-{kennung}"
    client.post("/api/ingest/session", headers=dev,
                json={"session_uuid": uuid, "started_at": "2026-09-15T13:00:00Z"})
    for kind, daten, enc in (("gps", _gps_chunk(), "json"), ("accel", _accel_chunk_b64(), "int16-b64")):
        client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                    json={"index": 0, "kind": kind, "encoding": enc, "data": daten})
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Session).filter_by(session_uuid=uuid).one().id
    finally:
        db.close()


def test_zweite_analyse_toetet_die_finale_nicht(client):
    """Beide Analysen laufen auf EIGENEN Verbindungen, ueberlappend — wie in der Produktion."""
    from app import models
    from app.analysis import run_analysis
    from app.db import SessionLocal

    sid = _session(client, "race")

    # Analyse A startet und liest ihren Stand — committet aber noch nicht.
    db_a = SessionLocal()
    s_a = db_a.get(models.Session, sid)

    # Analyse B laeuft komplett durch und legt die Ergebniszeile an.
    db_b = SessionLocal()
    try:
        run_analysis(db_b, db_b.get(models.Session, sid), final=False)
    finally:
        db_b.close()

    # A committet DANACH — vorher brach genau hier der Unique-Constraint.
    try:
        run_analysis(db_a, s_a, final=True)
    finally:
        db_a.close()

    db = SessionLocal()
    try:
        assert db.query(models.Session.status).filter_by(id=sid).scalar() == "analyzed"
        assert db.query(models.AnalysisResult).filter_by(session_id=sid).count() == 1
    finally:
        db.close()
