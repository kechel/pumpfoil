"""Bilder im Chat (Jan, 30.09.2026): vorerst nur Admins; mehrere je Nachricht; Loeschen raeumt auf."""
import io
import os

from PIL import Image


def _konto(client, mail, admin=False):
    client.post("/api/auth/register", json={"email": mail, "password": "geheim123", "name": mail[:5]})
    tok = client.post("/api/auth/login", json={"email": mail, "password": "geheim123"}).json()["access_token"]
    auth = {"Authorization": f"Bearer {tok}"}
    if admin:
        from app import models
        from app.db import SessionLocal
        db = SessionLocal()
        db.query(models.User).filter_by(email=mail).first().is_admin = True
        db.commit(); db.close()
    return auth


def _bild(farbe=(200, 30, 30)):
    b = io.BytesIO()
    Image.new("RGB", (800, 600), farbe).save(b, format="JPEG")
    return b.getvalue()


def _hoch(client, auth, farbe=(200, 30, 30)):
    return client.post("/api/chat/photos", headers=auth,
                       files={"file": ("x.jpg", _bild(farbe), "image/jpeg")})


def test_nur_admins_duerfen_bilder(client):
    normal = _konto(client, "chatfoto-normal@example.com")
    r = _hoch(client, normal)
    assert r.status_code == 403
    r = client.post("/api/chat?scope=global:main", headers=normal, json={"text": "hi", "photo_ids": [1]})
    assert r.status_code == 403


def test_mehrere_bilder_ohne_text_und_loeschen(client):
    from app.config import get_settings
    admin = _konto(client, "chatfoto-admin@example.com", admin=True)
    ids, urls = [], []
    for farbe in ((200, 30, 30), (30, 200, 30), (30, 30, 200)):
        r = _hoch(client, admin, farbe)
        assert r.status_code == 200, r.text
        ids.append(r.json()["id"]); urls.append(r.json()["url"])
        assert r.json()["url"].startswith("/media/chat/") and r.json()["thumb_url"].endswith(".t.webp")
    # Ohne Text und ohne Bild: weiter abgelehnt
    assert client.post("/api/chat?scope=global:main", headers=admin, json={"text": ""}).status_code == 400
    # Nur Bilder, in gewaehlter Reihenfolge
    r = client.post("/api/chat?scope=global:main", headers=admin, json={"text": "", "photo_ids": [ids[2], ids[0], ids[1]]})
    assert r.status_code == 200, r.text
    m = r.json()
    assert [p["id"] for p in m["photos"]] == [ids[2], ids[0], ids[1]]
    # Liste liefert die Bilder mit
    lst = client.get("/api/chat?scope=global:main", headers=admin).json()
    assert [p["id"] for p in next(x for x in lst if x["id"] == m["id"])["photos"]] == [ids[2], ids[0], ids[1]]
    # Ein schon versandtes Bild laesst sich nicht an eine zweite Nachricht haengen
    assert client.post("/api/chat?scope=global:main", headers=admin,
                       json={"text": "nochmal", "photo_ids": [ids[0]]}).status_code == 400
    # Loeschen entfernt Nachricht, Zeilen UND Dateien
    media = get_settings().media_dir
    for u in urls:
        assert (media / u.removeprefix("/media/")).exists()
    assert client.delete(f"/api/chat/{m['id']}", headers=admin).status_code == 200
    for u in urls:
        assert not (media / u.removeprefix("/media/")).exists()


def test_fremdes_bild_nicht_anhaengbar(client):
    a = _konto(client, "chatfoto-a@example.com", admin=True)
    b = _konto(client, "chatfoto-b@example.com", admin=True)
    pid = _hoch(client, a).json()["id"]
    assert client.post("/api/chat?scope=global:main", headers=b, json={"text": "x", "photo_ids": [pid]}).status_code == 400


