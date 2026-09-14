"""Eine Zwischenanalyse darf einen erreichten Abschluss NICHT zurueckdrehen.

Der Fehler, den das hier festhaelt, kam ZWEIMAL — und der zweite Anlauf ist der Grund, warum
dieser Test jetzt gegen die Datenbank laeuft statt gegen eine reine Funktion.

**13.09.2026, erster Befund:** `run_analysis` schrieb am Ende `session.status = "analyzed" if
final else "live"` — bedingungslos. Die Zwischenanalyse laeuft aber minutenlang, waehrend die
Chunks noch hochladen. Kam `/complete` in dieser Zeit an, setzte es korrekt „complete", und die
noch laufende Zwischenanalyse schrieb danach wieder „live". Betroffen: 12 Aufnahmen von 9 echten
Nutzern. Der Fix war ein Waechter `neuer_status(session.status, final)`.

**14.09.2026, derselbe Fehler nochmal:** Peters Session #8448 (`/complete` 18:34:00,
ueberschreibende Analyse 18:36:19, +139 s) hing trotz des Waechters. `SessionLocal` laeuft mit
`expire_on_commit=False`, und zwischen `db.get()` in `_analyze_in_background` und dem Waechter
steht in `run_analysis` kein commit/refresh — `session.status` war also das Speicherabbild von
vor Minuten. Der Waechter verglich gegen „live" und schrieb „live". Er half nur, wenn die
Zwischenanalyse NACH dem Abschluss STARTET; der echte Fall ist, dass sie schon laeuft.

**Warum dieser Test so aussieht:** die alte Fassung pruefte `neuer_status()` direkt und war
danach gruen, waehrend echte Nutzer-Uploads weiter haengen blieben — eine Entscheidung zu
pruefen, die das Produkt so gar nicht trifft. Jetzt wird der ECHTE Weg gefahren: ein ORM-Objekt
mit veraltetem Status, ein `/complete` von aussen dazwischen, und die Frage ist, was HINTERHER
in der Datenbank steht.
"""
from __future__ import annotations


import pytest

from test_api import _accel_chunk_b64, _gps_chunk


def _session_mit_daten(client, kennung: str) -> int:
    """Registrieren, paaren, Session anlegen, je einen GPS- und Accel-Chunk hochladen."""
    r = client.post("/api/auth/register",
                    json={"email": f"{kennung}@test.de", "password": "supersecret"})
    assert r.status_code == 200, r.text
    auth = {"Authorization": f"Bearer {r.json()['access_token']}"}
    code = client.post("/api/devices/pairing-code", headers=auth).json()["code"]
    token = client.post("/api/devices/pair", json={"code": code, "label": "Wear OS"}).json()
    dev = {"X-Device-Token": token["device_token"]}

    uuid = f"uuid-{kennung}"
    r = client.post("/api/ingest/session", headers=dev,
                    json={"session_uuid": uuid, "started_at": "2026-09-14T13:00:00Z"})
    assert r.status_code == 200, r.text
    for kind, daten, enc in (("gps", _gps_chunk(), "json"),
                             ("accel", _accel_chunk_b64(), "int16-b64")):
        r = client.post(f"/api/ingest/session/{uuid}/chunk", headers=dev,
                        json={"index": 0, "kind": kind, "encoding": enc, "data": daten})
        assert r.status_code == 200, r.text

    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Session).filter_by(session_uuid=uuid).one().id
    finally:
        db.close()


def _status(sid: int) -> str:
    """Status FRISCH aus der Datenbank — nie aus einem Objekt, das ein Test schon haelt."""
    from app import models
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        return db.query(models.Session.status).filter_by(id=sid).scalar()
    finally:
        db.close()


def test_complete_waehrend_der_zwischenanalyse_bleibt_stehen(client):
    """DER Fall, an dem beide Fixes haengen: die Analyse laeuft schon, `/complete` kommt dazwischen.

    Nachgestellt wird genau die Bedingung aus der Produktion — ein ORM-Objekt, dessen `status`
    noch „live" sagt, waehrend in der Datenbank laengst „complete" steht.
    """
    from app import models
    from app.analysis import run_analysis
    from app.db import SessionLocal

    sid = _session_mit_daten(client, "zwischen")

    # 1. Die Hintergrund-Analyse laedt die Session — wie `_analyze_in_background` es tut.
    db_analyse = SessionLocal()
    s = db_analyse.get(models.Session, sid)
    assert s.status in ("recording", "live"), s.status

    # 2. Waehrend sie rechnet, trifft `/complete` ein: eine ANDERE Verbindung schreibt.
    db_uhr = SessionLocal()
    try:
        db_uhr.query(models.Session).filter_by(id=sid).update(
            {"status": "complete", "total_chunks": 1})
        db_uhr.commit()
    finally:
        db_uhr.close()
    assert _status(sid) == "complete"
    # Das Speicherabbild der Analyse ist jetzt VERALTET — genau der Zustand von #8448.
    assert s.status in ("recording", "live"), "Vorbedingung: das Objekt kennt den Abschluss nicht"

    # 3. Die Zwischenanalyse committet — und darf den Abschluss nicht zurueckdrehen.
    try:
        run_analysis(db_analyse, s, final=False)
    finally:
        db_analyse.close()

    assert _status(sid) == "complete", "Zwischenanalyse hat den Abschluss ueberschrieben"


def test_zwischenanalyse_setzt_live_solange_es_laeuft(client):
    """Der Normalfall bleibt unveraendert: ohne Abschluss schreibt die Zwischenanalyse „live"."""
    from app import models
    from app.analysis import run_analysis
    from app.db import SessionLocal

    sid = _session_mit_daten(client, "laufend")
    db = SessionLocal()
    try:
        run_analysis(db, db.get(models.Session, sid), final=False)
    finally:
        db.close()
    assert _status(sid) == "live"


@pytest.mark.parametrize("vorher", ["recording", "live", "complete", "analyzed"])
def test_finale_analyse_gewinnt_immer(client, vorher):
    """Die finale Analyse setzt `analyzed`, aus jedem Zustand heraus."""
    from app import models
    from app.analysis import run_analysis
    from app.db import SessionLocal

    sid = _session_mit_daten(client, f"final-{vorher}")
    db = SessionLocal()
    try:
        db.query(models.Session).filter_by(id=sid).update({"status": vorher})
        db.commit()
        run_analysis(db, db.get(models.Session, sid), final=True)
    finally:
        db.close()
    assert _status(sid) == "analyzed"
