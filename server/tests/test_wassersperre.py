"""Wassersperre je Uhr: Voreinstellung, Uebersteuerung, Abweisung von Unsinn.

Beim Pumpen schlaegt Wasser aufs Display und loest Aktionen aus (gemeldet 27.07. und 04.09.).
Ob eine Uhr dagegen sperrt, steht je GERAET in `device_tokens.water_lock` — anders als
`stop_mode` ist das eine Eigenschaft der Uhr und keine Gewohnheit des Menschen: auf einer Uhr
mit zwei Tasten wuerde man sich aussperren, eine Apple Watch sperrt systemweit, Garmin braucht
es gar nicht.
"""
from __future__ import annotations


def _paar(client, kennung: str):
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    paar = client.post("/api/devices/pair", json={"code": code, "label": "Wear OS"}).json()
    return auth, {"X-Device-Token": paar["device_token"]}


def _config(client, dev):
    r = client.get("/api/devices/config?p=wear&v=1.2.30", headers=dev)
    assert r.status_code == 200, r.text
    return r.json()


def test_voreinstellung_ist_auto(client):
    """Ohne Zutun entscheidet die UHR — sie kennt ihre Tasten, wir nicht."""
    _auth, dev = _paar(client, "wl-default")
    assert _config(client, dev)["waterLock"] == "auto"


def test_je_geraet_uebersteuerbar(client):
    auth, dev = _paar(client, "wl-geraet")
    geraete = client.get("/api/devices/list", headers=auth).json()
    gid = geraete[0]["id"]
    for modus in ("off", "on", "auto"):
        r = client.put(f"/api/devices/{gid}/water-lock", headers=auth, json={"water_lock": modus})
        assert r.status_code == 200, r.text
        assert _config(client, dev)["waterLock"] == modus


def test_unsinn_wird_abgewiesen(client):
    """Ein ungueltiger Wert darf die Einstellung NICHT stillschweigend kippen."""
    auth, dev = _paar(client, "wl-unsinn")
    geraete = client.get("/api/devices/list", headers=auth).json()
    gid = geraete[0]["id"]
    client.put(f"/api/devices/{gid}/water-lock", headers=auth, json={"water_lock": "on"})
    r = client.put(f"/api/devices/{gid}/water-lock", headers=auth, json={"water_lock": "quatsch"})
    assert r.status_code == 400, r.text
    assert _config(client, dev)["waterLock"] == "on"


def test_nutzer_voreinstellung_greift_ohne_geraete_wert(client):
    """Ohne Geraete-Wert zaehlt das Profil — dieselbe Rangfolge wie bei recordMode/gnssMode."""
    auth, dev = _paar(client, "wl-profil")
    r = client.put("/api/settings", headers=auth, json={"water_lock": "off"})
    assert r.status_code == 200, r.text
    assert _config(client, dev)["waterLock"] == "off"


def test_absturzmeldung_wird_gezaehlt_und_entprellt(client):
    """Die Uhr meldet einen nicht sauber beendeten Lauf — der Server zaehlt das EREIGNIS.

    Gebaut fuer Amazfit am 22.09.2026, nachdem César (Amazfit Active 2) per Mail berichtete, seine
    Uhr habe sich waehrend eines Uploads dreimal neu gestartet, waehrend bei uns `crash_count = 0`
    stand: die Zepp-App hatte bis dahin gar keinen Waechter. Der Weg ist derselbe wie bei Garmin,
    deshalb wird er hier auch einmal als Weg geprueft und nicht nur als Funktion.

    ENTPRELLT: ein App-Start schickt ZWEI Config-Abrufe, die beide dasselbe Flag tragen. Gezaehlt
    werden soll der Absturz, nicht der Abruf.
    """
    from app import models
    from app.db import SessionLocal

    auth, dev = _paar(client, "canary-zepp")
    gid = client.get("/api/devices/list", headers=auth).json()[0]["id"]

    def stand():
        db = SessionLocal()
        try:
            d = db.get(models.DeviceToken, gid)
            return int(d.crash_count or 0), d.crash_phase
        finally:
            db.close()

    assert stand() == (0, None)
    # Phase 4 = Upload (dieselbe Nummer wie bei Garmin, s. SessionRecorder.mc).
    assert client.get("/api/devices/config?p=zepp&v=1.0.12&crash=4", headers=dev).status_code == 200
    assert stand() == (1, 4)
    # Zweiter Abruf desselben App-Starts: derselbe Absturz, kein zweiter Zaehler.
    client.get("/api/devices/config?p=zepp&v=1.0.12&crash=4", headers=dev)
    assert stand()[0] == 1, "der zweite Config-Abruf desselben Starts wurde mitgezaehlt"
    # Ohne Meldung bleibt alles, wie es ist.
    client.get("/api/devices/config?p=zepp&v=1.0.12", headers=dev)
    assert stand() == (1, 4)


def test_speichermessung_behaelt_den_hoechststand(client):
    """Der Spitzenwert waechst nur — wir wollen wissen, wie nah die App je am Limit stand.

    Gebaut am 22.09.2026 fuer Amazfit (`getPerformance`, Zepp OS API_LEVEL 4.0). Anlass: Césars
    Uhr startete waehrend eines Uploads dreimal neu, und wir hatten keine einzige Zahl dazu — ob
    sie am Speicherlimit stand oder aus einem anderen Grund starb, war nicht zu sagen.
    """
    from app import models
    from app.db import SessionLocal

    auth, dev = _paar(client, "mem-zepp")
    gid = client.get("/api/devices/list", headers=auth).json()[0]["id"]

    def stand():
        db = SessionLocal()
        try:
            d = db.get(models.DeviceToken, gid)
            return int(d.mem_peak_kb or 0), int(d.mem_total_kb or 0)
        finally:
            db.close()

    assert stand() == (0, 0), "ohne Meldung bleibt es bei null"
    client.get("/api/devices/config?p=zepp&v=1.0.12&mem=420&memtot=2048", headers=dev)
    assert stand() == (420, 2048)
    # Ein niedrigerer Wert darf den Hoechststand NICHT senken.
    client.get("/api/devices/config?p=zepp&v=1.0.12&mem=100&memtot=2048", headers=dev)
    assert stand() == (420, 2048), "der Hoechststand wurde ueberschrieben"
    # Ein hoeherer schon.
    client.get("/api/devices/config?p=zepp&v=1.0.12&mem=900&memtot=2048", headers=dev)
    assert stand() == (900, 2048)
    # Eine Uhr ohne die API meldet nichts — und loescht damit auch nichts.
    client.get("/api/devices/config?p=zepp&v=1.0.12", headers=dev)
    assert stand() == (900, 2048)
    # Die Geraeteliste zeigt beides, sonst sieht es nie jemand.
    eintrag = [x for x in client.get("/api/devices/list", headers=auth).json() if x["id"] == gid][0]
    assert eintrag["mem_peak_kb"] == 900 and eintrag["mem_total_kb"] == 2048
