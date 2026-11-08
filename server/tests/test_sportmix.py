"""Gemischte Ranglisten Pumpfoil + Foil Scoot (08.11.2026, app/sportmix.py): ein Schluessel `pumpfoil+foil_scoot`
filtert auf beide Sportarten, jede Zeile traegt ein Abzeichen ihrer Sportart, Events bekommen die gemischte
Bestenliste nur, wenn es dieselbe Kennzahl fuer beide Sportarten gibt."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone

MIX = "pumpfoil+foil_scoot"


def _frei():
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    db.query(models.RateEvent).delete()      # Registrieren ist auf 5 je Stunde begrenzt
    db.commit()
    db.close()


def _konto(client, mail: str, name: str) -> tuple[int, dict]:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.put("/api/auth/me", headers=kopf, json={"display_name": name})
    return client.get("/api/auth/me", headers=kopf).json()["id"], kopf


def _session(uid: int, sport: str, dist: float, stunden: float = 5) -> int:
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        t = datetime.now(timezone.utc) - timedelta(hours=stunden)
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=uid, started_at=t,
                           ended_at=t + timedelta(minutes=40), sport="pumpfoil", sport_class=sport,
                           is_pumpfoil=True, status="analyzed", data_quality="ok")
        db.add(s)
        db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", detection="model", num_runs=3,
                                     pump_count=50, foiling_distance_m=dist, best_distance_m=dist / 3,
                                     best_duration_s=dist / 10))
        db.commit()
        return s.id
    finally:
        db.close()


def test_schluessel():
    from app import sportmix
    assert sportmix.teile(MIX) == ("pumpfoil", "foil_scoot")
    assert sportmix.teile("pumpfoil") is None and sportmix.teile("pumpfoil+quatsch") is None
    assert sportmix.gueltig("quatsch") == "pumpfoil" and sportmix.gueltig(MIX) == MIX
    assert sportmix.schluessel(["foil_scoot", "pumpfoil"]) == MIX
    assert sportmix.angeboten({"pumpfoil", "foil_scoot", "wingfoil"}) == [MIX]
    assert sportmix.angeboten({"pumpfoil"}) == []


def test_gemischte_bestenliste_mit_abzeichen(client):
    _frei()
    (ip, kp), (isc, _ks) = _konto(client, "mix-p@t.de", "Mix Pumper"), _konto(client, "mix-s@t.de", "Mix Scooter")
    _session(ip, "pumpfoil", 9100)
    _session(isc, "foil_scoot", 9900)
    sp = {x["sport"]: x for x in client.get("/api/community/sports", headers=kp).json()}
    assert MIX not in sp                                  # alte Clients: ohne mix=1 keine Mischung
    sp = {x["sport"]: x for x in client.get("/api/community/sports?mix=1", headers=kp).json()}
    assert sp[MIX]["teile"] == ["pumpfoil", "foil_scoot"]
    assert sp[MIX]["runs"] == sp["pumpfoil"]["runs"] + sp["foil_scoot"]["runs"]

    def zeilen(sport):
        d = client.get(f"/api/community/leaders?period=10d&sport={sport}", headers=kp).json()
        return {z["user_id"]: z for z in d["distance"]}, {z["user_id"]: z for z in d["run_distance"]}

    summe, lauf = zeilen("pumpfoil")
    assert ip in summe and isc not in summe and "sportarten" not in summe[ip]   # getrennte Liste: kein Abzeichen
    summe, lauf = zeilen(MIX)
    assert summe[ip]["sportarten"] == ["pumpfoil"] and summe[isc]["sportarten"] == ["foil_scoot"]
    assert lauf[isc]["sportarten"] == ["foil_scoot"] and lauf[isc]["session_id"]
    rek = client.get(f"/api/community/records?sport={MIX}&period=10d&accel_only=true", headers=kp).json()["10d"]
    assert rek["distance"]["sportarten"] in (["pumpfoil"], ["foil_scoot"])


def test_event_gemischte_bestenliste(client, monkeypatch):
    from app import models
    from app.db import SessionLocal
    _frei()
    uid, adm = _konto(client, "mix-adm@t.de", "Mix Admin")
    db = SessionLocal()
    db.get(models.User, uid).is_admin = True
    db.commit()
    db.close()
    (io, ko) = _konto(client, "mix-off@t.de", "Mix Offiziell")
    (ip, _kp), (isc, _ks) = _konto(client, "mix-ep@t.de", "Mix EP"), _konto(client, "mix-es@t.de", "Mix ES")
    slug = client.post("/api/teams", headers=ko, json={"name": "Mix Offiziell Team"}).json()["slug"]
    monkeypatch.setenv("TEAM_GLOBAL", slug)
    client.put(f"/api/teams/{slug}", headers=ko, json={"oeffentlich": True})
    client.post(f"/api/teams/{slug}/freigabe", headers=ko)
    tid = next(x["id"] for x in client.get("/api/admin/teams", headers=adm).json() if x["neu"]["slug"] == slug)
    client.post(f"/api/admin/teams/{tid}", headers=adm, json={"ok": True})
    _session(ip, "pumpfoil", 3000, stunden=2)
    _session(isc, "foil_scoot", 4000, stunden=2)
    jetzt = datetime.now(timezone.utc)
    body = {"titel": "Mix-Wochenende", "start": (jetzt - timedelta(days=1)).isoformat(),
            "ende": (jetzt + timedelta(days=1)).isoformat(), "global_event": True,
            "tafeln": [{"kennzahl": "sum_distance", "sportart": "pumpfoil", "accel_only": False},
                       {"kennzahl": "sum_runs", "sportart": "pumpfoil", "accel_only": False},
                       {"kennzahl": "sum_distance", "sportart": "foil_scoot", "accel_only": False}]}
    r = client.post(f"/api/teams/{slug}/events", headers=ko, json=body)
    assert r.status_code == 200, r.text
    ev = client.get(f"/api/teams/{slug}/events/{r.json()['id']}", headers=ko).json()
    # Gemischt nur „Total distance" (gibt es fuer beide), direkt hinter der Foil-Scoot-Liste; sum_runs nur Pumpfoil.
    assert [(t["kennzahl"], t["sportart"]) for t in ev["tafeln"]] == [
        ("sum_distance", "pumpfoil"), ("sum_runs", "pumpfoil"), ("sum_distance", "foil_scoot"), ("sum_distance", MIX)]
    mix = ev["tafeln"][3]
    z = {x["user_id"]: x for x in mix["zeilen"]}
    assert z[isc]["sportarten"] == ["foil_scoot"] and z[ip]["sportarten"] == ["pumpfoil"]
    assert z[isc]["rang"] < z[ip]["rang"]
    assert "sportarten" not in ev["tafeln"][0]["zeilen"][0]
    # Summenzeile der Event-Uebersicht nimmt weiter die erste echte Bestenliste.
    assert len({t["id"] for t in ev["tafeln"]}) == 4


def test_profil_standard_ansicht(client):
    _frei()
    _uid, k = _konto(client, "mix-prof@t.de", "Mix Profil")
    assert client.get("/api/settings", headers=k).json()["rangliste_sport"] == ""
    assert client.put("/api/settings", headers=k, json={"rangliste_sport": MIX}).json()["rangliste_sport"] == MIX
    assert client.put("/api/settings", headers=k, json={"rangliste_sport": "quatsch+x"}).json()["rangliste_sport"] == ""
    assert client.put("/api/settings", headers=k, json={"rangliste_sport": "pumpfoil"}).json()["rangliste_sport"] == ""
