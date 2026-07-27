"""Test-Fixtures: isolierte Test-DB + temporäres Datenverzeichnis pro Testlauf.

Default ist Postgres (wie Prod) über TEST_DATABASE_URL — in CI ein wegwerfbarer
postgres-Service-Container, lokal eine separate `foil_test`-DB. NUR wenn TEST_DATABASE_URL
fehlt, fällt es auf eine Wegwerf-SQLite zurück (zero-setup; berührt nie die echte DB).
Es wird bewusst NIE die Prod-`DATABASE_URL` (`.env`) verwendet, damit Tests nichts verschmutzen.
"""
from __future__ import annotations

import atexit
import os
import shutil
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="foil-test-")
# Nach dem Lauf wieder wegräumen. Ohne das bleibt pro Testlauf ein Ordner in /tmp liegen — es hatten
# sich 143 angesammelt (34 MB), bevor es jemandem auffiel. atexit statt Fixture, weil das Verzeichnis
# schon beim IMPORT gebraucht wird (die Env-Variablen unten müssen vor dem ersten App-Import stehen)
# und so auch abgebrochene Läufe aufräumen. `FOIL_KEEP_TMP=1` behält es, wenn man hineinschauen will.
atexit.register(lambda: None if os.environ.get("FOIL_KEEP_TMP") else shutil.rmtree(_tmp, ignore_errors=True))
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp}/test.sqlite3"
os.environ["DATA_DIR"] = f"{_tmp}/data"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["WEB_DIST"] = f"{_tmp}/nonexistent-dist"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient

    from app.db import init_db
    from app.main import app

    init_db()
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_rate_limit():
    """Rate-Limiter-Zustand pro Test zurücksetzen (jetzt DB-gestützt, Tabelle rate_events),
    sonst summieren sich Registrierungen/Logins über die Tests bis 429."""
    try:
        from app import models
        from app.db import SessionLocal

        db = SessionLocal()
        try:
            db.query(models.RateEvent).delete()
            db.commit()
        finally:
            db.close()
    except Exception:  # noqa: BLE001 — Tabelle evtl. noch nicht angelegt (kein client-Fixture)
        pass
    yield
