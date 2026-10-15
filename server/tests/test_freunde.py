"""Freunde (15.10.2026): was eine Freundschaft freigibt — und vor allem, was sie NICHT freigibt,
solange sie nicht von beiden bestaetigt ist. Regeln: app/freunde.py."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

import pytest


def _konto(client, mail: str) -> tuple[int, dict]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/auth/me", headers=kopf).json()
    return me["id"], kopf


def _session(uid: int, tage: int = 1) -> int:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(days=tage)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t,
                           ended_at=t + timedelta(minutes=40), sport="pumpfoil", sport_class="pumpfoil",
                           is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s)
        db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=3,
                                     pump_count=50, foiling_distance_m=300.0, best_distance_m=120.0))
        db.commit()
        return s.id
    finally:
        db.close()


def _befreunden(client, a, b):
    (ida, ka), (idb, kb) = a, b
    assert client.post(f"/api/friends/{idb}/request", headers=ka).json()["status"] == "angefragt"
    assert client.post(f"/api/friends/{ida}/accept", headers=kb).json()["status"] == "freund"


def test_anfrage_annehmen_liste(client):
    a, b = _konto(client, "fr-a1@t.de"), _konto(client, "fr-b1@t.de")
    client.post(f"/api/friends/{b[0]}/request", headers=a[1])
    assert client.get("/api/friends/count", headers=b[1]).json()["incoming"] == 1
    lb = client.get("/api/friends", headers=b[1]).json()
    assert [x["user_id"] for x in lb["eingehend"]] == [a[0]] and lb["freunde"] == []
    la = client.get("/api/friends", headers=a[1]).json()
    assert [x["user_id"] for x in la["ausgehend"]] == [b[0]]
    client.post(f"/api/friends/{a[0]}/accept", headers=b[1])
    assert [x["user_id"] for x in client.get("/api/friends", headers=a[1]).json()["freunde"]] == [b[0]]
    assert client.get("/api/friends/count", headers=b[1]).json()["incoming"] == 0


def test_gegenanfrage_ist_bestaetigung(client):
    a, b = _konto(client, "fr-a2@t.de"), _konto(client, "fr-b2@t.de")
    client.post(f"/api/friends/{b[0]}/request", headers=a[1])
    assert client.post(f"/api/friends/{a[0]}/request", headers=b[1]).json()["status"] == "freund"


def test_ablehnung_bleibt_still_und_sperrt(client):
    a, b = _konto(client, "fr-a3@t.de"), _konto(client, "fr-b3@t.de")
    client.post(f"/api/friends/{b[0]}/request", headers=a[1])
    client.post(f"/api/friends/{a[0]}/decline", headers=b[1])
    # Der Anfragende sieht weiter „angefragt", eine neue Anfrage auch — und es kommt nichts an.
    assert [x["user_id"] for x in client.get("/api/friends", headers=a[1]).json()["ausgehend"]] == [b[0]]
    assert client.post(f"/api/friends/{b[0]}/request", headers=a[1]).json()["status"] == "angefragt"
    assert client.get("/api/friends/count", headers=b[1]).json()["incoming"] == 0
    # Zurueckziehen blendet sie aus, umgeht die Sperre aber nicht.
    client.delete(f"/api/friends/{b[0]}", headers=a[1])
    assert client.get("/api/friends", headers=a[1]).json()["ausgehend"] == []
    client.post(f"/api/friends/{b[0]}/request", headers=a[1])
    assert client.get("/api/friends/count", headers=b[1]).json()["incoming"] == 0


def test_blockiert_keine_anfrage(client):
    a, b = _konto(client, "fr-a4@t.de"), _konto(client, "fr-b4@t.de")
    client.post("/api/chat/block", headers=b[1], json={"user_id": a[0]})
    assert client.post(f"/api/friends/{b[0]}/request", headers=a[1]).status_code == 404


def test_foiler_seite_nur_fuer_bestaetigte_freunde(client):
    a, b = _konto(client, "fr-a5@t.de"), _konto(client, "fr-b5@t.de")
    # b schaltet seine Seite ganz ab und verbirgt das Gewicht.
    r = client.put("/api/settings", headers=b[1], json={
        "public_profile": {"enabled": False}, "weight_kg": 81, "weight_hidden": True})
    assert r.status_code == 200, r.text
    assert client.get(f"/api/community/foiler/{b[0]}", headers=a[1]).status_code == 404
    # Nur angefragt: weiter nichts.
    client.post(f"/api/friends/{b[0]}/request", headers=a[1])
    assert client.get(f"/api/community/foiler/{b[0]}", headers=a[1]).status_code == 404
    client.post(f"/api/friends/{a[0]}/accept", headers=b[1])
    d = client.get(f"/api/community/foiler/{b[0]}", headers=a[1]).json()
    assert d["freundschaft"] == "freund" and all(d["zeigt"].values()) and d["gewicht_kg"] == 81
    # Beenden nimmt sofort alles wieder weg.
    client.delete(f"/api/friends/{a[0]}", headers=b[1])
    assert client.get(f"/api/community/foiler/{b[0]}", headers=a[1]).status_code == 404


def test_gewicht_nie_fuer_fremde(client):
    a, b = _konto(client, "fr-a6@t.de"), _konto(client, "fr-b6@t.de")
    client.put("/api/settings", headers=b[1], json={"weight_kg": 70})
    d = client.get(f"/api/community/foiler/{b[0]}", headers=a[1]).json()
    assert "gewicht_kg" not in d and d["freundschaft"] is None and d["freundschaft_moeglich"] is True


def test_unter_13_keine_freunde(client):
    from app import models
    from app.db import SessionLocal
    a, b = _konto(client, "fr-a7@t.de"), _konto(client, "fr-b7@t.de")
    db = SessionLocal()
    try:
        db.get(models.User, b[0]).social_allowed = False
        db.commit()
    finally:
        db.close()
    assert client.post(f"/api/friends/{b[0]}/request", headers=a[1]).status_code == 404
    assert client.get("/api/friends", headers=b[1]).status_code == 403


def test_ansicht_freunde_filtert_feed_und_rekorde(client):
    a, b, c = _konto(client, "fr-a8@t.de"), _konto(client, "fr-b8@t.de"), _konto(client, "fr-c8@t.de")
    sa, sc, sb = _session(a[0], 3), _session(c[0], 2), _session(b[0], 1)   # c liegt zeitlich dazwischen
    _befreunden(client, a, b)
    ids = lambda q: {x["session_id"] for x in client.get(f"/api/community/sessions?limit=100&sport=all{q}", headers=a[1]).json()}  # noqa: E731
    alle, freunde = ids(""), ids("&friends=1")
    assert {sa, sb, sc} <= alle
    assert sa in freunde and sb in freunde and sc not in freunde
    # Rekorde: erst ohne (fuellt den Cache), dann mit — darf nicht aus dem Cache kommen.
    client.get("/api/community/records?period=all", headers=a[1])
    rek = client.get("/api/community/records?period=all&friends=1", headers=a[1]).json()["all"]
    namen = {v.get("session_id") for v in rek.values() if isinstance(v, dict)}
    assert sc not in namen
    # Nachbar-Navigation in der Liste „Freunde" bleibt in der Liste.
    q = "sport=all&accel_only=false"
    # (In „alle" laege c dazwischen — dort stehen in der vollen Suite aber auch fremde Testsessions.)
    assert client.get(f"/api/sessions/{sa}/neighbors?scope=friends&{q}", headers=a[1]).json()["newer"] == sb


def test_gruene_spots_und_meldung_nur_fuer_freunde(client, monkeypatch):
    from app import freunde, models
    from app.api import devices
    from app.db import SessionLocal
    a, b, c = _konto(client, "fr-a9@t.de"), _konto(client, "fr-b9@t.de"), _konto(client, "fr-c9@t.de")
    _befreunden(client, a, b)
    db = SessionLocal()
    try:
        sp = models.Spot(name="Kleiner Teich", lat=47.7, lon=9.6)
        db.add(sp)
        db.commit()
        spot_id = sp.id
        db.get(models.User, b[0]).settings_json = '{"show_active_spot": false}'
        db.commit()
    finally:
        db.close()
    monkeypatch.setattr(devices, "_aktive_nutzer", lambda db: {b[0]})
    monkeypatch.setattr(devices, "_spot_des_nutzers", lambda db, uid, spots: spot_id)
    devices._AKTIV_CACHE = None
    # Freund a sieht den Spot gruen (trotz show_active_spot aus und unter der Schwelle), c nicht.
    fa = client.get("/api/community/spot-active", headers=a[1]).json()
    assert [f["spot_id"] for f in fa["friends"]] == [spot_id] and spot_id not in fa["spots"]
    assert client.get("/api/community/spot-active", headers=c[1]).json()["friends"] == []
    # Startseite: nur Freunde sehen, wer wo pumpt.
    assert [f["spot_id"] for f in client.get("/api/friends/active", headers=a[1]).json()] == [spot_id]
    assert client.get("/api/friends/active", headers=c[1]).json() == []
    hier = client.get(f"/api/community/sessions-today?since_ms=0&spot={spot_id}&sport=all", headers=a[1]).json()
    assert hier["pumping_here"] is True and hier["friends_here"][0]["user_id"] == b[0]
    assert "friends_here" not in client.get(f"/api/community/sessions-today?since_ms=0&spot={spot_id}&sport=all",
                                             headers=c[1]).json()
    # Push: genau einmal an a, nicht an c; der zweite Lauf schweigt (MELDE_PAUSE).
    gesendet = []
    monkeypatch.setattr(freunde, "push", lambda db, an, art, url, **kw: gesendet.append((an, art)))
    db = SessionLocal()
    try:
        assert freunde.melden(db) == 1
        assert freunde.melden(db) == 0
    finally:
        db.close()
    assert gesendet == [(a[0], "pumpt")]


@pytest.mark.parametrize("art", ["anfrage", "pumpt"])
def test_push_texte_sprache(art):
    from types import SimpleNamespace
    from app import freunde
    de = freunde.text(SimpleNamespace(language="gsw"), art, n="Jan", s="Illmensee")
    en = freunde.text(SimpleNamespace(language="fr"), art, n="Jan", s="Illmensee")
    assert "Jan" in de and "Jan" in en and de != en
