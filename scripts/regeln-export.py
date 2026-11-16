#!/usr/bin/env python3
"""Englische Team-Regeln aus web/src/i18n/locales/en.ts nach server/app/data/team_regeln_en.json exportieren.

    python scripts/regeln-export.py

Nach jeder Aenderung an team.regeln.* (en.ts) oder an ABSCHNITTE (TeamRegeln.tsx) laufen lassen und REGELN_STAND in
server/app/teams.py hochsetzen. tests/test_regeln_export.py prueft, dass die Datei aktuell ist."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from app.regeln_text import EXPORT, aus_quellen  # noqa: E402

EXPORT.write_text(json.dumps(aus_quellen(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print("geschrieben:", EXPORT)
