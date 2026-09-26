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


def test_lage_zwischenspeicher_verfaellt_bei_neuer_analyse():
    """Der Zwischenspeicher darf nie ein ueberholtes Ergebnis ausliefern.

    Der Schluessel ist ein Fingerabdruck der Eingaben (Algorithmus-Fassung, Trim, vorgegebene
    Drehung, Lauf-Segmente). Aendert sich eine davon, MUSS der Eintrag durchfallen — sonst
    zeigte der MCP nach einer Reanalyse still die alten Zahlen. Geprueft wird die Schluessel-
    Rechnung selbst, ohne Rohdaten: sie ist der ganze Riegel.
    """
    import hashlib

    def schluessel(algo, trim, rot, segmente):
        return hashlib.sha256("|".join([
            str(algo), str(trim), str(rot),
            hashlib.sha256((segmente or "").encode()).hexdigest(),
        ]).encode()).hexdigest()

    basis = schluessel("v2-windows-1", 0, None, '[{"t_start_ms": 0}]')
    assert basis == schluessel("v2-windows-1", 0, None, '[{"t_start_ms": 0}]')
    assert basis != schluessel("v3", 0, None, '[{"t_start_ms": 0}]')          # Reanalyse
    assert basis != schluessel("v2-windows-1", 5000, None, '[{"t_start_ms": 0}]')   # Trim
    assert basis != schluessel("v2-windows-1", 0, 180, '[{"t_start_ms": 0}]')       # Drehung
    assert basis != schluessel("v2-windows-1", 0, None, '[{"t_start_ms": 10}]')     # Laeufe


def test_liste_traegt_den_besten_lauf_und_kann_laeufe_mitliefern(client):
    """Jans Agent zog fuenfzig Mal `get_session`, nur um die laengste Lauf-Dauer zu bekommen."""
    jwt = _konto(client, "mcp-liste@b.de")
    ich = _user_id(client, jwt)
    _session_anlegen(ich)
    token = _zugang(client, jwt, _client_anmelden(client))
    zeile = _ruf(client, token, "list_sessions")["sessions"][0]
    for feld in ("bester_lauf_dauer_s", "bester_lauf_strecke_m", "bester_lauf_max_speed_mps"):
        assert feld in zeile, f"{feld} fehlt in der Listenzeile"
    # Ohne Schalter bleiben die Laeufe draussen, mit Schalter sind sie da.
    assert "laeufe_einzeln" not in zeile
    mit = _ruf(client, token, "list_sessions", {"mit_laeufen": True})["sessions"][0]
    assert "laeufe_einzeln" in mit


def test_laeufe_schalter_deckelt_die_menge(client):
    """Mit allen Laeufen wird eine Zeile vielfach laenger — ein zu grosses Limit wuerde das
    Kontextfenster des Agenten fuellen, und genau davor soll der Deckel schuetzen."""
    from app.api import mcp as mcp_modul
    jwt = _konto(client, "mcp-deckel@b.de")
    ich = _user_id(client, jwt)
    for _ in range(mcp_modul.MAX_MIT_LAEUFEN + 3):
        _session_anlegen(ich)
    token = _zugang(client, jwt, _client_anmelden(client))
    # 50 angefragt -> auf MAX_MIT_LAEUFEN gedeckelt, und die Antwort sagt, wie es weitergeht.
    r = _ruf(client, token, "list_sessions", {"mit_laeufen": True, "limit": 50})
    assert len(r["sessions"]) == mcp_modul.MAX_MIT_LAEUFEN
    assert "weiter" in r and "offset=" in r["weiter"]
    # Ohne den Schalter gilt weiter das grosse Limit.
    assert len(_ruf(client, token, "list_sessions", {"limit": 50})["sessions"]) > mcp_modul.MAX_MIT_LAEUFEN


def test_kontingent_kappt_die_verbindung_nicht(client):
    """Ein blankes 429 sah fuer den Client aus wie ein kaputter Server — der Zugang verschwand
    danach ganz aus Jans Sitzung. Jetzt kommt eine gewoehnliche Antwort mit `isError`."""
    from app.api import mcp as mcp_modul
    jwt = _konto(client, "mcp-kontingent@b.de")
    token = _zugang(client, jwt, _client_anmelden(client))
    kopf = {"Authorization": f"Bearer {token}"}
    anfrage = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
               "params": {"name": "get_stats", "arguments": {}}}
    letzte = None
    for _ in range(mcp_modul.LIMITS[1][0] + 2):    # ueber die Minuten-Stufe hinaus
        letzte = client.post("/mcp", headers=kopf, json=anfrage)
    assert letzte.status_code == 200, "429 als HTTP-Status wirft der Client den Server weg"
    ergebnis = letzte.json()["result"]
    assert ergebnis.get("isError") is True
    assert "Verbindung bleibt bestehen" in ergebnis["content"][0]["text"]


