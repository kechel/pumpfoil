"""Home-Uebersicht und Home › Team (02.11.2026): letzte Sessions der Freunde bzw. des Teams als Feed-Karten."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _konto(client, tag):
    r = client.post("/api/auth/register", json={"email": f"hl-{tag}-{secrets.token_hex(3)}@t.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _session(uid, tage):
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=tage)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t, ended_at=t + timedelta(minutes=30),
                           sport="pumpfoil", sport_class="pumpfoil", is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s); db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=2, foiling_distance_m=200.0))
        db.commit()
        return s.id
    finally:
        db.close()


def test_freunde_je_eine_letzte(client):
    (a, ka), (b, kb), (c, kc) = _konto(client, "a"), _konto(client, "b"), _konto(client, "c")
    _session(b, 3); neu = _session(b, 1); _session(c, 1)          # c ist kein Freund
    client.post(f"/api/friends/{b}/request", headers=ka); client.post(f"/api/friends/{a}/accept", headers=kb)
    l = client.get("/api/community/friends-latest", headers=ka).json()
    assert [x["session_id"] for x in l] == [neu]


def test_team_letzte_nur_fuer_mitglieder(client):
    from app import models
    from app.db import SessionLocal
    (a, ka), (b, kb), (c, kc) = _konto(client, "ta"), _konto(client, "tb"), _konto(client, "tc")
    slug = client.post("/api/teams", headers=ka, json={"name": f"Home Team {secrets.token_hex(2)}"}).json()["slug"]
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    client.post(f"/api/teams/einladung/{links['join']}", headers=kb)
    db = SessionLocal()
    try:
        tid = db.query(models.Team.id).filter(models.Team.slug == slug).scalar()
    finally:
        db.close()
    ids = [_session(b, i) for i in range(1, 6)]
    l = client.get(f"/api/community/team-latest?team={tid}", headers=ka).json()
    assert [x["session_id"] for x in l] == ids[:3]               # je Mitglied hoechstens drei, neueste zuerst
    assert client.get(f"/api/community/team-latest?team={tid}", headers=kc).status_code == 404


def test_teamliste_traegt_aktivitaet(client):
    # Community › Teams & Events (02.11.2026): die aktivsten Teams nach Sessions der Mitglieder in 30 Tagen.
    from app import models
    from app.db import SessionLocal
    (a, ka) = _konto(client, "akt")
    slug = client.post("/api/teams", headers=ka, json={"name": f"Aktiv Team {secrets.token_hex(2)}"}).json()["slug"]
    db = SessionLocal()
    try:
        tm = db.query(models.Team).filter(models.Team.slug == slug).one()
        tm.frei_am = datetime.now(timezone.utc); db.commit(); tid = tm.id
    finally:
        db.close()
    _session(a, 2); _session(a, 40)                              # nur eine in den letzten 30 Tagen
    zeile = next(x for x in client.get("/api/teams/liste", headers=ka).json() if x["id"] == tid)
    assert zeile["sessions_30d"] == 1


def test_sessions_reiter_team_30_tage_nur_mitglieder(client):
    # Sessions › Team (02.11.2026): Sessions der Mitglieder der letzten 30 Tage, nur fuer Mitglieder.
    from app import models
    from app.db import SessionLocal
    (a, ka), (b, kb), (c, kc) = _konto(client, "st-a"), _konto(client, "st-b"), _konto(client, "st-c")
    slug = client.post("/api/teams", headers=ka, json={"name": f"Feed Team {secrets.token_hex(2)}"}).json()["slug"]
    links = client.get(f"/api/teams/{slug}/einladungen", headers=ka).json()
    client.post(f"/api/teams/einladung/{links['join']}", headers=kb)
    db = SessionLocal()
    try:
        tid = db.query(models.Team.id).filter(models.Team.slug == slug).scalar()
    finally:
        db.close()
    neu = _session(b, 3); _session(b, 45); _session(c, 2)        # alt (45 Tage) und Fremder fallen raus
    gruppen = client.get(f"/api/community/sessions-grouped?team={tid}&sport=all&accel_only=false", headers=ka).json()
    ids = [s["session_id"] for g in gruppen for s in g["sessions"]]
    assert ids == [neu]
    assert client.get(f"/api/community/sessions-grouped?team={tid}&sport=all", headers=kc).status_code == 404



def test_team_auswahl_alle(client):
    # „Alle meine Teams" (02.11.2026): Mitglieder aller eigenen Teams zusammen, ohne Doppelte.
    (a, ka), (b, kb), (c, kc) = _konto(client, "ta-a"), _konto(client, "ta-b"), _konto(client, "ta-c")
    s1 = client.post("/api/teams", headers=ka, json={"name": f"Alle Eins {secrets.token_hex(2)}"}).json()["slug"]
    s2 = client.post("/api/teams", headers=ka, json={"name": f"Alle Zwei {secrets.token_hex(2)}"}).json()["slug"]
    client.post(f"/api/teams/einladung/{client.get(f'/api/teams/{s1}/einladungen', headers=ka).json()['join']}", headers=kb)
    client.post(f"/api/teams/einladung/{client.get(f'/api/teams/{s2}/einladungen', headers=ka).json()['join']}", headers=kc)
    sb, sc = _session(b, 1), _session(c, 2)
    ids = [x["session_id"] for x in client.get("/api/community/team-latest?team=alle", headers=ka).json()]
    assert sb in ids and sc in ids
    assert client.get("/api/community/team-latest?team=quatsch", headers=ka).status_code == 404
