"""Setup je Session ohne Erben (Nutzer-Feedback 16.10.2026): ein Favorit wirkt nur auf neue
Sessions, Uebertragungen nehmen das Setup des Absenders nicht mit, und beim Zusammenfuehren geht
eine Angabe nicht verloren, die erst ein spaeterer Teil traegt."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return kopf, client.get("/api/auth/me", headers=kopf).json()["id"]


def _session(uid, **kw):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, sport="pumpfoil",
                           started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           is_pumpfoil=True, status="analyzed", **kw)
        db.add(s); db.commit()
        return s.id
    finally:
        db.close()


def test_favorit_wirkt_nicht_rueckwirkend(client):
    kopf, uid = _konto(client, "se1@b.de")
    alt = _session(uid)                                     # angelegt ohne Board
    b = client.post("/api/boards", headers=kopf, json={"name": "Kluber 87", "length_cm": 87}).json()
    client.put("/api/settings", headers=kopf, json={"board_id": b["id"], "mast_len_cm": 85})
    d = client.get(f"/api/sessions/{alt}", headers=kopf).json()
    assert not (d.get("setup") or {}).get("board")
    assert not (d.get("setup") or {}).get("mast_len_cm")
    liste = client.get("/api/sessions", headers=kopf).json()
    zeilen = liste if isinstance(liste, list) else liste.get("items", liste.get("sessions", []))
    z = next(x for x in zeilen if x["id"] == alt)
    assert not (z.get("setup") or {}).get("board")
    mit = _session(uid, board_id=b["id"])                  # Schnappschuss: bleibt
    assert client.get(f"/api/sessions/{mit}", headers=kopf).json()["setup"]["board"]["id"] == b["id"]


def test_uebertragung_nimmt_setup_des_absenders_nicht_mit(client):
    kopf_a, a = _konto(client, "se2a@b.de")
    kopf_b, b_uid = _konto(client, "se2b@b.de")
    brett = client.post("/api/boards", headers=kopf_a, json={"name": "Brett A"}).json()
    sid = _session(a, board_id=brett["id"], mast_len_cm=80, rider_weight_kg=90)
    r = client.post("/api/transfers", headers=kopf_a, json={"session_id": sid, "to_user_id": b_uid})
    assert r.status_code == 200, r.text
    tid = r.json().get("id") or r.json()["transfer"]["id"]
    assert client.post(f"/api/transfers/{tid}/accept", headers=kopf_b).status_code == 200
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        assert s.user_id == b_uid
        assert s.board_id is None and s.mast_len_cm is None and s.rider_weight_kg is None
    finally:
        db.close()


def test_zusammenfuehren_nimmt_erste_vorhandene_angabe():
    from app import models
    from app.setup_snapshot import uebernehmen
    t1 = models.Session(mast_len_cm=80)
    t2 = models.Session(board_id=106, mast_len_cm=90)
    out = uebernehmen([t1, t2])
    assert out["board_id"] == 106 and out["mast_len_cm"] == 80
