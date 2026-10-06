"""Brett-Lage je Session gespeichert (analysis/lage_cache.py, 06.10.2026: die Startseite lud 11 s).
Gespeichert ist nur richtig, solange die Eingaben gleich sind — jede Aenderung muss neu rechnen."""
from __future__ import annotations

import json
import types

from app.analysis import lage_cache as L


class _Db:
    def __init__(self): self.commits = 0
    def commit(self): self.commits += 1


def _session(segs="[]", trim=None, rot=None):
    r = types.SimpleNamespace(segments_json=segs, lage_json=None)
    return types.SimpleNamespace(result=r, trim_start_ms=trim, attitude_rot_deg=rot, session_uuid="x")


def test_rechnet_einmal_und_dann_aus_dem_speicher(monkeypatch):
    aufrufe = []
    monkeypatch.setattr(L, "_rechnen", lambda s, r: aufrufe.append(1) or
                        {"gezaehlt": True, "ohne_kreisel": False, "laeufe": [{"dauer_s": 30.0, "pitch": 5.0}]})
    db, s = _Db(), _session('[{"t_start_ms": 0}]')
    a = L.laeufe_der_session(db, s)
    b = L.laeufe_der_session(db, s)
    assert len(aufrufe) == 1 and a == b and db.commits == 1
    assert json.loads(s.result.lage_json)["laeufe"][0]["pitch"] == 5.0


def test_jede_eingabe_aendert_den_fingerabdruck(monkeypatch):
    aufrufe = []
    monkeypatch.setattr(L, "_rechnen", lambda s, r: aufrufe.append(1) or
                        {"gezaehlt": True, "ohne_kreisel": False, "laeufe": []})
    db, s = _Db(), _session('[{"t_start_ms": 0}]')
    L.laeufe_der_session(db, s)
    s.result.segments_json = '[{"t_start_ms": 0}, {"t_start_ms": 9}]'   # neue Auswertung
    L.laeufe_der_session(db, s)
    s.trim_start_ms = 5000                                              # Zuschnitt
    L.laeufe_der_session(db, s)
    s.attitude_rot_deg = 90.0                                           # Montage-Drehung
    L.laeufe_der_session(db, s)
    monkeypatch.setattr("app.analysis.lage.LAGE_VERSION", "neu")        # Rechenstand
    L.laeufe_der_session(db, s)
    L.laeufe_der_session(db, s)                                         # nichts geaendert
    assert len(aufrufe) == 5


def test_ohne_ergebnis_nichts():
    s = types.SimpleNamespace(result=None)
    assert L.laeufe_der_session(_Db(), s)["gezaehlt"] is False
