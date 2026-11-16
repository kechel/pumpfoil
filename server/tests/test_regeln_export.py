"""Die gespeicherte englische Regel-Fassung (app/data/team_regeln_en.json) muss zur en.ts passen — sonst haelt ein
festgeschriebener Endstand den falschen Regeltext fest. Bei Fehlschlag: python scripts/regeln-export.py und REGELN_STAND."""
import json


def test_regeln_export_aktuell():
    from app.regeln_text import EXPORT, aus_quellen
    soll = aus_quellen()
    assert soll["abschnitte"] and all(a["titel"] and a["text"] for a in soll["abschnitte"])
    assert json.loads(EXPORT.read_text(encoding="utf-8")) == soll, "python scripts/regeln-export.py ausfuehren"
