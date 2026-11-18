"""Performance-Reiter (18.11.2026): eigene Tagesplatzierung gegen alle Fahrer derselben Sportart am selben Tag."""
import json
import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _nutzer(mail):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        u = models.User(email=mail, password_hash="x", display_name=mail.split("@")[0])
        db.add(u); db.commit()
        return u.id
    finally:
        db.close()


def _session(uid, tag, sprint_mps, dist_m):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=tag,
                           ended_at=tag + timedelta(minutes=30), sport="pumpfoil", sport_class="pumpfoil",
                           is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s); db.flush()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=3,
                                     best_distance_m=dist_m, best_duration_s=dist_m / 4, best_speed_mps=sprint_mps + 1,
                                     sprint_100m_mps=sprint_mps, sprint_60s_mps=None,
                                     sprint_json=json.dumps({"v": 7, "best": {"sprint_100m": sprint_mps}})))
        db.commit()
        return s.id
    finally:
        db.close()


def test_platz_feld_und_mindestfeld(client):
    from app.api import community
    community._PERF_CACHE.clear()
    k = secrets.token_hex(3)
    tag = datetime(2026, 9, 3, 10, tzinfo=timezone.utc)
    ich, kopf = _konto(client, f"perf-ich-{k}@t.de")
    andere = [_nutzer(f"perf-{i}-{k}@t.de") for i in range(5)]   # direkt angelegt (Registrierung ist gedrosselt)
    sid = _session(ich, tag, 5.0, 300.0)
    for i, uid in enumerate(andere):          # 4.0, 4.5, 5.5, 6.0, 6.5 -> ich bin 4. von 6 beim Sprint
        _session(uid, tag, [4.0, 4.5, 5.5, 6.0, 6.5][i], 100.0 + i)
    # zweiter Tag mit nur mir: Feld 1 < Mindestfeld -> zaehlt nicht
    _session(ich, tag + timedelta(days=1), 7.0, 500.0)
    d = client.get("/api/community/performance?sport=pumpfoil", headers=kopf).json()
    sp = [z for z in d["kategorien"]["sprint_100m"] if z["tag"] == "2026-09-03"]
    assert sp and sp[0]["platz"] == 4 and sp[0]["feld"] >= 6 and sp[0]["session_id"] == sid
    assert not [z for z in d["kategorien"]["sprint_100m"] if z["tag"] == "2026-09-04"]
    ld = [z for z in d["kategorien"]["run_distance"] if z["tag"] == "2026-09-03"][0]
    assert ld["platz"] == 1 and ld["perzentil"] == 100.0
