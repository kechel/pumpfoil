"""„Rate this analysis" (22.10.2026): nur Besitzer, Antworten geprueft, Schnappschuss, Admin-Liste, Loeschung."""


def _konto(client, mail):
    tok = client.post("/api/auth/register", json={"email": mail, "password": "supersecret"}).json()["access_token"]
    auth = {"Authorization": "Bearer " + tok}
    uhr = {"X-Device-Token": client.post("/api/devices/mint?label=Uhr", headers=auth).json()["device_token"]}
    return auth, uhr


def _session(client, uhr, uuid):
    assert client.post("/api/ingest/session", headers=uhr, json={
        "session_uuid": uuid, "started_at": "2026-10-21T19:00:00Z", "sport": "pumpfoil",
        "gps_hz": 1, "accel_hz": 25, "accel_scale": 1000}).status_code == 200
    gps = [[i * 1000, 47.0 + i * 1e-5, 9.0, 4.0, 120, 5.0] for i in range(60)]
    assert client.post(f"/api/ingest/session/{uuid}/chunk", headers=uhr, json={
        "index": 0, "kind": "gps", "encoding": "json", "data": gps}).status_code == 200
    r = client.post(f"/api/ingest/session/{uuid}/complete", headers=uhr, json={"total_chunks": 1})
    assert r.status_code == 200, r.text
    return r.json()["session_id"]


def test_bewertung_besitzer_admin_und_loeschen(client):
    from app.db import SessionLocal
    from app import models
    auth, uhr = _konto(client, "bewertung@b.de")
    sid = _session(client, uhr, "bewertung-1")
    assert client.get(f"/api/sessions/{sid}/bewertung", headers=auth).json()["bewertung"] is None
    # leer -> 400
    assert client.put(f"/api/sessions/{sid}/bewertung", headers=auth, json={"antworten": {}}).status_code == 400
    r = client.put(f"/api/sessions/{sid}/bewertung", headers=auth, json={
        "antworten": {"sterne": 4, "laeufe": "fehlen", "laeufe_echt": 9, "pumps": "wenig", "tempo_ok": True,
                      "probleme": True, "probleme_art": ["gps", "quatsch", "pause", "gps"], "sterne_x": 9},
        "kommentar": "  zwei Laeufe fehlen  "})
    assert r.status_code == 200, r.text
    b = r.json()["bewertung"]
    assert b["antworten"] == {"sterne": 4, "laeufe": "fehlen", "laeufe_echt": 9, "pumps": "wenig",
                              "tempo_ok": True, "probleme": True, "probleme_art": ["pause", "gps"]}
    assert b["kommentar"] == "zwei Laeufe fehlen"
    assert "laeufe" in b["schnappschuss"] and "algo" in b["schnappschuss"]
    # Ungueltiges faellt weg, nicht 400
    r = client.put(f"/api/sessions/{sid}/bewertung", headers=auth, json={
        "antworten": {"sterne": 7, "laeufe": "alle", "laeufe_echt": True}})
    assert r.json()["bewertung"]["antworten"] == {"laeufe": "alle"}
    # fremde Nutzer sehen und setzen nichts
    fremd, _ = _konto(client, "bewertung-fremd@b.de")
    assert client.get(f"/api/sessions/{sid}/bewertung", headers=fremd).status_code == 404
    assert client.put(f"/api/sessions/{sid}/bewertung", headers=fremd, json={"kommentar": "x"}).status_code == 404
    # Admin-Liste nur fuer Admins
    assert client.get("/api/admin/bewertungen", headers=auth).status_code == 403
    db = SessionLocal()
    try:
        u = db.query(models.User).filter_by(email="bewertung@b.de").one()
        u.is_admin = True; db.commit()
    finally:
        db.close()
    liste = client.get("/api/admin/bewertungen", headers=auth).json()["bewertungen"]
    eintrag = next(x for x in liste if x["session_id"] == sid)
    assert eintrag["antworten"] == {"laeufe": "alle"} and eintrag["status"] == "offen"
    bid = eintrag["id"]
    # erledigt -> ausgeblendet, mit Schalter wieder da
    assert client.put(f"/api/admin/bewertungen/{bid}", headers=auth, json={"status": "erledigt", "notiz": "gefixt"}).status_code == 200
    d = client.get("/api/admin/bewertungen", headers=auth).json()
    assert all(x["id"] != bid for x in d["bewertungen"]) and d["anzahl_erledigt"] >= 1
    d = client.get("/api/admin/bewertungen?erledigte=true", headers=auth).json()
    assert next(x for x in d["bewertungen"] if x["id"] == bid)["status_notiz"] == "gefixt"
    assert client.put(f"/api/admin/bewertungen/{bid}", headers=auth, json={"status": "quatsch"}).status_code == 400
    # Rueckfrage an den Fahrer; seine Neubewertung macht sie wieder offen
    assert client.put(f"/api/admin/bewertungen/{bid}", headers=auth, json={"status": "rueckfrage"}).status_code == 400
    assert client.put(f"/api/admin/bewertungen/{bid}", headers=auth,
                      json={"status": "rueckfrage", "antwort": "Bitte nochmal pruefen"}).status_code == 200
    rf = client.get(f"/api/sessions/{sid}/bewertung", headers=auth).json()["bewertung"]["rueckfrage"]
    assert rf["text"] == "Bitte nochmal pruefen"
    client.put(f"/api/sessions/{sid}/bewertung", headers=auth, json={"antworten": {"sterne": 5}})
    assert next(x for x in client.get("/api/admin/bewertungen", headers=auth).json()["bewertungen"]
                if x["id"] == bid)["status"] == "offen"
    # Admin loescht eine Testbewertung
    assert client.delete(f"/api/admin/bewertungen/{bid}", headers=auth).status_code == 200
    assert client.delete(f"/api/admin/bewertungen/{bid}", headers=auth).status_code == 404
    client.put(f"/api/sessions/{sid}/bewertung", headers=auth, json={"kommentar": "nochmal"})
    # Konto loeschen: Bewertung faellt mit, kein Fremdschluessel-Fehler
    assert client.request("DELETE", "/api/auth/me", headers=auth).status_code in (200, 204)
    db = SessionLocal()
    try:
        assert db.query(models.SessionBewertung).filter_by(session_id=sid).count() == 0
    finally:
        db.close()


