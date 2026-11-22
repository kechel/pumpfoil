"""MCP: oeffentliche Uhren-Statistik (list_watches / get_watch_stats), Jan 22.11.2026.

Gesichert wird: nur Modelle mit mehr als drei Fahrern, die Felder, die die Seite nicht zeigt, bleiben draussen, und
jedes Feld des Snapshots ist entweder erklaert oder bewusst verborgen (sonst ginge eine neue Spalte unbemerkt raus).
"""
from __future__ import annotations

import json
import os

from app import mcp_uhren
from app.api import appmeta, community

from test_mcp import _client_anmelden, _konto, _ruf, _zugang

QUAL = {"stand": "2026-11-21", "modelle": [
    {"plattform": "garmin", "modell": "fēnix® 8 47mm", "weg": "app", "sessions": 300, "nutzer": 27, "stunden": 351.5,
     "accel_hz": 25.0, "vollstaendig": 99.5, "urteil": "empfohlen", "abstuerze": 19, "puls_tot": 0.0},
    {"plattform": "garmin", "modell": "Instinct 3 Solar", "weg": "app", "sessions": 40, "nutzer": 3, "stunden": 30.0,
     "accel_hz": 25.0, "vollstaendig": 90.0, "urteil": "ok"},
], "modelle_konto": [
    {"plattform": "garmin", "modell": "fēnix® 8 47mm", "weg": "gc", "sessions": 16, "nutzer": 6, "stunden": 18.3,
     "accel_hz": 100.0, "vollstaendig": 100.0},
]}
FOIL = [
    {"watch": "fēnix® 8 47mm", "sessions": 320, "users": 28, "foiling_km": 900.1, "avg_speed_kmh": 14.2,
     "best_distance_m": 5000, "best_speed_kmh": 25.0, "avg_pump_hz": 1.4},
    {"watch": "Einzelstueck X", "sessions": 12, "users": 1, "foiling_km": 30.0, "avg_speed_kmh": 13.0,
     "best_distance_m": 4100, "best_speed_kmh": 22.0, "avg_pump_hz": 1.3},
]


def _attrappen(monkeypatch):
    monkeypatch.setattr(appmeta, "watch_quality", lambda: json.loads(json.dumps(QUAL)))
    monkeypatch.setattr(community, "watch_stats", lambda _user, db: [dict(z) for z in FOIL])


def _token(client) -> str:
    import secrets
    return _zugang(client, _konto(client, f"uhren-mcp-{secrets.token_hex(4)}@test.de"), _client_anmelden(client))


def test_suche_ohne_umlaute_und_ohne_kleine_modelle(client, monkeypatch):
    _attrappen(monkeypatch)
    tok = _token(client)
    r = _ruf(client, tok, "list_watches", {"name": "fenix 8"})
    assert [t["name"] for t in r["treffer"]] == ["fēnix® 8 47mm"]
    assert set(r["treffer"][0]["tabellen"]) == {"foiling", "aufnahme_qualitaet"}
    alle = {t["name"] for t in _ruf(client, tok, "list_watches", {})["treffer"]}
    assert "Instinct 3 Solar" not in alle          # 3 Fahrer
    assert "Einzelstueck X" not in alle            # 1 Fahrer


def test_details_wie_die_seite(client, monkeypatch):
    _attrappen(monkeypatch)
    tok = _token(client)
    r = _ruf(client, tok, "get_watch_stats", {"name": "fēnix® 8 47mm"})
    assert r["foiling"]["best_distance_m"] == 5000
    assert {z["weg"] for z in r["aufnahme_qualitaet"]} == {"app", "gc"}
    for z in r["aufnahme_qualitaet"]:
        assert not (set(z) & mcp_uhren.VERBORGEN)
    assert r["felder"]["accel_hz"]
    assert "urteil" not in r["felder"]


def test_kleines_modell_auch_per_namen_nicht(client, monkeypatch):
    _attrappen(monkeypatch)
    tok = _token(client)
    assert "fehler" in _ruf(client, tok, "get_watch_stats", {"name": "Einzelstueck X"})
    assert "fehler" in _ruf(client, tok, "get_watch_stats", {"name": "Instinct 3 Solar"})


def test_neues_feld_kommt_mit(client, monkeypatch):
    QUAL["modelle"][0]["neue_spalte"] = 1.5
    try:
        _attrappen(monkeypatch)
        r = _ruf(client, _token(client), "get_watch_stats", {"name": "fenix 8 47mm"})
        app_zeile = next(z for z in r["aufnahme_qualitaet"] if z["weg"] == "app")
        assert app_zeile["neue_spalte"] == 1.5
        assert "neue_spalte" in r["felder"]
    finally:
        del QUAL["modelle"][0]["neue_spalte"]


def test_jedes_feld_erklaert_oder_verborgen():
    """Kommt eine Spalte dazu: in mcp_uhren.ERKLAERUNG beschreiben — oder in VERBORGEN, wenn die Seite sie nicht zeigt."""
    bekannt = set(mcp_uhren.ERKLAERUNG) | mcp_uhren.VERBORGEN
    foil = {"watch", "sessions", "users", "foiling_km", "avg_speed_kmh", "best_distance_m", "best_speed_kmh",
            "avg_pump_hz"}
    assert foil <= set(mcp_uhren.ERKLAERUNG)
    pfad = appmeta.UHREN_JSON
    if os.path.exists(pfad):
        d = json.load(open(pfad, encoding="utf-8"))
        felder = {k for z in (d.get("modelle") or []) + (d.get("modelle_konto") or []) for k in z}
        assert felder <= bekannt, f"unbekannte Felder: {sorted(felder - bekannt)}"
