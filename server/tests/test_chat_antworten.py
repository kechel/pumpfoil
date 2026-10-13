"""Antworten mit Zitat im Chat (Jan, 13.10.2026). Rein additiv: `reply_to` im POST ist optional,
jede Nachricht traegt `reply_to` (null oder Zitat) — aeltere Apps ignorieren das Feld."""


def _konto(client, mail, admin=False):
    """Konto anlegen + einloggen. Eigene Kopie statt Import aus einem anderen Testmodul: in CI ist
    `tests` kein importierbares Paket (13.10.2026: ModuleNotFoundError, Server-Job rot)."""
    client.post("/api/auth/register", json={"email": mail, "password": "geheim123", "name": mail[:6]})
    tok = client.post("/api/auth/login", json={"email": mail, "password": "geheim123"}).json()["access_token"]
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    u = db.query(models.User).filter_by(email=mail).first()
    if admin:
        u.is_admin = True
    uid = u.id
    db.commit(); db.close()
    return {"Authorization": f"Bearer {tok}"}, uid

RAUM = "global:main"


def _post(client, h, text, reply_to=None, scope=RAUM):
    body = {"text": text}
    if reply_to is not None:
        body["reply_to"] = reply_to
    return client.post(f"/api/chat?scope={scope}", headers=h, json=body)


def test_antwort_traegt_zitat(client):
    a, a_id = _konto(client, "zitat-a@example.com", admin=True)
    b, _ = _konto(client, "zitat-b@example.com", admin=True)
    o = _post(client, a, "Wie schnell faehrst du im Schnitt? " + "x" * 200).json()
    r = _post(client, b, "So um die 14 km/h", reply_to=o["id"])
    assert r.status_code == 200, r.text
    z = r.json()["reply_to"]
    assert z["id"] == o["id"] and z["user_id"] == a_id and not z["missing"]
    assert len(z["text"]) <= 141 and z["text"].endswith("…")
    liste = {m["id"]: m for m in client.get(f"/api/chat?scope={RAUM}", headers=a).json()}
    assert liste[r.json()["id"]]["reply_to"]["id"] == o["id"]
    assert liste[o["id"]]["reply_to"] is None          # normale Nachricht: Feld da, aber leer


def test_ohne_reply_to_wie_bisher(client):
    """Alte Apps schicken kein reply_to: unveraendert."""
    a, _ = _konto(client, "zitat-alt@example.com", admin=True)
    r = client.post(f"/api/chat?scope={RAUM}", headers=a, json={"text": "ganz normal"})
    assert r.status_code == 200 and r.json()["reply_to"] is None


def test_nur_im_selben_raum(client):
    a, a_id = _konto(client, "zitat-raum-a@example.com", admin=True)
    b, b_id = _konto(client, "zitat-raum-b@example.com", admin=True)
    dm = "dm:%d-%d" % tuple(sorted([a_id, b_id]))
    geheim = _post(client, a, "nur fuer b", scope=dm).json()
    r = _post(client, b, "zitiere aus dem 1:1", reply_to=geheim["id"])
    assert r.status_code == 400
    assert _post(client, b, "gibt es nicht", reply_to=99999999).status_code == 400


def test_geloeschtes_original_fehlt(client):
    a, _ = _konto(client, "zitat-del-a@example.com", admin=True)
    b, _ = _konto(client, "zitat-del-b@example.com", admin=True)
    o = _post(client, a, "gleich weg").json()
    r = _post(client, b, "Antwort darauf", reply_to=o["id"]).json()
    assert client.delete(f"/api/chat/{o['id']}", headers=a).status_code == 200
    liste = {m["id"]: m for m in client.get(f"/api/chat?scope={RAUM}", headers=b).json()}
    assert liste[r["id"]]["reply_to"] == {"id": o["id"], "missing": True}


def test_verborgenes_original_fuer_nutzer_unsichtbar(client):
    adm, _ = _konto(client, "zitat-adm@example.com", admin=True)
    b, _ = _konto(client, "zitat-hid-b@example.com", admin=True)
    nutzer, _ = _konto(client, "zitat-leser@example.com")
    o = _post(client, b, "wird verborgen").json()
    r = _post(client, adm, "Antwort", reply_to=o["id"]).json()
    assert client.post(f"/api/chat/{o['id']}/hide", headers=adm, json={"hidden": True}).status_code == 200
    beim_nutzer = {m["id"]: m for m in client.get(f"/api/chat?scope={RAUM}", headers=nutzer).json()}
    assert beim_nutzer[r["id"]]["reply_to"]["missing"] is True
    assert "text" not in beim_nutzer[r["id"]]["reply_to"]
    beim_admin = {m["id"]: m for m in client.get(f"/api/chat?scope={RAUM}", headers=adm).json()}
    assert beim_admin[r["id"]]["reply_to"]["missing"] is False


def test_nachladen_bis_zum_original(client):
    a, _ = _konto(client, "zitat-lade@example.com", admin=True)
    ids = [_post(client, a, f"Nachricht {i}").json()["id"] for i in range(40)]
    # Client hat nur die letzten 10 geladen und springt auf ids[3]:
    rows = client.get(f"/api/chat?scope={RAUM}&before={ids[30]}&from_id={ids[3]}", headers=a).json()
    got = [m["id"] for m in rows]
    assert got[0] == ids[3] and got[-1] == ids[29] and got == sorted(got)
