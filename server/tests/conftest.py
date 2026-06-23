"""Test-Fixtures: isolierte SQLite-DB + temporäres Datenverzeichnis pro Testlauf."""
from __future__ import annotations

import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="foil-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp}/test.sqlite3"
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
