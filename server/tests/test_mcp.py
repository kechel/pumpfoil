"""Der ganze MCP-Weg: Client anmelden -> zustimmen -> Token holen -> Werkzeuge rufen.

Getestet wird vor allem DIE GRENZE (Jan, 25.09.2026): nur lesend, nur eigene, keine
aussortierten, keine geloeschten Aufnahmen. Die Grenze steht in EINER Abfrage (`mcp._eigene`) —
wenn sie faellt, faellt sie still, und genau deshalb gibt es hier Tests dafuer.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
from datetime import datetime, timedelta, timezone


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def _konto(client, mail: str) -> str:
    r = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"})
    assert r.status_code in (200, 201), r.text
    return r.json()["access_token"]


def _client_anmelden(client) -> str:
    r = client.post("/oauth/register", json={
        "client_name": "Test-Agent",
        "redirect_uris": ["http://127.0.0.1:7777/cb"],
        "token_endpoint_auth_method": "none",
    })
    assert r.status_code == 201, r.text
    return r.json()["client_id"]


def _zugang(client, jwt: str, client_id: str) -> str:
    """Zustimmen, Code einloesen, Access-Token zurueck."""
    verifier, challenge = _pkce()
    r = client.post("/oauth/consent",
                    headers={"Authorization": f"Bearer {jwt}"},
                    json={"client_id": client_id, "redirect_uri": "http://127.0.0.1:7777/cb",
                          "code_challenge": challenge})
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    r = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": "http://127.0.0.1:7777/cb", "client_id": client_id,
        "code_verifier": verifier})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _ruf(client, token: str, werkzeug: str, args: dict | None = None):
    r = client.post("/mcp", headers={"Authorization": f"Bearer {token}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                          "params": {"name": werkzeug, "arguments": args or {}}})
    assert r.status_code == 200, r.text
    return r.json()["result"]["structuredContent"]


def test_metadaten_zeigen_auf_die_oeffentliche_adresse(client):
    """Die Metadaten duerfen NIE aus dem Request gebaut werden — der Proxy steht woanders."""
    d = client.get("/.well-known/oauth-authorization-server").json()
    for schluessel in ("issuer", "authorization_endpoint", "token_endpoint",
                       "registration_endpoint", "revocation_endpoint"):
        assert d[schluessel].startswith("https://"), (schluessel, d[schluessel])
        assert "testserver" not in d[schluessel] and "localhost" not in d[schluessel]
    assert d["code_challenge_methods_supported"] == ["S256"]   # `plain` gibt es nicht
    assert d["token_endpoint_auth_methods_supported"] == ["none"]


def test_ohne_token_401_mit_wegweiser(client):
    r = client.post("/mcp", json={"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert r.status_code == 401
    # Ohne diesen Kopf findet ein MCP-Client den Autorisierungsserver nicht (RFC 9728).
    assert "oauth-protected-resource" in r.headers.get("www-authenticate", "")


def test_anmelde_token_der_website_gilt_hier_nicht(client):
    """Der gefaehrlichste Verwechslungsfall: ein Login-JWT darf KEIN MCP-Token sein."""
    jwt = _konto(client, "mcp-verwechslung@b.de")
    r = client.post("/mcp", headers={"Authorization": f"Bearer {jwt}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    assert r.status_code == 401


def test_register_lehnt_fremde_rueckkehradresse_ab(client):
    r = client.post("/oauth/register", json={"redirect_uris": ["http://boese.example/cb"]})
    assert r.status_code == 400
    assert r.json()["error"] == "invalid_redirect_uri"


def test_pkce_muss_passen(client):
    jwt = _konto(client, "mcp-pkce@b.de")
    cid = _client_anmelden(client)
    _verifier, challenge = _pkce()
    code = client.post("/oauth/consent", headers={"Authorization": f"Bearer {jwt}"},
                       json={"client_id": cid, "redirect_uri": "http://127.0.0.1:7777/cb",
                             "code_challenge": challenge}).json()["code"]
    r = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": "http://127.0.0.1:7777/cb", "client_id": cid,
        "code_verifier": "etwas-ganz-anderes"})
    assert r.status_code == 400 and r.json()["error"] == "invalid_grant"


def test_code_nur_einmal_und_danach_alles_zu(client):
    """Ein zweiter Einloeseversuch heisst: der Code wurde abgefangen (RFC 6749 §10.5)."""
    jwt = _konto(client, "mcp-zweimal@b.de")
    cid = _client_anmelden(client)
    verifier, challenge = _pkce()
    code = client.post("/oauth/consent", headers={"Authorization": f"Bearer {jwt}"},
                       json={"client_id": cid, "redirect_uri": "http://127.0.0.1:7777/cb",
                             "code_challenge": challenge}).json()["code"]
    daten = {"grant_type": "authorization_code", "code": code,
             "redirect_uri": "http://127.0.0.1:7777/cb", "client_id": cid,
             "code_verifier": verifier}
    erst = client.post("/oauth/token", data=daten)
    assert erst.status_code == 200
    refresh = erst.json()["refresh_token"]
    zweit = client.post("/oauth/token", data=daten)
    assert zweit.status_code == 400
    # Und die Tokens aus dem ersten Tausch sind jetzt ebenfalls tot.
    r = client.post("/oauth/token", data={"grant_type": "refresh_token",
                                          "refresh_token": refresh})
    assert r.status_code == 400


def test_refresh_rotiert_und_altes_token_schliesst_die_kette(client):
    jwt = _konto(client, "mcp-rotation@b.de")
    cid = _client_anmelden(client)
    verifier, challenge = _pkce()
    code = client.post("/oauth/consent", headers={"Authorization": f"Bearer {jwt}"},
                       json={"client_id": cid, "redirect_uri": "http://127.0.0.1:7777/cb",
                             "code_challenge": challenge}).json()["code"]
    erst = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": "http://127.0.0.1:7777/cb", "client_id": cid,
        "code_verifier": verifier}).json()
    zweit = client.post("/oauth/token", data={"grant_type": "refresh_token",
                                              "refresh_token": erst["refresh_token"]})
    assert zweit.status_code == 200
    assert zweit.json()["refresh_token"] != erst["refresh_token"]
    # Das ALTE noch einmal: kopiert -> alles zu.
    nochmal = client.post("/oauth/token", data={"grant_type": "refresh_token",
                                                "refresh_token": erst["refresh_token"]})
    assert nochmal.status_code == 400


# --- DIE GRENZE ---------------------------------------------------------------------------------
#
# Ab hier wird geprueft, was ein Token NICHT oeffnet. Diese Tests sind der eigentliche Grund, aus
# dem die Datei existiert: die Grenze steht in EINER Abfrage, und wenn sie faellt, faellt sie
# lautlos — die Antwort saehe genauso aus, nur mit mehr Zeilen darin.

def _session_anlegen(user_id: int, **felder):
    """Eine Aufnahme direkt in die DB. Absichtlich ohne Ingest: hier geht es um die Sichtbarkeit,
    nicht um die Auswertung."""
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = models.Session(
            session_uuid=secrets.token_hex(16), user_id=user_id,
            started_at=datetime.now(timezone.utc) - timedelta(hours=2),
            ended_at=datetime.now(timezone.utc) - timedelta(hours=1),
            sport=felder.pop("sport", "pumpfoil"),
            place_name=felder.pop("place_name", "Teststrand"),
            is_pumpfoil=felder.pop("is_pumpfoil", True), **felder)
        db.add(s)
        db.commit()
        return s.id
    finally:
        db.close()


def _user_id(client, jwt: str) -> int:
    return client.get("/api/auth/me", headers={"Authorization": f"Bearer {jwt}"}).json()["id"]


def test_nur_eigene_gueltige_sessions(client):
    jwt = _konto(client, "mcp-grenze@b.de")
    fremd_jwt = _konto(client, "mcp-fremd@b.de")
    ich, fremder = _user_id(client, jwt), _user_id(client, fremd_jwt)

    meine = _session_anlegen(ich)
    aussortiert = _session_anlegen(ich, is_pumpfoil=False)
    unklar = _session_anlegen(ich, is_pumpfoil=None)
    geloescht = _session_anlegen(ich, deleted=True)
    fremde = _session_anlegen(fremder)

    token = _zugang(client, jwt, _client_anmelden(client))
    ids = {s["session_id"] for s in _ruf(client, token, "list_sessions")["sessions"]}
    assert meine in ids
    for verboten in (aussortiert, unklar, geloescht, fremde):
        assert verboten not in ids, f"Session {verboten} haette nicht erscheinen duerfen"

    # Und einzeln abrufen geht auch nicht — mit derselben Antwort fuer alle vier Faelle, damit
    # der MCP kein Orakel fuer fremde IDs wird.
    for verboten in (aussortiert, unklar, geloescht, fremde):
        assert "fehler" in _ruf(client, token, "get_session", {"session_id": verboten})
    assert _ruf(client, token, "get_session", {"session_id": meine})["session_id"] == meine


def test_stats_zaehlen_nur_die_eigenen(client):
    jwt = _konto(client, "mcp-stats@b.de")
    fremd_jwt = _konto(client, "mcp-stats-fremd@b.de")
    ich, fremder = _user_id(client, jwt), _user_id(client, fremd_jwt)
    _session_anlegen(ich)
    for _ in range(3):
        _session_anlegen(fremder)
    token = _zugang(client, jwt, _client_anmelden(client))
    assert _ruf(client, token, "get_stats")["sessions"] == 1


def test_es_gibt_nichts_schreibendes(client):
    """Jedes angebotene Werkzeug muss lesend sein. Der Test faellt, sobald jemand eines
    ergaenzt, dessen Name nach Veraenderung klingt — dann ist diese Zeile der Ort, an dem die
    Entscheidung noch einmal getroffen wird."""
    jwt = _konto(client, "mcp-readonly@b.de")
    token = _zugang(client, jwt, _client_anmelden(client))
    r = client.post("/mcp", headers={"Authorization": f"Bearer {token}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    namen = [w["name"] for w in r.json()["result"]["tools"]]
    assert namen, "keine Werkzeuge angeboten"
    for n in namen:
        assert n.split("_")[0] in ("list", "get"), f"Werkzeug {n} klingt nicht lesend"
    for verboten in ("set", "update", "delete", "create", "merge", "write", "post"):
        assert not any(n.startswith(verboten) for n in namen)


def test_anleitung_nennt_die_fallen(client):
    """Die Erklaerung fuer den Agenten ist der Unterschied zwischen Auswertung und Unsinn."""
    jwt = _konto(client, "mcp-anleitung@b.de")
    token = _zugang(client, jwt, _client_anmelden(client))
    r = client.post("/mcp", headers={"Authorization": f"Bearer {token}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "initialize"})
    text = r.json()["result"]["instructions"]
    for muss in ("accel_hz_measured", "longest_glide_s", "time_base", "geschaetzt"):
        assert muss in text, f"{muss} fehlt in der Anleitung"


def test_widerruf_macht_zu(client):
    jwt = _konto(client, "mcp-widerruf@b.de")
    cid = _client_anmelden(client)
    verifier, challenge = _pkce()
    code = client.post("/oauth/consent", headers={"Authorization": f"Bearer {jwt}"},
                       json={"client_id": cid, "redirect_uri": "http://127.0.0.1:7777/cb",
                             "code_challenge": challenge}).json()["code"]
    tok = client.post("/oauth/token", data={
        "grant_type": "authorization_code", "code": code,
        "redirect_uri": "http://127.0.0.1:7777/cb", "client_id": cid,
        "code_verifier": verifier}).json()
    assert client.post("/oauth/revoke", data={"token": tok["refresh_token"]}).status_code == 200
    r = client.post("/oauth/token", data={"grant_type": "refresh_token",
                                          "refresh_token": tok["refresh_token"]})
    assert r.status_code == 400
    # Ein unbekanntes Token: ebenfalls 200, sonst waere die Antwort ein Orakel.
    assert client.post("/oauth/revoke", data={"token": "gibtsnicht"}).status_code == 200


def test_overview_ist_das_erste_werkzeug_und_nennt_die_filter(client):
    """Der Einstieg muss oben stehen UND sagen, dass er der Einstieg ist — mehr Mittel als Text
    und Reihenfolge hat MCP nicht."""
    jwt = _konto(client, "mcp-overview@b.de")
    ich = _user_id(client, jwt)
    _session_anlegen(ich, sport="pumpfoil")
    _session_anlegen(ich, sport="wingfoil")
    _session_anlegen(ich, sport="wingfoil")
    token = _zugang(client, jwt, _client_anmelden(client))

    r = client.post("/mcp", headers={"Authorization": f"Bearer {token}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    werkzeuge = r.json()["result"]["tools"]
    assert werkzeuge[0]["name"] == "get_overview"
    assert "ZUERST" in werkzeuge[0]["description"]

    u = _ruf(client, token, "get_overview")
    assert u["sessions"] == 3
    je_sport = {x["wert"]: x["aufnahmen"] for x in u["je_sportart"]}
    assert je_sport == {"pumpfoil": 1, "wingfoil": 2}
    # Und die Werte muessen als Filter WIRKLICH funktionieren — sonst ist der Einstieg eine
    # Behauptung.
    gefiltert = _ruf(client, token, "list_sessions", {"sportart": "wingfoil"})
    assert gefiltert["gesamt"] == 2


def test_overview_zeigt_auch_hier_nichts_fremdes(client):
    jwt = _konto(client, "mcp-ov-grenze@b.de")
    fremd = _konto(client, "mcp-ov-fremd@b.de")
    ich, anderer = _user_id(client, jwt), _user_id(client, fremd)
    _session_anlegen(ich, sport="pumpfoil", place_name="Meiner")
    _session_anlegen(anderer, sport="wingfoil", place_name="Seiner")
    _session_anlegen(ich, is_pumpfoil=False, sport="autofahrt")
    token = _zugang(client, jwt, _client_anmelden(client))
    u = _ruf(client, token, "get_overview")
    assert u["sessions"] == 1
    assert [x["wert"] for x in u["je_sportart"]] == ["pumpfoil"]
    assert [x["wert"] for x in u["je_spot"]] == ["Meiner"]


def test_lage_nur_am_brett_und_get_session_sagt_es(client):
    """Jans Agent hielt die Lage-Daten am 25.09.2026 fuer fehlend — sie kamen nie am MCP an.

    Geprueft wird beides: dass es das Werkzeug gibt, und dass `get_session` DARAUF ZEIGT statt
    zu schweigen. Ein Agent soll nicht schliessen muessen, was da ist.
    """
    jwt = _konto(client, "mcp-lage@b.de")
    ich = _user_id(client, jwt)
    am_brett = _session_anlegen(ich, placement="board")
    am_arm = _session_anlegen(ich)
    token = _zugang(client, jwt, _client_anmelden(client))

    r = client.post("/mcp", headers={"Authorization": f"Bearer {token}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
    assert "get_board_attitude" in [w["name"] for w in r.json()["result"]["tools"]]

    assert "get_board_attitude" in _ruf(client, token, "get_session",
                                        {"session_id": am_brett})["lage_je_lauf"]
    assert "Nicht vorhanden" in _ruf(client, token, "get_session",
                                     {"session_id": am_arm})["lage_je_lauf"]

    # Am Arm: klare Absage statt einer Zahl, die das Brett meinen wuerde.
    ohne = _ruf(client, token, "get_board_attitude", {"session_id": am_arm})
    assert ohne["am_brett"] is False
    # Am Brett, aber ohne Rohdaten in dieser Testzeile: ein benannter Grund, kein Absturz.
    mit = _ruf(client, token, "get_board_attitude", {"session_id": am_brett})
    assert mit["session_id"] == am_brett and ("fehler" in mit or "laeufe" in mit)

    # Und die Grenze gilt auch hier.
    fremd = _konto(client, "mcp-lage-fremd@b.de")
    fremde = _session_anlegen(_user_id(client, fremd), placement="board")
    assert "fehler" in _ruf(client, token, "get_board_attitude", {"session_id": fremde})