def _puls_session(user_id: int) -> int:
    """Eine Aufnahme mit echter GPS-Spur samt Puls auf der Platte und zwei Laeufen: 0–60 s Puls
    100→159, dann 60 s Pause bei 90, dann Lauf 2 mit 3 Minuten STEHENGEBLIEBENEM Wert 170."""
    import json as _json
    from app import models, storage
    from app.db import SessionLocal
    sid = _session_anlegen(user_id, hr_samples=300, hr_source="watch")
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        punkte = []
        for sek in range(300):
            if sek < 60:
                hr = 100 + sek
            elif sek < 120:
                hr = 90
            else:
                hr = 170
            punkte.append([sek * 1000, 47.5 + sek * 1e-5, 9.7, 4.0, hr, 3.0])
        d = storage.session_dir(s.session_uuid) / "gps"
        d.mkdir(parents=True, exist_ok=True)
        (d / "0.json").write_text(_json.dumps(punkte))
        db.add(models.AnalysisResult(
            session_id=sid, algo_version="test",
            metrics_json=_json.dumps({"avg_hr": 130, "max_hr": 159}),
            segments_json=_json.dumps([
                # Vollstaendige Laeufe (mit Indizes und Kennzahlen): andere Tests lesen jede
                # Auswertung der Test-DB, und ein halber Lauf bricht dort mit KeyError.
                {"t_start_session_ms": 0, "t_end_session_ms": 59000, "t_start_ms": 0,
                 "t_end_ms": 59000, "i_start": 0, "i_end": 59, "duration_s": 59.0,
                 "distance_m": 60.0, "max_speed_mps": 4.0, "avg_speed_mps": 4.0},
                {"t_start_session_ms": 120000, "t_end_session_ms": 299000, "t_start_ms": 120000,
                 "t_end_ms": 299000, "i_start": 120, "i_end": 299, "duration_s": 179.0,
                 "distance_m": 180.0, "max_speed_mps": 4.0, "avg_speed_mps": 4.0}])))
        db.commit()
    finally:
        db.close()
    return sid


def test_puls_zusammenfassung_und_reihe_je_lauf(client):
    """Bis 26.09.2026 sah ein Agent nur, DASS es Pulswerte gab, aber keinen davon."""
    jwt = _konto(client, "mcp-puls@b.de")
    sid = _puls_session(_user_id(client, jwt))
    token = _zugang(client, jwt, _client_anmelden(client))

    s = _ruf(client, token, "get_session", {"session_id": sid})
    assert s["puls"]["avg_puls"] == 130 and s["puls"]["max_puls"] == 159
    assert s["puls"]["tiefster_puls"] == 90          # die Pause, kein echter Ruhepuls
    assert "get_run_heart_rate" in s["puls_hinweis"]
    l0, l1 = s["laeufe_einzeln"]
    assert (l0["lauf"], l0["lauf_nr_in_app"]) == (0, 1)
    assert l0["start_puls"] == 100 and l0["max_puls"] == 159
    # Lauf 2 hat nur den stehengebliebenen Wert: der ist KEIN Messwert, also nichts statt 170.
    assert l1["max_puls"] is None and l1["avg_puls"] is None

    r10 = _ruf(client, token, "get_run_heart_rate", {"session_id": sid, "lauf": 0})
    # Mittel 100..109 = 104,5 -> 104 (round halb-gerade, wie avg_hr in der Analyse).
    assert r10["intervall_s"] == 10 and r10["werte"][0] == {"t_s": 0, "puls": 104}
    r1 = _ruf(client, token, "get_run_heart_rate", {"session_id": sid, "lauf": 0, "intervall_s": 1})
    assert [w["puls"] for w in r1["werte"][:3]] == [100, 101, 102]
    assert "fehler" in _ruf(client, token, "get_run_heart_rate", {"session_id": sid, "lauf": 5})

    # Auch mit `mit_laeufen` in der Liste steht der Puls je Lauf.
    zeile = _ruf(client, token, "list_sessions", {"mit_laeufen": True})["sessions"][0]
    assert zeile["laeufe_einzeln"][0]["max_puls"] == 159


def test_pulsreihe_gibt_es_nur_fuer_eigene(client):
    jwt = _konto(client, "mcp-puls-ich@b.de")
    fremd = _puls_session(_user_id(client, _konto(client, "mcp-puls-fremd@b.de")))
    token = _zugang(client, jwt, _client_anmelden(client))
    assert "fehler" in _ruf(client, token, "get_run_heart_rate", {"session_id": fremd, "lauf": 0})


