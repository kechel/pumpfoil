"""Ø Puls auf dem Foil (Feedback u904, 01.11.2026): nur ueber die Laeufe, ausgewaehlt ueber die Session-Zeit."""
import json


def test_hr_foil_nur_laeufe(monkeypatch):
    from app import storage
    from app.api import sessions as S
    # 1 Hz, 0..299 s: Pause 100 bpm, Lauf 100-199 s mit 160 bpm (leicht schwankend), danach wieder Pause.
    gps = [[t * 1000, 47.0, 9.0, 0.0, (160 + (t % 3)) if 100 <= t <= 199 else 100 + (t % 2), 5.0] for t in range(300)]
    monkeypatch.setattr(storage, "load_gps", lambda uuid: gps)
    segs = json.dumps([{"i_start": 0, "i_end": 5, "t_start_session_ms": 100000, "t_end_session_ms": 199000}])
    assert S._hr_foil("x", segs) == 161
    assert S._hr_foil("x", "[]") is None
    ohne = [[r[0], r[1], r[2], r[3], None, r[5]] for r in gps]
    monkeypatch.setattr(storage, "load_gps", lambda uuid: ohne)
    assert S._hr_foil("x", segs) is None