def test_kontoloeschung_raeumt_chat_bilder_ab(client):
    """Eigene Chat-Bilder: Zeilen vor den Nachrichten weg (sonst Fremdschluessel-Fehler), Dateien danach."""
    from app import models
    from app.config import get_settings
    from app.db import SessionLocal
    from app.loeschung import konto_loeschen
    auth = _konto(client, "chatfoto-weg@example.com", admin=True)
    up = _hoch(client, auth).json()
    r = client.post("/api/chat?scope=global:main", headers=auth, json={"text": "tschuess", "photo_ids": [up["id"]]})
    assert r.status_code == 200
    datei = get_settings().media_dir / up["url"].removeprefix("/media/")
    assert datei.exists()
    db = SessionLocal()
    u = db.query(models.User).filter_by(email="chatfoto-weg@example.com").one()
    konto_loeschen(db, u)
    assert db.query(models.ChatPhoto).filter_by(id=up["id"]).first() is None
    db.close()
    assert not datei.exists()


def test_bearbeiten_bilder_dazu_und_weg(client):
    """Beim Bearbeiten: einzelne Bilder entfernen (Datei weg), neue dazu, Reihenfolge wie geschickt."""
    from app.config import get_settings
    admin = _konto(client, "chatfoto-edit@example.com", admin=True)
    a, b = _hoch(client, admin).json(), _hoch(client, admin, (0, 0, 200)).json()
    m = client.post("/api/chat?scope=global:main", headers=admin, json={"text": "", "photo_ids": [a["id"], b["id"]]}).json()
    c = _hoch(client, admin, (0, 200, 0)).json()
    r = client.patch(f"/api/chat/{m['id']}", headers=admin, json={"text": "jetzt mit Text", "photo_ids": [c["id"], b["id"]]})
    assert r.status_code == 200, r.text
    assert [p["id"] for p in r.json()["photos"]] == [c["id"], b["id"]]
    media = get_settings().media_dir
    assert not (media / a["url"].removeprefix("/media/")).exists()     # entferntes Bild: Datei weg
    assert (media / b["url"].removeprefix("/media/")).exists()
    # Ohne photo_ids (alte Clients) bleiben die Bilder
    r = client.patch(f"/api/chat/{m['id']}", headers=admin, json={"text": "nur Text geaendert"})
    assert [p["id"] for p in r.json()["photos"]] == [c["id"], b["id"]]
    # Alles weg und kein Text: abgelehnt
    assert client.patch(f"/api/chat/{m['id']}", headers=admin, json={"text": "", "photo_ids": []}).status_code == 400
    # Nur Text, Bilder alle entfernt: erlaubt
    r = client.patch(f"/api/chat/{m['id']}", headers=admin, json={"text": "ohne Bilder", "photo_ids": []})
    assert r.status_code == 200 and r.json()["photos"] == []


def test_schalter_gibt_bilder_fuer_alle_frei(client, monkeypatch):
    """CHAT_PHOTOS_ALL (Jan, 01.10.2026): aus = nur Admins, an = alle. /api/me meldet es als
    `chat_photos`, damit die Apps nicht auf is_admin schauen muessen."""
    normal = _konto(client, "chatfoto-schalter@example.com")
    admin = _konto(client, "chatfoto-schalter-admin@example.com", admin=True)
    monkeypatch.delenv("CHAT_PHOTOS_ALL", raising=False)
    assert client.get("/api/auth/me", headers=normal).json()["chat_photos"] is False
    assert client.get("/api/auth/me", headers=admin).json()["chat_photos"] is True
    assert _hoch(client, normal).status_code == 403

    monkeypatch.setenv("CHAT_PHOTOS_ALL", "1")
    assert client.get("/api/auth/me", headers=normal).json()["chat_photos"] is True
    r = _hoch(client, normal)
    assert r.status_code == 200, r.text
    pid = r.json()["id"]
    r = client.post("/api/chat?scope=global:main", headers=normal, json={"text": "", "photo_ids": [pid]})
    assert r.status_code == 200, r.text
    assert len(r.json()["photos"]) == 1
