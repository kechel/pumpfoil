#!/usr/bin/env python3
"""Wenden/Halsen gegen Nutzer-Rueckmeldungen pruefen (rein LESEND).

Vergleichsdaten: server/data/wahrheit/manoever.jsonl (gitignored, s. README dort). Je Session wird
die aktuelle Erkennung (app/manoever.py ueber den /manoever-Endpunkt) neben das gestellt, was der
Fahrer gesehen hat. Die Fahrer-Zahlen sind Schaetzungen (Jan: „nicht 100 % die Wahrheit"), deshalb
gilt eine Abweichung bis TOLERANZ als Treffer.

    cd server && .venv/bin/python ../scripts/manoever-pruefen.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from app import models  # noqa: E402
from app.api.sessions import session_manoever  # noqa: E402
from app.db import SessionLocal  # noqa: E402

TOLERANZ = 1
DATEI = Path(__file__).resolve().parent.parent / "server" / "data" / "wahrheit" / "manoever.jsonl"


def main():
    if not DATEI.exists():
        print(f"keine Vergleichsdaten: {DATEI}"); return
    zeilen = [json.loads(z) for z in DATEI.read_text().splitlines() if z.strip()]
    db = SessionLocal()
    try:
        leser = db.query(models.User).filter_by(is_admin=True).first()
        abw = []
        print("Session  Typ    gesehen auf Foil | erkannt auf Foil / gesamt | Abweichung")
        for z in zeilen:
            r = session_manoever(z["session_id"], leser, db)
            zahl = (r.get("zahlen") or {}).get(z["typ"]) or {"durch": 0, "ab": 0}
            gesamt = zahl["durch"] + zahl["ab"]
            d = zahl["durch"] - z["durch_gesehen"]
            abw.append(abs(d))
            print(f"#{z['session_id']:<6} {z['typ']:6} {z['durch_gesehen']:>15} | {zahl['durch']:>16} / {gesamt:<6} | {d:+d}"
                  + (f"   (gesamt gesehen {z['gesamt_gesehen']})" if z.get("gesamt_gesehen") else ""))
        if abw:
            treffer = sum(1 for a in abw if a <= TOLERANZ)
            print(f"\n{treffer}/{len(abw)} Sessions innerhalb +-{TOLERANZ}, mittlere Abweichung "
                  f"{sum(abw) / len(abw):.1f} (Fahrer-Zahlen sind Schaetzungen)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
