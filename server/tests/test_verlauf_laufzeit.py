"""Verlauf: Ø Laufzeit je Session (Nutzerwunsch im Feedback, 20.11.2026) — `/api/sessions/history` liefert je Session
Summe und Zahl der Laufzeiten, die Kurve rechnet daraus Σ Zeit / Σ Laeufe."""
import json
from datetime import datetime, timedelta, timezone


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=h).json()["id"], h


def test_history_summe_und_zahl_der_laufzeiten(client):
    from app import models
    from app.db import SessionLocal
    uid, h = _konto(client, "verlauf-laufzeit@example.org")
    db = SessionLocal()
    s = models.Session(user_id=uid, session_uuid="vl-1", started_at=datetime.now(timezone.utc) - timedelta(days=1),
                       is_pumpfoil=True, status="analyzed", sport_class="pumpfoil")
    db.add(s)
    db.flush()
    segs = [{"type": "foiling", "duration_s": 30.0, "distance_m": 100.0},
            {"type": "foiling", "duration_s": 50.0, "distance_m": 180.0},
            {"type": "foiling", "duration_s": 0, "distance_m": 0.0}]                  # ohne Dauer zaehlt nicht
    db.add(models.AnalysisResult(session_id=s.id, algo_version="t", segments_json=json.dumps(segs),
                                 metrics_json=json.dumps({"is_pumpfoil": True, "num_segments": 3}),
                                 foiling_distance_m=280.0))
    db.commit()
    db.close()
    z = next(x for x in client.get("/api/sessions/history", headers=h).json() if x["started_at"])
    assert z["run_s"] == 80.0 and z["run_n"] == 2 and z["duration"] == 50.0
