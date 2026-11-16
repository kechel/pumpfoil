"""Englische Fassung der Team-Regeln fuer den festgehaltenen Event-Endstand (Jan, 16.11.2026: „wir speichern nur die
englische version").

Die Regeln leben als Texte `team.regeln.*` in web/src/i18n/locales/en.ts (Reihenfolge der Abschnitte: ABSCHNITTE in
web/src/pages/TeamRegeln.tsx). Der Server liest die TypeScript-Datei nicht zur Laufzeit, sondern eine Export-Datei
app/data/team_regeln_en.json — erzeugt mit `python scripts/regeln-export.py`. tests/test_regeln_export.py schlaegt fehl,
wenn sie nicht mehr zur en.ts passt (dann exportieren und REGELN_STAND in app/teams.py hochsetzen)."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
EN_TS = REPO / "web" / "src" / "i18n" / "locales" / "en.ts"
REGELN_TSX = REPO / "web" / "src" / "pages" / "TeamRegeln.tsx"
EXPORT = Path(__file__).resolve().parent / "data" / "team_regeln_en.json"


def aus_quellen(en_ts: Path = EN_TS, regeln_tsx: Path = REGELN_TSX) -> dict:
    texte = {}
    for m in re.finditer(r'"(team\.regeln\.[A-Za-z0-9_.]+)": ("(?:[^"\\]|\\.)*")', en_ts.read_text(encoding="utf-8")):
        texte[m.group(1)] = json.loads(m.group(2))
    m = re.search(r"const ABSCHNITTE = \[([^\]]*)\]", regeln_tsx.read_text(encoding="utf-8"), re.S)
    keys = re.findall(r'"([a-z_]+)"', m.group(1)) if m else []
    return {"titel": texte.get("team.regeln.titel"), "intro": texte.get("team.regeln.intro"),
            "abschnitte": [{"key": k, "titel": texte.get(f"team.regeln.{k}.titel"), "text": texte.get(f"team.regeln.{k}.text")}
                           for k in keys]}


@lru_cache(maxsize=1)
def gespeichert() -> dict | None:
    try:
        return json.loads(EXPORT.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
