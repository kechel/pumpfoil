"""Rekord-Pushes nur fuer FRISCHE Aufnahmen (Jans Regel „nie nachtraeglich pushen").

Anlass 27.09.2026: 86 alte Aufnahmen mit veraltetem Zuschnitt werden neu ausgewertet. Schlaegt eine
davon einen Rekord, darf der Halter keine „Rekord!"-Meldung zu einer Fahrt von vor Wochen bekommen.
Das Ereignis wird trotzdem festgehalten.
"""
import secrets
from datetime import datetime, timedelta, timezone


def _session_mit_bestwert(user_id, tage_alt, meter):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=tage_alt)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=user_id, started_at=t,
                           ended_at=t + timedelta(hours=1), sport="pumpfoil", sport_class="pumpfoil",
                           is_pumpfoil=True, status="analyzed")
        db.add(s)
        db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=1,
                                     best_distance_m=meter, best_duration_s=1, best_speed_mps=1,
                                     best_glide_s=1, foiling_distance_m=meter))
        db.commit()
        return s.id
    finally:
        db.close()


def test_alte_aufnahme_bekommt_ereignis_aber_keinen_push(client, monkeypatch):
    from app import models, records
    from app.db import SessionLocal
    r = client.post("/api/auth/register", json={"email": "rekord-frisch@t.de", "password": "supersecret"})
    uid = client.get("/api/auth/me", headers={"Authorization": f"Bearer {r.json()['access_token']}"}).json()["id"]
    gesendet = []
    monkeypatch.setattr(records, "push_enabled", lambda: True)
    monkeypatch.setattr(records, "wants", lambda db, u, art: True)
    monkeypatch.setattr(records, "send_push", lambda db, u, *a, **k: gesendet.append((u, a)))
    db = SessionLocal()
    try:
        _session_mit_bestwert(uid, tage_alt=40, meter=800_000.0)  # damit es einen Stand zum Schlagen gibt
        records.run_record_snapshot(db, do_push=False)          # Ausgangsstand
        alt = _session_mit_bestwert(uid, tage_alt=30, meter=900_000.0)
        records.run_record_snapshot(db)
        assert db.query(models.RecordEvent).filter_by(session_id=alt).count() >= 1
        assert not any(u == uid for u, _ in gesendet), gesendet
        frisch = _session_mit_bestwert(uid, tage_alt=0, meter=950_000.0)
        records.run_record_snapshot(db)
        assert db.query(models.RecordEvent).filter_by(session_id=frisch).count() >= 1
        assert any(u == uid for u, _ in gesendet), gesendet
    finally:
        db.close()
