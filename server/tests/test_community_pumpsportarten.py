"""Community-Zahlen im Banner zaehlen alle Sportarten mit echtem Pumpen (Jan, 29.09.2026).

Anlass: ThermikDrehers Sessions wurden auf Foil Scoot umgestellt, und die Pumps-Zahl im Banner
FIEL um 36.533 — sie zaehlte nur Pumpfoil. Foil Scoot und Wakethief sind echtes Pumpen und zaehlen
mit; Wingfoil (angetrieben) nicht.
"""
import secrets
from datetime import datetime, timedelta, timezone


def test_banner_zaehlt_pump_sportarten(client):
    from app import models
    from app.api import community
    from app.db import SessionLocal
    r = client.post("/api/auth/register", json={"email": "pumpsport@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=auth).json()["id"]

    def stand():
        community._stats_cache = None
        return client.get("/api/community/stats", headers=auth).json()

    vorher = stand()
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=2)
        for i, (sc, pumps) in enumerate([("pumpfoil", 100), ("foil_scoot", 20), ("wakethief", 3), ("wingfoil", 5000)]):
            s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t + timedelta(hours=i),
                               ended_at=t + timedelta(hours=i, minutes=30), sport="pumpfoil", sport_class=sc,
                               is_pumpfoil=True, status="analyzed", data_quality="ok")
            db.add(s); db.commit()
            db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=2,
                                         pump_count=pumps, foiling_distance_m=100.0))
            db.commit()
    finally:
        db.close()
    nachher = stand()
    assert nachher["sessions"] - vorher["sessions"] == 3
    assert nachher["pumps"] - vorher["pumps"] == 123
