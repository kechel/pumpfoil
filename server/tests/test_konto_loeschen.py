"""DSGVO-Loeschung: ein Konto muss RESTLOS verschwinden — auch mit Chat-Verlauf.

Anlass (19.09.2026): `DELETE /api/auth/me` raeumte acht Tabellen ab, waehrend 44 Fremdschluessel
auf `users` zeigen. Ein Nutzer (u588) hat am 18.09. um 10:07 sein Konto geloescht; der Aufruf
endete mit `ForeignKeyViolation` und HTTP 500 wegen `chat_room_state`. Weil die Rohdaten aber
schon VOR dem Commit von der Platte geloescht wurden, verlor er 142 GPS-Spuren — und blieb
trotzdem in der Datenbank stehen.

Dieser Test haette das verhindert: er legt genau die Zeilen an, die frueher gefehlt haben.
"""
from __future__ import annotations


def _db(client):
    """Eigene Sitzung auf derselben Test-DB. `client` stellt sicher, dass das Schema steht."""
    from app.db import SessionLocal
    return SessionLocal()


def _konto(db, models, email: str):
    u = models.User(email=email, password_hash="x", display_name=email.split("@")[0])
    db.add(u)
    db.flush()
    return u


def test_loescht_konto_mit_chat_verlauf(client):
    """Chatraum-Zustand, Nachrichten, Rueckmeldung, Verknuepfung — nichts darf bremsen."""
    from app import models
    from app.loeschung import konto_loeschen

    db_session = _db(client)
    u = _konto(db_session, models, "weg@example.com")
    uid = u.id
    # Genau die Tabellen, an denen die alte Loeschung gescheitert ist bzw. die sie uebersah.
    db_session.add(models.ChatRoomState(user_id=uid, scope="spot:Test", last_read_id=0))
    db_session.add(models.ChatMessage(user_id=uid, scope="spot:Test", text="hallo"))
    db_session.add(models.Feedback(user_id=uid, text="Danke!"))
    db_session.add(models.PushSubscription(user_id=uid, endpoint="https://x/1", p256dh="a", auth="b"))
    db_session.commit()

    konto_loeschen(db_session, u)

    assert db_session.get(models.User, uid) is None
    for modell in (models.ChatRoomState, models.ChatMessage, models.Feedback, models.PushSubscription):
        assert db_session.query(modell).filter_by(user_id=uid).count() == 0, modell.__name__


def test_rohdaten_bleiben_wenn_die_loeschung_scheitert(client, monkeypatch):
    """Dateien fallen ERST nach dem Commit — sonst ueberlebt ein Rollback sie nicht.

    Genau dieser Fall ist am 18.09. eingetreten: Rollback in der Datenbank, aber die
    GPS-Verzeichnisse waren schon weg.
    """
    from app import loeschung, models

    db_session = _db(client)
    u = _konto(db_session, models, "fehlschlag@example.com")
    db_session.commit()

    gefallen: list = []
    monkeypatch.setattr(loeschung.shutil, "rmtree", lambda d, **kw: gefallen.append(d))

    def platzt(*a, **kw):
        raise RuntimeError("Commit kaputt")
    monkeypatch.setattr(db_session, "commit", platzt)

    try:
        loeschung.konto_loeschen(db_session, u)
    except RuntimeError:
        pass
    assert gefallen == [], "Dateien wurden vor dem Commit geloescht"


def test_verweise_werden_aus_den_modellen_abgeleitet():
    """Die Aufraeumliste darf nicht von Hand gepflegt sein — sonst veraltet sie wieder."""
    from app.loeschung import _verweise_auf_users

    verweise = _verweise_auf_users()
    namen = {f"{t.name}.{s.name}" for t, s in verweise}
    # Stichproben aus verschiedenen Ecken; die alte Liste kannte keine davon.
    for erwartet in ("chat_room_state.user_id", "feedback.user_id", "suunto_links.user_id",
                     "push_subscriptions.user_id", "social_channels.user_id"):
        assert erwartet in namen, erwartet
    assert len(verweise) >= 40, f"nur {len(verweise)} Verweise gefunden — Metadaten unvollstaendig?"
