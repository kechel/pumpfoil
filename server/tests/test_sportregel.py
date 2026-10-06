"""Sportart-Regel ohne KI (app/analysis/sportregel.py) und ihr Anwenden im Admin-Bereich.

Jans Vorgaben (06.10.2026): was automatisch eingeordnet wird, sieht der Besitzer in der Session —
und eine manuelle Zuordnung ueberschreibt das immer und bleibt als manuell markiert.
"""
from __future__ import annotations

import json
import secrets
from datetime import datetime, timedelta, timezone

from app.analysis import sportregel as R

WIND = {"tempo_med": 21.0, "dauer_med": 150, "anteil_foil": 0.7, "flaeche_km": 0.9, "kueste_km": 300.0,
        "zw_weg_m": 41, "zw_kmh": 4.5, "laeufe": 15}
WELLE = {"tempo_med": 14.5, "dauer_med": 15, "anteil_foil": 0.15, "flaeche_km": 0.3, "kueste_km": 0.8,
         "zw_weg_m": 43, "zw_kmh": 4.3, "laeufe": 20}
STEG = {"tempo_med": 15.5, "dauer_med": 20, "anteil_foil": 0.05, "flaeche_km": 0.01, "kueste_km": 346.0,
        "zw_weg_m": 18, "zw_kmh": 2.1, "laeufe": 12}


def test_regel_trennt_die_drei_muster():
    assert R.regel(WIND) == "wind"
    assert R.regel(WELLE) == "welle"
    assert R.regel(STEG) == "pump"


def test_welle_braucht_das_meer():
    """Dasselbe Muster auf einem Binnensee ist keine Welle (Illmensee, Senden: schnelle Pumper)."""
    assert R.regel({**WELLE, "kueste_km": 150.0}) == "pump"
    # Fehlt die Kuestendatei auf dem Server (None), sagt die Regel nie Welle.
    assert R.regel({**WELLE, "kueste_km": None}) == "pump"


def test_spot_gegenprobe_nur_fuer_welle():
    """Hafenbecken an der Kueste: pumpen dort fast alle anderen, ist es keine Welle. Fuer Wind gilt
    das NICHT — Wing und Pump teilen sich viele Seen."""
    assert R.regel(WELLE, ["pump", "pump", "pump"]) == "pump"
    assert R.regel(WELLE, ["pump"]) == "welle"                  # ein anderer Fahrer reicht nicht
    assert R.regel(WELLE, ["pump", "welle", "wind"]) == "welle"  # kein klarer Pump-Spot
    assert R.regel(WIND, ["pump", "pump", "pump"]) == "wind"


def test_merkmale_aus_laeufen_und_punkten():
    """Laufstart/-ende im Segment-Format [lon, lat]; zwischen den Laeufen wird aus den GPS-Punkten
    (Session-ms) das Tempo gerechnet."""
    segs, gps = [], []
    for i in range(4):
        t0 = i * 60_000
        segs.append({"avg_speed_mps": 4.0, "duration_s": 15.0, "t_start_session_ms": t0,
                     "t_end_session_ms": t0 + 15_000,
                     "start_pt": [9.0 + i * 0.001, 47.0], "end_pt": [9.0 + i * 0.001, 47.001]})
    for k in range(0, 240_000, 1000):
        gps.append([k, 47.0 + (k % 60_000) / 60_000 * 0.001, 9.0, 4.0])
    m = R.merkmale(segs, gps, 240)
    assert m["laeufe"] == 4 and m["tempo_med"] == 14.4 and m["dauer_med"] == 15
    assert m["anteil_foil"] == 0.25
    assert 125 < m["zw_weg_m"] < 145          # Ende -> naechster Start: 111 m Nord + 76 m Ost = 134 m
    assert m["zw_kmh"] > 0


