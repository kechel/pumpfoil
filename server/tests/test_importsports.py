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
    """Ein echter Nutzer, weil `import_sport_prefs.user_id` auf `users.id` verweist."""
    from app import models
    from app.db import SessionLocal
    from app.security import hash_password

    db = SessionLocal()
    try:
        u = models.User(email="sportauswahl@test.local", password_hash=hash_password("x"),
                        display_name="Sportauswahl")
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id
    finally:
        db.close()
    yield uid
    db = SessionLocal()
    try:
        db.query(models.ImportSportPref).filter_by(user_id=uid).delete()
        db.query(models.User).filter_by(id=uid).delete()
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
