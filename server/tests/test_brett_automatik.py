"""Brett-Automatik (15.10.2026): eine Handy-Aufnahme wird nach der abschliessenden Analyse selbst
auf „am Brett" gestellt, wenn Lage UND Starrheit es eindeutig sagen — und nie gegen den Besitzer."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import numpy as np

from app.api.sessions import brett_auto_urteil, lage_streuung_deg


def _m(achse, streu, n=4, hub=1.0):
    return {"achse_deg": achse, "streu_deg": streu, "streu_laeufe": n, "hub_anteil": hub}


def test_fest_am_brett_wird_gesetzt():
    assert brett_auto_urteil(_m(3.5, 0.9)) is True          # wie #12738 (u574)


def test_hosentasche_unter_dem_anzug_nicht():
    """#16736, Philipps Handy unter dem Anzug — der schwierigste bekannte Fall."""
    assert brett_auto_urteil(_m(20.6, 2.9)) is False


def test_flach_aber_nicht_starr_nicht():
    """Flach, aber die Lage wechselt von Lauf zu Lauf (u808 #16761): nur fragen, nicht setzen."""
    assert brett_auto_urteil(_m(4.8, 2.3)) is False


def test_schraeg_aber_starr_nicht():
    """Quer und geneigt montiert (u683 #15004, 16,8°): bleibt beim Hinweis."""
    assert brett_auto_urteil(_m(16.8, 0.5)) is False


def test_zu_wenige_laeufe_oder_kein_takt_nicht():
    assert brett_auto_urteil(_m(2.0, 0.5, n=2)) is False
    assert brett_auto_urteil(_m(2.0, 0.5, hub=0.3)) is False
    assert brett_auto_urteil({"achse_deg": 2.0}) is False


def _laeufe(richtungen, sek=20, fs=50):
    """Accel mehrerer Laeufe hintereinander, je Lauf eine feste Schwerkraftrichtung + Schwingung."""
    teile, ts, bereiche, t0 = [], [], [], 0.0
    for r in richtungen:
        t = t0 + np.arange(0, sek * 1000, 1000 / fs)
        g = np.array(r, float) / np.linalg.norm(r) * 1000
        teile.append(g + 150 * np.sin(2 * np.pi * 1.4 * t / 1000)[:, None] * np.array([[0.3, 0.3, 1.0]]))
        ts.append(t)
        bereiche.append((t[0], t[-1]))
        t0 = t[-1] + 30000
    return np.vstack(teile), np.concatenate(ts), bereiche


def test_streuung_starr_gegen_verrutscht():
    acc, t, b = _laeufe([[0, 0, 1]] * 4)
    starr, n = lage_streuung_deg(acc, t, b)
    assert n == 4 and starr < 0.5
    acc, t, b = _laeufe([[0, 0, 1], [0.08, 0, 1], [0, 0.08, 1], [-0.06, 0.03, 1]])
    lose, _ = lage_streuung_deg(acc, t, b)
    assert lose > 2.5


def _session(uid, placement="phone", quelle=None):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid,
                           started_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           sport="pumpfoil", placement=placement, placement_quelle=quelle,
                           is_pumpfoil=True)
        db.add(s)
        db.commit()
        return s.id
    finally:
        db.close()


def _user(client, mail):
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _automatik(sid, monkeypatch, merkmale):
    from app import models
    from app.analysis import brett_automatik
    from app.api import sessions as api
    from app.db import SessionLocal
    monkeypatch.setattr(api, "brett_merkmale", lambda s: merkmale)
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        return brett_automatik(db, s), s.placement, s.placement_quelle
    finally:
        db.close()


def test_automatik_setzt_board_und_merkt_die_quelle(client, monkeypatch):
    uid, _ = _user(client, "auto1@b.de")
    sid = _session(uid)
    assert _automatik(sid, monkeypatch, _m(2.0, 0.6)) == (True, "board", "auto")


def test_automatik_fasst_besitzer_entscheidung_nie_an(client, monkeypatch):
    uid, _ = _user(client, "auto2@b.de")
    sid = _session(uid, quelle="nutzer")
    assert _automatik(sid, monkeypatch, _m(2.0, 0.6)) == (False, "phone", "nutzer")


def test_automatik_laesst_uhren_und_tasche_in_ruhe(client, monkeypatch):
    uid, _ = _user(client, "auto3@b.de")
    assert _automatik(_session(uid, placement=None), monkeypatch, _m(2.0, 0.6))[0] is False
    assert _automatik(_session(uid), monkeypatch, _m(20.6, 2.9)) == (False, "phone", None)


def test_rausnehmen_durch_besitzer_ist_endgueltig(client):
    """Nimmt der Besitzer die automatische Markierung heraus, steht danach „nutzer" — die
    naechste abschliessende Analyse setzt sie nicht wieder."""
    uid, kopf = _user(client, "auto4@b.de")
    sid = _session(uid, placement="board", quelle="auto")
    r = client.patch(f"/api/sessions/{sid}/meta", headers=kopf, json={"placement": "phone"})
    assert r.status_code == 200, r.text
    assert r.json()["placement"] == "phone" and r.json()["placement_quelle"] == "nutzer"