def _admin_und_besitzer(client, tag):
    from app import models
    from app.db import SessionLocal
    kopf = {}
    ids = {}
    for rolle in ("admin", "owner"):
        r = client.post("/api/auth/register", json={"email": f"sr-{rolle}-{tag}@b.de", "password": "supersecret"})
        kopf[rolle] = {"Authorization": f"Bearer {r.json()['access_token']}"}
        ids[rolle] = client.get("/api/auth/me", headers=kopf[rolle]).json()["id"]
    db = SessionLocal()
    try:
        db.get(models.User, ids["admin"]).is_admin = True
        s = models.Session(session_uuid=secrets.token_hex(16), user_id=ids["owner"],
                           started_at=datetime.now(timezone.utc) - timedelta(hours=2),
                           ended_at=datetime.now(timezone.utc) - timedelta(hours=1),
                           sport="windsurfing", sport_class="pumpfoil", sport_source="default",
                           is_pumpfoil=True, status="analyzed")
        db.add(s); db.commit()
        db.add(models.AnalysisResult(session_id=s.id, algo_version="test", segments_json="[]",
                                     metrics_json=json.dumps({"sportregel": WIND})))
        db.commit()
        sid = s.id
    finally:
        db.close()
    return kopf, sid


def test_anwenden_ordnet_automatisch_ein_und_besitzer_ueberstimmt(client, monkeypatch):
    from app import models
    from app.api import sessions as S
    from app.db import SessionLocal
    monkeypatch.setattr(S, "run_analysis", lambda db, s, *a, **k: None)
    monkeypatch.setattr(S, "_spot_nachziehen", lambda db, s: None)
    kopf, sid = _admin_und_besitzer(client, "a")

    # Liste: die Session weicht ab (jetzt Pumpfoil, Regel sagt Wind) und ist anwendbar.
    r = client.get("/api/admin/sportregel", headers=kopf["admin"])
    assert r.status_code == 200, r.text
    zeile = [x for x in r.json()["items"] if x["session_id"] == sid][0]
    assert zeile["urteil"] == "wind" and zeile["anwendbar"] and zeile["vorschlag"] == "wingfoil"

    # Gegen die Regel geht es nicht (Welle ist nicht Wind).
    r = client.post(f"/api/admin/sportregel/{sid}/anwenden", headers=kopf["admin"], json={"sport": "surf_wave"})
    assert r.status_code == 409

    r = client.post(f"/api/admin/sportregel/{sid}/anwenden", headers=kopf["admin"], json={"sport": "wingfoil"})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "sport_class": "wingfoil", "sport_source": "auto"}

    # Der Besitzer SIEHT es: sport_auto mit Regel-Hinweis — und OHNE `merkmale`, sonst bauten die
    # Apps die Begruendung der alten Langlauf-Erkennung daraus.
    d = client.get(f"/api/sessions/{sid}", headers=kopf["owner"]).json()
    assert d["sport_source"] == "auto"
    assert d["sport_auto"]["hinweis"] == "regel.wind"
    assert "merkmale" not in d["sport_auto"] and d["sport_auto"]["regel"]["dauer_med"] == 150

    # Der Besitzer ueberstimmt mit einem Klick -> manuell, und das bleibt so.
    r = client.put(f"/api/sessions/{sid}/classification", headers=kopf["owner"], json={"sport": "pumpfoil"})
    assert r.status_code == 200, r.text
    assert r.json()["sport_source"] == "owner"
    d = client.get(f"/api/sessions/{sid}", headers=kopf["owner"]).json()
    assert d["sport_auto"] is None

    # ... und die Regel kommt nie wieder dagegen an.
    r = client.post(f"/api/admin/sportregel/{sid}/anwenden", headers=kopf["admin"], json={"sport": "wingfoil"})
    assert r.status_code == 409
    zeile = [x for x in client.get("/api/admin/sportregel", headers=kopf["admin"]).json()["items"]
             if x["session_id"] == sid][0]
    assert zeile["anwendbar"] is False
    db = SessionLocal()
    try:
        assert db.get(models.Session, sid).sport_class == "pumpfoil"
    finally:
        db.close()


def test_reanalyse_ueberschreibt_regel_urteil_nicht():
    """Die automatische Langlauf-Erkennung in run_analysis greift nur bei sport_source „default" —
    ein angewandtes Regel-Urteil („auto") bleibt stehen. Hier nur die Bedingung selbst geprueft."""
    import inspect
    from app import analysis
    quelle = inspect.getsource(analysis.run_analysis)
    assert '(session.sport_source or "default") == "default"' in quelle


def test_nur_admins(client):
    r = client.post("/api/auth/register", json={"email": "sr-nix@b.de", "password": "supersecret"})
    kopf = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/api/admin/sportregel", headers=kopf).status_code == 403
    assert client.post("/api/admin/sportregel/1/anwenden", headers=kopf, json={"sport": "wingfoil"}).status_code == 403
