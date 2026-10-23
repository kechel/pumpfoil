"""Vorschau eines v3-Kandidatenmodells in der normalen Session-Antwort — NUR LESEND (Admin, `?v3=<name>`).

Jan, 23.10.2026: „bau mal ein neues model, aber halt nicht einfach live schalten, dann mal Regression Tests und
mir beispielsessions per url zeigen vorher/nachher". Gleiches Muster wie `?brett=neu` (brett_vorschau.py):
die Vergleichsansicht zeigt dieselbe Session als „alt" (gespeichert) und „neu" (Kandidat).

Wie: die ganze Analyse (`run_analysis`, final) laeuft in einer EIGENEN DB-Sitzung, deren `commit` nur ein
`flush` ist, mit den Modellpfaden des Kandidaten (ContextVar in v3/nachbearbeitung, gilt nur fuer diesen
Aufruf). Danach wird alles zurueckgerollt — gespeichert wird nichts. So rechnet die Vorschau exakt wie die
Live-Pipeline (inkl. Pumps auf den neuen Grenzen), statt eine zweite Fassung davon zu pflegen.
Kandidaten: server/data/ml/v3/stufe_a_<name>.pkl, Referenz fuer die Haltungs-Merkmale wie live (r3).
"""
from __future__ import annotations

import re
from pathlib import Path

from .. import models
from ..db import SessionLocal

KANDIDATEN = Path(__file__).resolve().parents[2] / "data" / "ml" / "v3"


def kandidat(name: str) -> tuple[Path, Path] | None:
    from ..analysis.v3 import nachbearbeitung as N
    if not re.fullmatch(r"[a-z0-9_]{1,40}", name or ""):
        return None
    if name in ("live", "r4"):
        return N.MODELL, N.REF
    pfad = KANDIDATEN / f"stufe_a_{name}.pkl"
    return (pfad, N.REF) if pfad.exists() else None


def ueberlagern(s: models.Session, out, name: str, session_out) -> bool:
    """`out.analysis` durch die Analyse mit dem Kandidaten ersetzen. False = nichts gemacht."""
    from ..analysis import run_analysis
    from ..analysis.v3 import nachbearbeitung as N
    pfade = kandidat(name)
    if pfade is None:
        return False
    db2 = SessionLocal()
    db2.commit = db2.flush            # type: ignore[method-assign]  — nichts darf hier festgeschrieben werden
    token = N._VORSCHAU.set((pfade[0], pfade[1], f"vorschau:{name}"))
    try:
        s2 = db2.get(models.Session, s.id)
        if s2 is None:
            return False
        run_analysis(db2, s2, final=True)
        neu = session_out(s2, with_analysis=True)
        out.analysis = neu.analysis
        return True
    finally:
        N._VORSCHAU.reset(token)
        db2.rollback()
        db2.close()
