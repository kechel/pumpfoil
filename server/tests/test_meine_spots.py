"""`GET /api/sessions/my-spots-stats` — Home › Homespot › „Meine Spots" (03.11.2026): je eigenem Spot Sessions,
erste/letzte und Summen; aussortierte und geloeschte Aufnahmen zaehlen nicht, fremde Sessions nie."""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from app import models
from app.db import SessionLocal


def _konto(client, mail: str) -> tuple[int, dict]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def test_meine_spots_mit_summen(client):
    ich, kopf = _konto(client, "ich@meinespots.example.com")
    fremd, _ = _konto(client, "fremd@meinespots.example.com")
    db = SessionLocal()
    a = models.Spot(name="See A", name_source="manual", water_name="Wasser A")
    b = models.Spot(name="See B", name_source="manual")
    c = models.Spot(name="Wiese C", name_source="manual")
    db.add_all([a, b, c])
    db.commit()
    jetzt = datetime.now(timezone.utc)

    def sess(uid, spot, tage, zeit, **kw):
        s = models.Session(session_uuid=str(uuid.uuid4()), user_id=uid, spot_id=spot, is_pumpfoil=kw.pop("pf", True),
                           started_at=jetzt - timedelta(days=tage), status="analyzed", **kw)
        db.add(s)
        db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", num_runs=2, pump_count=10,
                                     foiling_time_s=zeit, foiling_distance_m=zeit * 4))
        db.commit()

    sess(ich, a.id, 10, 100.0)
    sess(ich, a.id, 5, 200.0)
    sess(ich, b.id, 1, 50.0, sport_class="wingfoil")
    sess(ich, c.id, 20, 70.0, sport_class="kite_atb")   # ohne Foil: keine On-Foil-Zahlen, keine Pumps
    sess(ich, b.id, 0, 999.0, pf=False)          # aussortiert
    sess(ich, a.id, 0, 999.0, deleted=True)      # geloescht
    sess(fremd, a.id, 0, 999.0)                  # fremd
    ida, idb, idc = a.id, b.id, c.id
    db.close()

    r = client.get("/api/sessions/my-spots-stats", headers=kopf)
    assert r.status_code == 200, r.text
    d = r.json()
    assert [x["spot_id"] for x in d] == [idb, ida, idc]   # zuletzt besuchter zuerst
    sa = d[1]
    assert sa["name"] == "See A" and sa["water"] == "Wasser A" and sa["sessions"] == 2
    assert sa["time_s"] == 300.0 and sa["distance_m"] == 1200.0 and sa["runs"] == 4 and sa["pumps"] == 20
    assert d[0]["sessions"] == 1 and d[0]["time_s"] == 50.0 and d[0]["sports"] == ["wingfoil"]
    assert sa["sports"] == ["pumpfoil"] and sa["foil_sessions"] == 2
    # Wingfoil: On-Foil ja, Pumps nein (keine Pump-Zahlen bei Wind). Kite-ATB: weder noch, Laeufe schon (04.11.2026).
    assert d[0]["pumps"] == 0 and d[0]["foil_sessions"] == 1
    sc = d[2]
    assert sc["sports"] == ["kite_atb"] and sc["time_s"] == 0 and sc["distance_m"] == 0 and sc["pumps"] == 0
    assert sc["runs"] == 2 and sc["foil_sessions"] == 0
