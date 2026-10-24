#!/usr/bin/env python3
"""Plausibilitaets-Regeln (server/app/plausibel.py) ueber echte Sessions. REIN LESEND (24.10.2026).

Baut je Session dieselbe Antwort wie GET /api/sessions/{id} (`_session_out`, mit Analyse) und meldet verletzte Regeln.

    cd server && DATABASE_URL=... .venv/bin/python ../scripts/plausibel-bestand.py [--n 800] [--sport wingfoil]
"""
import argparse
import collections
import logging
import re
import sys

sys.path.insert(0, ".")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=800, help="neueste N analysierte Sessions")
    ap.add_argument("--sport", default="")
    a = ap.parse_args()
    logging.disable(logging.WARNING)
    from app import models, plausibel
    from app.api import sessions as S
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        q = (db.query(models.Session).filter(models.Session.status == "analyzed", models.Session.deleted.isnot(True),
                                             models.Session.merged_into.is_(None)))
        if a.sport:
            q = q.filter(models.Session.sport_class == a.sport)
        geprueft, zaehl, bsp = 0, collections.Counter(), collections.defaultdict(list)
        for s in q.order_by(models.Session.id.desc()).limit(a.n):
            try:
                out = S._session_out(s, True)
            except Exception as ex:     # eine kaputte Session soll den Lauf nicht beenden — aber gemeldet werden
                zaehl["Antwort-Fehler"] += 1; bsp["Antwort-Fehler"].append((s.id, str(ex)[:80])); continue
            an = out.analysis.model_dump() if out.analysis else None
            geprueft += 1
            for msg in plausibel.pruefen(an, out.duration_ms):
                # Regel = Text ohne Zahlen und ohne Lauf-/Fahrt-Nummer
                regel = re.sub(r"-?\d+(\.\d+)?", "#", msg.split(":", 1)[1] if msg.startswith(("Lauf ", "Fahrt ")) else msg)
                zaehl[regel] += 1
                if len(bsp[regel]) < 6:
                    bsp[regel].append((s.id, s.sport_class, msg))
    finally:
        db.rollback(); db.close()
    print(f"{geprueft} Sessions geprueft")
    for r, n in zaehl.most_common():
        print(f"{n:5}  {r}")
        for b in bsp[r]:
            print("        ", b)


if __name__ == "__main__":
    main()