def _accel_ablegen(sid: int, n: int = 250) -> None:
    """Ein Accel-Block mit t0 und ein Gyro-Block, beide n Proben."""
    import struct
    from app import models, storage
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        s = db.get(models.Session, sid)
        s.accel_hz, s.accel_scale = 25, 1000
        db.commit()
        uuid = s.session_uuid
    finally:
        db.close()
    roh = struct.pack(f"<{3 * n}h", *([1000, 0, -500] * n))
    storage.save_accel_raw(uuid, 0, roh, t0_ms=0)
    d = storage.session_dir(uuid) / "gyro"
    d.mkdir(parents=True, exist_ok=True)
    (d / "0.bin").write_bytes(struct.pack(f"<{3 * n}h", *([1024, 512, 0] * n)))
    (d / "0.t0").write_text("0")


def _datei_holen(client, url: str):
    return client.get(url.split("pumpfoil.org", 1)[-1] if "pumpfoil.org" in url
                      else "/" + url.split("/", 3)[3])


def test_rohdaten_als_link_und_erst_beim_abruf_gebaut(client):
    jwt = _konto(client, "mcp-datei@b.de")
    sid = _puls_session(_user_id(client, jwt))
    _accel_ablegen(sid)
    cid = _client_anmelden(client)
    token = _zugang(client, jwt, cid)

    # Die Links kommen mit get_session — auch als resource_link, fuer Clients, die das kennen.
    r = client.post("/mcp", headers={"Authorization": f"Bearer {token}"},
                    json={"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                          "params": {"name": "get_session", "arguments": {"session_id": sid}}})
    ergebnis = r.json()["result"]
    dateien = {d["datei"]: d for d in ergebnis["structuredContent"]["dateien"]}
    assert set(dateien) == {"gps", "accel", "gyro"}
    links = [c for c in ergebnis["content"] if c["type"] == "resource_link"]
    assert {c["uri"] for c in links} == {d["url"] for d in dateien.values()}

    gps = _datei_holen(client, dateien["gps"]["url"])
    assert gps.status_code == 200 and gps.headers["content-type"].startswith("text/csv")
    zeilen = gps.text.strip().split("\n")
    assert zeilen[0] == "t_ms,lat,lon,speed_mps,hr_bpm,h_acc_m" and len(zeilen) == 301
    assert zeilen[1].startswith("0,47.5000000,9.7000000,") and ",100," in zeilen[1]

    acc = _datei_holen(client, dateien["accel"]["url"]).text.strip().split("\n")
    assert acc[0] == "t_ms,ax_g,ay_g,az_g" and len(acc) == 251
    assert acc[1].endswith(",1.00000,0.00000,-0.50000")
    gyr = _datei_holen(client, dateien["gyro"]["url"]).text.strip().split("\n")
    assert gyr[1].endswith(",1.00000,0.50000,0.00000")

    # Ein frischer Link fuer genau eine Art; eine Art, die es nicht gibt, sagt was es gibt.
    neu = _ruf(client, token, "get_download_link", {"session_id": sid, "datei": "accel"})
    assert neu["dateien"][0]["datei"] == "accel"

    # Veraendert, oder der Zugang widerrufen -> tot.
    assert _datei_holen(client, dateien["gps"]["url"] + "x").status_code == 404
    assert client.delete(f"/api/mcp/verbindungen/{cid}",
                         headers={"Authorization": f"Bearer {jwt}"}).status_code == 200
    assert _datei_holen(client, dateien["gps"]["url"]).status_code == 404


def test_rohdaten_nur_eigene_und_ort_verborgen(client):
    from app import models
    from app.db import SessionLocal
    jwt = _konto(client, "mcp-datei-ort@b.de")
    sid = _puls_session(_user_id(client, jwt))
    fremd = _puls_session(_user_id(client, _konto(client, "mcp-datei-fremd@b.de")))
    token = _zugang(client, jwt, _client_anmelden(client))
    assert "fehler" in _ruf(client, token, "get_download_link", {"session_id": fremd, "datei": "gps"})
    assert "fehler" in _ruf(client, token, "get_download_link", {"session_id": sid, "datei": "gyro"})

    db = SessionLocal()
    try:
        db.get(models.Session, sid).ort_sichtbarkeit = "hide"
        db.commit()
    finally:
        db.close()
    link = _ruf(client, token, "get_download_link", {"session_id": sid, "datei": "gps"})["dateien"][0]
    assert "Point Nemo" in link["ort"]
    zeile = _datei_holen(client, link["url"]).text.split("\n")[1].split(",")
    assert abs(float(zeile[1]) - 47.5) > 1 and abs(float(zeile[2]) - 9.7) > 1   # nicht echt
