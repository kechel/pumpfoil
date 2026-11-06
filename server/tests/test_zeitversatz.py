"""Geerbte Pausen der Apple Watch (app/zeitversatz.py, 06.11.2026): erkennen, Zeitachse schieben, eigene Pausen behalten."""
import base64
import json
import secrets
from datetime import datetime, timedelta, timezone


def test_bestimmen_summe_der_geerbten():
    vorige = [[1112501, 630246], [2392200, 392525], [3385680, 3530638]]
    # Mysia #19856: genau die drei Fenster der vorigen Aufnahme, erster Messwert -4553346 ms.
    from app.zeitversatz import bestimmen
    v, geerbt, eigene = bestimmen(list(vorige), vorige, -4553346)
    assert v == 4553409 and geerbt == vorige and eigene == []


def test_bestimmen_eigene_pause_bleibt_und_ungleich_heisst_erster_messwert():
    from app.zeitversatz import bestimmen
    vorige = [[3963679, 920167]]
    v, geerbt, eigene = bestimmen([[1294562, 5619], [3963679, 920167]], vorige, -920066)
    assert v == 920167 and eigene == [[1294562, 5619]]
    # Geerbte Fenster fehlen in der Liste (eigene unter 0 verworfen): der erste Messwert traegt den Versatz.
    v2, _g, _e = bestimmen(list(vorige), vorige, -996000)
    assert v2 == 996000


def test_normale_aufnahme_bleibt_unberuehrt():
    from app.zeitversatz import bestimmen
    assert bestimmen([[60000, 30000]], [[60000, 30000]], 40) is None   # erster Messwert nach dem Start
    assert bestimmen([], [], 1500) is None


def test_korrigieren_schiebt_dateien_und_pausen(client):
    from app import models, storage, zeitversatz
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        u = models.User(email=f"zv-{secrets.token_hex(4)}@example.org", password_hash="x")
        db.add(u); db.flush()
        dev = models.DeviceToken(user_id=u.id, label="Apple Watch", token=secrets.token_hex(16), platform="apple")
        db.add(dev); db.flush()
        t = datetime(2026, 11, 3, 9, 0, tzinfo=timezone.utc)
        vor = models.Session(session_uuid=secrets.token_hex(8), user_id=u.id, device_id=dev.id, started_at=t,
                             status="analyzed", pause_windows=json.dumps([[600000, 300000]]))
        neu = models.Session(session_uuid=secrets.token_hex(8), user_id=u.id, device_id=dev.id,
                             started_at=t + timedelta(hours=2), status="complete")
        db.add_all([vor, neu]); db.flush()
        storage.ensure_session_dir(vor.session_uuid)
        storage.save_gps_chunk(neu.session_uuid, 0, [[-299950, 47.9, 9.3, 1.0, 0, 5.0], [-298950, 47.9, 9.3, 1.0, 0, 5.0]])
        storage.save_accel_chunk(neu.session_uuid, 0, base64.b64encode(b"\0" * 12).decode(), t0_ms=-299960)
        # Wie die Uhr sie schickt: das geerbte Fenster, dann eine eigene Pause auf der verschobenen Achse (unter 0).
        v = zeitversatz.korrigieren(db, neu, [[600000, 300000], [-100000, 20000]])
        db.commit()
        assert v == 300000
        g = storage.load_gps(neu.session_uuid, roh=True)
        assert [p[0] for p in g] == [50, 1050]
        assert storage.load_accel_t0(neu.session_uuid) == {0: 40}
        assert json.loads(neu.pause_windows) == [[200000, 20000]]
        meta = json.loads((storage.session_dir(neu.session_uuid) / "meta.json").read_text())
        assert meta["zeitversatz_ms"] == 300000 and meta["pausen_geerbt"] == [[600000, 300000]]
        # Zweimal geht nicht.
        assert zeitversatz.korrigieren(db, neu, [[600000, 300000]]) == 0
    finally:
        db.close()