def test_rueckfrage_schickt_dm_an_den_fahrer(client):
    """„Back to rider": die Nachricht geht als 1:1 vom Admin an den Fahrer, mit Link zur Session."""
    from app.db import SessionLocal
    from app import models
    fahrer, uhr = _konto(client, "bew-fahrer@b.de")
    admin, _ = _konto(client, "bew-admin@b.de")
    sid = _session(client, uhr, "bewertung-dm")
    client.put(f"/api/sessions/{sid}/bewertung", headers=fahrer, json={"antworten": {"laeufe": "fehlen"}})
    db = SessionLocal()
    try:
        a = db.query(models.User).filter_by(email="bew-admin@b.de").one()
        f = db.query(models.User).filter_by(email="bew-fahrer@b.de").one()
        a.is_admin = True
        db.commit()
        aid, fid = a.id, f.id
    finally:
        db.close()
    bid = next(x["id"] for x in client.get("/api/admin/bewertungen", headers=admin).json()["bewertungen"]
               if x["session_id"] == sid)
    r = client.put(f"/api/admin/bewertungen/{bid}", headers=admin,
                   json={"status": "rueckfrage", "antwort": "Wir haben die Lauferkennung verbessert."})
    assert r.status_code == 200, r.text
    lo, hi = sorted([aid, fid])
    db = SessionLocal()
    try:
        m = db.query(models.ChatMessage).filter_by(scope=f"dm:{lo}-{hi}").one()
        assert m.user_id == aid and "Lauferkennung" in m.text and f"/sessions/{sid}" in m.text
    finally:
        db.close()
    b = client.get(f"/api/sessions/{sid}/bewertung", headers=fahrer).json()["bewertung"]
    assert b["rueckfrage"]["text"] == "Wir haben die Lauferkennung verbessert."
    liste = client.get("/api/sessions?filter=other", headers=fahrer).json() + client.get("/api/sessions", headers=fahrer).json()
    assert next(x for x in liste if x["id"] == sid)["neu_bewerten"] is True
    # Neubewertung: Rueckfrage verschwindet aus der Kachel, Status wieder offen
    b = client.put(f"/api/sessions/{sid}/bewertung", headers=fahrer, json={"antworten": {"laeufe": "alle"}}).json()["bewertung"]
    assert b["rueckfrage"] is None
