"""Wertungsklasse (10.11.2026): Profilfeld + Filter der Event-Bestenlisten nach Frauen/Maenner/nicht-binaer.

Regeln (Jan): eine Klasse wird angeboten, sobald mindestens KLASSE_MIN Teilnehmende sie haben (seit 11.11.2026: 1,
vorher 3); bleibt danach nur eine Klasse
uebrig (z. B. reines Frauen-Event), gibt es gar keinen Filter. Gefiltert wird mit Rang in der Klasse.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone


def _drossel_weg():
    """Mehr als 5 Konten in einem Test: die Registrierungs-Drossel (5/h je IP) zwischendurch leeren."""
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        db.query(models.RateEvent).delete()
        db.commit()
    finally:
        db.close()


def _konto(client, mail: str, name: str, klasse: str | None = None) -> tuple[int, dict]:
    _drossel_weg()
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.put("/api/auth/me", headers=kopf, json={"display_name": name})
    if klasse is not None:
        client.put("/api/settings", headers=kopf, json={"wertungsklasse": klasse})
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _session(uid: int, pumps: int) -> None:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(hours=5)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t,
                           ended_at=t + timedelta(minutes=40), sport="pumpfoil", sport_class="pumpfoil",
                           is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s)
        db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=3,
                                     pump_count=pumps, foiling_distance_m=300.0, best_distance_m=100.0))
        db.commit()
    finally:
        db.close()


def _klassen_cache_leeren():
    from app import teams as T
    T._KLASSEN.update({"zeit": 0.0, "map": {}})


def test_profilfeld_nur_gueltige_werte(client):
    _uid, k = _konto(client, "wk-feld@t.de", "Wk Feld", "nb")
    assert client.get("/api/settings", headers=k).json()["wertungsklasse"] == "nb"
    client.put("/api/settings", headers=k, json={"wertungsklasse": "x"})
    assert client.get("/api/settings", headers=k).json()["wertungsklasse"] == "nb"     # Unsinn wird ignoriert
    client.put("/api/settings", headers=k, json={"wertungsklasse": ""})
    assert client.get("/api/settings", headers=k).json()["wertungsklasse"] == ""       # zurueck auf keine Angabe


def test_globales_event_filter_nach_wertungsklasse(client, monkeypatch):
    from app import models
    from app.db import SessionLocal
    off, ko = _konto(client, "wk-off@t.de", "Wk Offiziell")
    slug = client.post("/api/teams", headers=ko, json={"name": "Wk Offiziell Team"}).json()["slug"]
    monkeypatch.setenv("TEAM_GLOBAL", slug)
    leute = [("w", 400), ("w", 300), ("w", 200), ("w", 100), ("m", 350), ("m", 250), ("m", 150), ("nb", 500), (None, 450)]
    namen = {}
    for i, (kl, pumps) in enumerate(leute):
        uid, _k = _konto(client, f"wk-{i}@t.de", f"Wk Fahrer {i}", kl)
        _session(uid, pumps)
        namen[uid] = (kl, pumps)
    _klassen_cache_leeren()
    jetzt = datetime.now(timezone.utc)
    ev = client.post(f"/api/teams/{slug}/events", headers=ko, json={
        "titel": "Wk Global", "start": (jetzt - timedelta(days=1)).isoformat(), "ende": (jetzt + timedelta(days=1)).isoformat(),
        "tafeln": [{"kennzahl": "sum_pumps", "accel_only": False}], "global_event": True})
    assert ev.status_code == 200, ev.text
    eid = ev.json()["id"]
    alle = client.get(f"/api/teams/{slug}/events/{eid}", headers=ko).json()
    # Grenze 1 (Jan, 11.11.2026): auch nb mit 1 Person ist im Angebot
    assert alle["klassen"] == {"w": 4, "m": 3, "nb": 1} and alle["klasse"] is None
    frauen = client.get(f"/api/teams/{slug}/events/{eid}?klasse=w", headers=ko).json()
    z = [r for r in frauen["tafeln"][0]["zeilen"] if r["user_id"] in namen]
    assert [namen[r["user_id"]] for r in z] == [("w", 400), ("w", 300), ("w", 200), ("w", 100)]
    assert [r["rang"] for r in z] == [1, 2, 3, 4] and frauen["klasse"] == "w"
    assert all(r["rang_gesamt"] >= r["rang"] for r in z)                       # Gesamtrang bleibt sichtbar
    nb = client.get(f"/api/teams/{slug}/events/{eid}?klasse=nb", headers=ko).json()
    assert nb["klasse"] == "nb" and [namen[r["user_id"]] for r in nb["tafeln"][0]["zeilen"] if r["user_id"] in namen] == [("nb", 500)]
    unbekannt = client.get(f"/api/teams/{slug}/events/{eid}?klasse=xy", headers=ko).json()
    assert unbekannt["klasse"] is None and len(unbekannt["tafeln"][0]["zeilen"]) >= len(leute)   # unbekannt -> kein Filter
    # Gaeste-Link: kein Filter
    assert client.get(f"/api/public/teams/{slug}/events/{eid}?klasse=w").json().get("klassen") in ({}, None)
    db = SessionLocal()
    try:
        assert db.query(models.TeamEvent).get(eid) is not None
    finally:
        db.close()


def test_nur_eine_klasse_kein_filter(client):
    """Reines Frauen-Event (Team nur aus Frauen): kein Filter, auch wenn 3+ Frauen teilnehmen."""
    leiterin, kl = _konto(client, "wk-girls-l@t.de", "Wk Leiterin", "w")
    slug = client.post("/api/teams", headers=kl, json={"name": "Wk Girls"}).json()["slug"]
    client.put(f"/api/teams/{slug}", headers=kl, json={"anmeldungen_zulassen": True, "automatisch_akzeptieren": True})
    tok = client.post(f"/api/teams/{slug}/einladungen/join/neu", headers=kl).json()["join"]
    _session(leiterin, 100)
    for i in range(3):
        uid, k = _konto(client, f"wk-girl-{i}@t.de", f"Wk Girl {i}", "w")
        client.post(f"/api/teams/einladung/{tok}", headers=k)
        _session(uid, 200 + i)
    _klassen_cache_leeren()
    jetzt = datetime.now(timezone.utc)
    eid = client.post(f"/api/teams/{slug}/events", headers=kl, json={
        "titel": "Wk Girls Only", "start": (jetzt - timedelta(days=1)).isoformat(), "ende": (jetzt + timedelta(days=1)).isoformat(),
        "tafeln": [{"kennzahl": "sum_pumps", "accel_only": False}]}).json()["id"]
    d = client.get(f"/api/teams/{slug}/events/{eid}", headers=kl).json()
    assert len(d["tafeln"][0]["zeilen"]) == 4 and d["klassen"] == {}
