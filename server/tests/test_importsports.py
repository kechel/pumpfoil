"""Sportart-Auswahl verknuepfter Konten: was der Nutzer abwaehlt, bleibt abgewaehlt — und was
NEU dazukommt, wird nie abgewiesen.

Die zweite Haelfte ist der eigentliche Grund fuer diese Tests (Jan, 07.09.2026): „wenn ich mein
verknuepftes konto auf z.b. 2 von 5 Sportarten eingeschraenkt habe, und beim naechsten push eine
6te dazukommt, dass er die nicht abweist weil die nicht unter den 2 ausgewaehlten ist". Eine
Erlaubt-Liste, die im Zweifel NEIN sagt, wuerde genau die Leute aussieben, die einen
ungewoehnlichen Modus benutzen — nachgezaehlt kamen 8 Suunto-Sessions als „cycling" herein und
waren echtes Pumpfoilen. Deshalb: unbekannt heisst importieren.
"""
from __future__ import annotations

import pytest

ANBIETER = "probe"


@pytest.fixture()
def nutzer(client):  # noqa: ARG001 — client legt die Tabellen an
    """Ein echter Nutzer, weil `import_sport_prefs.user_id` auf `users.id` verweist.

    Zwei Dinge, die beim ersten Anlauf schiefgingen (07.09.2026, gegen Postgres in der CI —
    auf der SQLite-Rueckfallebene faellt beides NICHT auf, weil dort Fremdschluessel
    standardmaessig nicht erzwungen werden):
      * Die Mailadresse war fest. Blieb der Nutzer beim Aufraeumen liegen, kollidierte jeder
        weitere Lauf an `ix_users_email`. Jetzt ist sie je Test eindeutig.
      * Das Aufraeumen wollte den Nutzer loeschen, solange Sessions an ihm hingen (der letzte
        Test importiert welche) — der Fremdschluessel verhindert das. Jetzt werden die
        Abhaengigen zuerst weggeraeumt, in der richtigen Reihenfolge.
    """
    import uuid as _uuid

    from app import models
    from app.db import SessionLocal
    from app.security import hash_password

    db = SessionLocal()
    try:
        # BEIDE eindeutig: `email` UND `display_name` haben einen Unique-Index. Mit festem
        # Anzeigenamen scheitert schon der zweite Test.
        kennung = _uuid.uuid4().hex[:8]
        u = models.User(email=f"sportauswahl-{kennung}@test.local",
                        password_hash=hash_password("x"),
                        display_name=f"Sportauswahl {kennung}")
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id
    finally:
        db.close()
    yield uid
    # NUR die eigenen Zeilen wegraeumen, den Nutzer NICHT. Ihn zu loeschen scheitert an den
    # Fremdschluesseln alles, was ein Import nach sich zieht (Sessions, Analysen, Chat-Zustand) —
    # und jeden davon zu verfolgen waere ein Testgeruest, das mehr kaputtgeht als es prueft. Die
    # Mailadresse ist eindeutig, also kollidiert auch nichts; die Test-DB ist eine Wegwerf-DB
    # (s. conftest).
    db = SessionLocal()
    try:
        db.query(models.ImportSportPref).filter_by(user_id=uid).delete()
        db.commit()
    finally:
        db.close()


def _db():
    from app.db import SessionLocal

    return SessionLocal()


def test_neu_gesehene_sportart_ist_ausgewaehlt(nutzer):
    from app import importsports

    db = _db()
    try:
        p = importsports.merken(db, nutzer, ANBIETER, "704", label="Flatwater")
        assert p.importieren is True
        assert importsports.erlaubt(db, nutzer, ANBIETER, "704") is True
    finally:
        db.close()


def test_unbekannte_sportart_wird_nicht_abgewiesen(nutzer):
    """Der Kern: bevor ein Modus ueberhaupt bekannt ist, muss er durchgelassen werden."""
    from app import importsports

    db = _db()
    try:
        assert importsports.erlaubt(db, nutzer, ANBIETER, "9999") is True
        assert importsports.erlaubt(db, nutzer, ANBIETER, None) is True
    finally:
        db.close()


def test_sechste_sportart_kommt_trotz_einschraenkung_dazu(nutzer):
    from app import importsports

    db = _db()
    try:
        for k in ("A", "B", "C", "D", "E"):
            importsports.merken(db, nutzer, ANBIETER, k, label=k)
        importsports.setzen(db, nutzer, ANBIETER,
                            {"A": True, "B": True, "C": False, "D": False, "E": False})
        assert importsports.erlaubt(db, nutzer, ANBIETER, "C") is False

        # Die sechste taucht auf: schon VOR dem Merken erlaubt, danach ausgewaehlt in der Liste.
        assert importsports.erlaubt(db, nutzer, ANBIETER, "F") is True
        importsports.merken(db, nutzer, ANBIETER, "F", label="F")
        assert importsports.erlaubt(db, nutzer, ANBIETER, "F") is True
        gewaehlt = {z["sport_key"] for z in importsports.liste(db, nutzer, ANBIETER)
                    if z["importieren"]}
        assert gewaehlt == {"A", "B", "F"}
    finally:
        db.close()


