"""Sportart-Filter in „Meine Sessions" (Nutzerwunsch 27.09.2026: „filter sessions … for Wakethief").

Default bleibt „alle"; „pumpfoil" nimmt Altbestaende ohne sport_class mit — dieselbe Lesart wie
der Community-Feed.
"""
import secrets
from datetime import datetime, timedelta, timezone


def test_eigene_sessions_nach_sportart(client):
    from app import models
    from app.db import SessionLocal
    r = client.post("/api/auth/register", json={"email": "sportfilter@t.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=auth).json()["id"]
    db = SessionLocal()
    ids = {}
    try:
        t = datetime.now(timezone.utc) - timedelta(days=3)
        for i, sc in enumerate([None, "pumpfoil", "wakethief", "wingfoil"]):
            s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t + timedelta(hours=i),
                               ended_at=t + timedelta(hours=i, minutes=30), sport="pumpfoil",
                               sport_class=sc, is_pumpfoil=True, status="analyzed")
            db.add(s); db.commit(); ids[sc] = s.id
    finally:
        db.close()

    def liste(**p):
        r = client.get("/api/sessions", headers=auth, params=p)
        assert r.status_code == 200, r.text
        return {x["id"] for x in r.json()}

    assert liste() == set(ids.values())
    assert liste(sport="all") == set(ids.values())
    assert liste(sport="pumpfoil") == {ids[None], ids["pumpfoil"]}
    assert liste(sport="wakethief") == {ids["wakethief"]}
    monate = client.get("/api/sessions/months", headers=auth, params={"sport": "wingfoil"}).json()
    assert sum(m["count"] for m in monate) == 1
    n = client.get(f"/api/sessions/{ids['wakethief']}/neighbors", headers=auth,
                   params={"sport": "wakethief"}).json()
    assert n == {"older": None, "newer": None}, n
    alle = client.get(f"/api/sessions/{ids['wakethief']}/neighbors", headers=auth).json()
    assert alle["older"] is not None and alle["newer"] is not None, alle
