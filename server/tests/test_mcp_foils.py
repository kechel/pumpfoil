"""MCP: oeffentliche Foil-Statistik (list_foils / get_foil_stats), Jan 22.11.2026 — gleiche Grenze wie die Uhren.

Gesichert wird: jeder Teil (Pumpfoil, Foil Scoot, Low End) nur mit mehr als drei Fahrern, sonst fehlt er; ohne Rest
fehlt das Foil ganz. Neue Felder kommen mit, brauchen aber eine Erklaerung.
"""
from __future__ import annotations

import secrets

from app import mcp_foils
from app.api import community

from test_mcp import _client_anmelden, _konto, _ruf, _zugang


def _z(fid, brand, model, size, users, scoot_users=None, le_fahrer=0):
    z = {"foil_id": fid, "brand": brand, "model": model, "size": size, "aspect_ratio": 9.1, "sessions": users * 5,
         "users": users, "avg_speed_kmh": 13.0, "meters_per_pump": 2.0, "best_distance_m": 3000, "best_duration_s": 700,
         "avg_pump_hz": 1.6, "low_end_kmh": 8.5 if le_fahrer else None, "low_end_laeufe": le_fahrer * 10,
         "low_end_fahrer": le_fahrer}
    if scoot_users is not None:
        z["scoot"] = {"sessions": scoot_users * 3, "users": scoot_users, "avg_speed_kmh": 15.0, "meters_per_pump": None,
                      "best_distance_m": 9000, "best_duration_s": 2000, "avg_pump_hz": None}
    return z


ZEILEN = [
    _z(1, "Gong", "Veloce", "1250", users=12, scoot_users=2, le_fahrer=6),
    _z(2, "Axis", "PNG", "1100", users=4, le_fahrer=3),
    _z(3, "Einzel", "Foil", "900", users=1),
    _z(4, "Scoot", "Only", "1500", users=0, scoot_users=5),
]


def _attrappe(monkeypatch, gesehen=None):
    def fs(only_board, min_run_s, mit_scoot, _user, db):
        if gesehen is not None:
            gesehen.append((only_board, min_run_s, mit_scoot))
        return [dict(z, **({"scoot": dict(z["scoot"])} if "scoot" in z else {})) for z in ZEILEN]
    monkeypatch.setattr(community, "foil_stats", fs)


def _token(client) -> str:
    return _zugang(client, _konto(client, f"foil-mcp-{secrets.token_hex(4)}@test.de"), _client_anmelden(client))


def test_liste_ohne_kleine_foils(client, monkeypatch):
    _attrappe(monkeypatch)
    r = _ruf(client, _token(client), "list_foils", {})
    assert {t["foil_id"] for t in r["treffer"]} == {1, 2, 4}
    assert [t["foil_id"] for t in _ruf(client, _token(client), "list_foils", {"name": "veloce gong"})["treffer"]] == [1]


def test_teile_einzeln_gekappt(client, monkeypatch):
    _attrappe(monkeypatch)
    tok = _token(client)
    gong = _ruf(client, tok, "get_foil_stats", {"foil_id": 1})["foil"]
    assert gong["low_end_kmh"] == 8.5 and "scoot" not in gong          # Scoot: 2 Fahrer
    axis = _ruf(client, tok, "get_foil_stats", {"name": "Axis PNG 1100"})["foil"]
    assert axis["users"] == 4 and "low_end_kmh" not in axis            # Low End: 3 Fahrer
    nur_scoot = _ruf(client, tok, "get_foil_stats", {"foil_id": 4})["foil"]
    assert "users" not in nur_scoot and nur_scoot["scoot"]["users"] == 5
    assert "fehler" in _ruf(client, tok, "get_foil_stats", {"foil_id": 3})


def test_schalter_wie_die_seite(client, monkeypatch):
    gesehen = []
    _attrappe(monkeypatch, gesehen)
    _ruf(client, _token(client), "list_foils", {"nur_brett": True, "min_lauf_s": 99999})
    assert gesehen[-1] == (True, mcp_foils.MAX_MIN_LAUF_S, True)


def test_neues_feld_kommt_mit_und_jedes_feld_erklaert(client, monkeypatch):
    ZEILEN[0]["neu_x"] = 7
    try:
        _attrappe(monkeypatch)
        r = _ruf(client, _token(client), "get_foil_stats", {"foil_id": 1})
        assert r["foil"]["neu_x"] == 7 and "neu_x" in r["felder"]
    finally:
        del ZEILEN[0]["neu_x"]
    bekannt = set(mcp_foils.ERKLAERUNG)
    for z in ZEILEN:
        assert set(z) | set(z.get("scoot") or {}) <= bekannt