def test_abwahl_ueberlebt_erneutes_auftauchen(nutzer):
    """`merken` darf die Entscheidung des Nutzers NIE ueberschreiben."""
    from app import importsports

    db = _db()
    try:
        importsports.merken(db, nutzer, ANBIETER, "104", label="Hike")
        importsports.setzen(db, nutzer, ANBIETER, {"104": False})
        importsports.merken(db, nutzer, ANBIETER, "104", label="Hike")
        assert importsports.erlaubt(db, nutzer, ANBIETER, "104") is False
    finally:
        db.close()


def test_ohne_ortung_nicht_in_der_liste(nutzer):
    """Nur Modi mit GPS gehoeren in die Oberflaeche — ein Hallenmodus waere dort sinnlos."""
    from app import importsports

    db = _db()
    try:
        importsports.merken(db, nutzer, ANBIETER, "400", label="Gym", hat_gps=False)
        importsports.merken(db, nutzer, ANBIETER, "704", label="Flatwater", hat_gps=True)
        sichtbar = {z["sport_key"] for z in importsports.liste(db, nutzer, ANBIETER)}
        assert sichtbar == {"704"}
        # Unsichtbar heisst NICHT verboten: gefiltert wird nur, was der Nutzer abwaehlt.
        assert importsports.erlaubt(db, nutzer, ANBIETER, "400") is True
    finally:
        db.close()


def test_einmal_mit_ortung_bleibt_mit_ortung(nutzer):
    """Ein Ausrutscher (eine Aufnahme ohne Fix) darf einen Modus nicht dauerhaft verstecken."""
    from app import importsports

    db = _db()
    try:
        importsports.merken(db, nutzer, ANBIETER, "704", label="Flatwater", hat_gps=True)
        importsports.merken(db, nutzer, ANBIETER, "704", hat_gps=False)
        sichtbar = {z["sport_key"] for z in importsports.liste(db, nutzer, ANBIETER)}
        assert "704" in sichtbar
    finally:
        db.close()


def test_nachtrag_zaehlt_nicht_doppelt(nutzer):
    """Polar und Suunto rufen je Training zweimal auf (vor und nach dem Download)."""
    from app import importsports

    db = _db()
    try:
        importsports.merken(db, nutzer, ANBIETER, "X", label="X")
        importsports.merken(db, nutzer, ANBIETER, "X", hat_gps=True, zaehlen=False)
        z = next(z for z in importsports.liste(db, nutzer, ANBIETER) if z["sport_key"] == "X")
        assert z["gesehen"] == 1
    finally:
        db.close()


def test_import_ordnet_die_sportart_aus_der_datei_ein(nutzer):
    """Die Sportart AUS DER DATEI schlaegt die Voreinstellung — und Wassersport fragt nach.

    Diese Zuordnung ist am 07.09.2026 bei einem Umbau versehentlich verlorengegangen (die
    Zeilen, die `_datei_sport` berechnen und `KEIN_FOILEN` anwenden, fielen einer
    Textoperation zum Opfer). Aufgefallen ist es nur, weil eine Nachholaktion mit
    „NameError" abbrach — kein Test hat es gemerkt. Deshalb dieser.
    """
    from app import models
    from app.api.sessions import import_parsed_session
    from app.db import SessionLocal

    def einlesen(sport: str, uuid_prefix: str, stunde: int):
        db = SessionLocal()
        try:
            u = db.get(models.User, nutzer)
            parsed = {
                "gps_samples": [[0, 47.5, 9.5, 1.0, 100, None], [1000, 47.5001, 9.5, 1.0, 101, None]],
                "accel_bytes": b"", "accel_hz": 0, "started_at": None, "sport": sport,
                "fit_type": "activity", "record_count": 2, "foil_status": [], "abbruch": None,
            }
            from datetime import datetime, timezone
            # Je Fall eine EIGENE Startzeit: `import_parsed_session` erkennt Doppel ueber
            # Inhalts-Hash ODER Startzeit, mit derselben Zeit bekaeme man die erste Session
            # zurueck statt einer neuen (genau so beim Schreiben dieses Tests passiert).
            parsed["started_at"] = datetime(2026, 9, 7, stunde, 0, tzinfo=timezone.utc)
            s = import_parsed_session(db, u, sport.encode() + uuid_prefix.encode(), parsed,
                                      src_label="test-import", uuid_prefix=uuid_prefix)
            return None if s is None else (s.sport_class, bool(s.needs_classification))
        finally:
            db.close()

    # Landsport: die Datei gewinnt, die Session wird aussortiert.
    assert einlesen("running", "t1-", 9) == ("other", False)
    # Mehrdeutiger Wassersport: bleibt Pumpfoil, aber es wird nachgefragt.
    assert einlesen("stand_up_paddleboarding", "t2-", 11) == ("pumpfoil", True)
    # Was unsere eigene App schreibt: eindeutig, keine Rueckfrage.
    assert einlesen("surfing", "t3-", 13) == ("pumpfoil", False)
