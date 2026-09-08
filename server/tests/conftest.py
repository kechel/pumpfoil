"""Test-Fixtures: isolierte Test-DB + temporäres Datenverzeichnis pro Testlauf.

Tests laufen gegen Postgres, wie Prod — es gibt keinen SQLite-Rückfall mehr (entfernt am
08.09.2026: er verdeckte Fremdschlüssel- und JSONB-Fehler, die in der CI dann doch auffielen,
s. `test_importsports.py`). Die URL kommt aus `TEST_DATABASE_URL` (in CI ein wegwerfbarer
postgres-Container). Fehlt sie, wird sie aus `DATABASE_URL` abgeleitet, indem der Datenbankname
durch `<name>_test` ersetzt wird — und nur akzeptiert, wenn er wirklich auf `_test` endet.
Die Prod-DB wird dadurch nie berührt, auch nicht bei einem Tippfehler.
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
def _test_db_url() -> str:
    url = (os.environ.get("TEST_DATABASE_URL") or "").strip()
    if not url:
        # Aus der Prod-URL ableiten: nur der Datenbankname wird getauscht, Host/Benutzer bleiben.
        prod = (os.environ.get("DATABASE_URL") or "").strip()
        if not prod:
            raise RuntimeError(
                "Tests brauchen eine Postgres-DB: TEST_DATABASE_URL setzen (oder DATABASE_URL, "
                "dann wird <name>_test daraus abgeleitet). Lokal existiert `foil_test`."
            )
        basis, _, name = prod.rpartition("/")
        url = f"{basis}/{name.split('?')[0]}_test"
    if not url.startswith("postgresql"):
        raise RuntimeError(f"Test-DB muss Postgres sein, nicht '{url.split(':', 1)[0]}:'.")
    # Der Riegel: eine URL, deren Datenbankname nicht auf _test endet, wird nicht angefasst.
    # Die Tests legen Tabellen an und löschen Zeilen — das darf niemals die echte DB treffen.
    if not url.rstrip("/").split("/")[-1].split("?")[0].endswith("_test"):
        raise RuntimeError(f"Test-DB-Name muss auf '_test' enden: {url}")
    return url


os.environ["DATABASE_URL"] = _test_db_url()
os.environ["DATA_DIR"] = f"{_tmp}/data"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["WEB_DIST"] = f"{_tmp}/nonexistent-dist"


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from sqlalchemy import text

    from app.db import engine, init_db
    from app.main import app

    # Frischer Stand je Lauf. Die Wegwerf-SQLite brachte das gratis mit (neue Datei je Lauf), eine
    # echte Datenbank nicht: nach dem ersten Lauf blieben 26 Nutzer liegen und 10 Tests fielen mit
    # „KeyError: access_token" um, weil `register` an `ix_users_email` scheiterte. Das Leeren ist
    # nur deshalb erlaubt, weil `_test_db_url()` oben garantiert, dass der Datenbankname auf
    # `_test` endet — an die echte DB kann diese Zeile nicht kommen.
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
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
