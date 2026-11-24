"""Tempo-Verteilung (Jan 24.11.2026, Plan docs/TEMPO-VERTEILUNG.md): Sekunden auf dem Foil je Tempo-Stufe.

* `/api/tempo/eigen` — die eigenen Sessions, filterbar nach Sportart, Zeitraum, Foil und Spot (Home › Stats › Tempo).
* `/api/tempo/foil/{id}` — alle Fahrer auf einem Foil, NUR als Summe und erst ab TEMPO_MIN_FAHRER Fahrern (dieselbe
  Grenze wie die oeffentliche Foil-Tabelle). Je Fahrer erst auf Anteile normiert, dann gemittelt — sonst bestimmte der
  Fahrer mit den meisten Stunden die Kurve eines Foils.

Die Werte je Session liegen in analysis_results.tempo_hist_json (analysis/tempo_hist.py); fehlende werden hier
nachgerechnet (hoechstens TEMPO_JE_ABRUF je Aufruf), den Bestand fuellt scripts/tempo-hist-nachtragen.py.
"""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models
from ..analysis import tempo_hist as TH
from ..db import get_db
from .community import AR, S, _ab, _community, _cutoff
from .deps import current_user

router = APIRouter(prefix="/api/tempo", tags=["tempo"])

TEMPO_MIN_FAHRER = 3
TEMPO_JE_ABRUF = 300
_foil_cache: dict = {}


def _hists(db: Session, rows: list, i_ar: int, i_js: int) -> list[dict | None]:
    """Je Zeile den Wert aus dem Cache bzw. frisch gerechnet (in Zeilenreihenfolge)."""
    werte = [TH.lies(r[i_js]) for r in rows]
    fehlt = [r[i_ar] for r, w in zip(rows, werte) if w is None]
    neu = TH.fuellen(db, fehlt, TEMPO_JE_ABRUF) if fehlt else {}
    return [w if w is not None else neu.get(r[i_ar]) for r, w in zip(rows, werte)]


@router.get("/eigen")
def eigen(user: models.User = Depends(current_user), db: Session = Depends(get_db),
          sport: str = "pumpfoil", period: str = "all", foil_id: int | None = None, spot_id: int | None = None,
          ohne_session: int | None = None) -> dict:
    """`ohne_session`: diese Session auslassen (Session-Details: „meine uebrigen Sessions mit diesem Foil")."""
    q = _community(db.query(AR.id, AR.tempo_hist_json, S.foil_id, S.spot_id), user.id, accel_only=False, sport=sport)
    q = _ab(q.filter(S.user_id == user.id), _cutoff(period))
    if ohne_session is not None:
        q = q.filter(S.id != ohne_session)
    rows = q.all()
    hists = _hists(db, rows, 0, 1)

    # Auswahl fuer die Filter: Foils und Spots mit Sekunden im Zeitraum (ohne den Foil-/Spot-Filter selbst).
    je_foil: dict[int, int] = {}
    je_spot: dict[int, int] = {}
    gewaehlt = []
    for r, h in zip(rows, hists):
        if h is None:
            continue
        s = sum(h["a"])
        if r[2] is not None:
            je_foil[r[2]] = je_foil.get(r[2], 0) + s
        if r[3] is not None:
            je_spot[r[3]] = je_spot.get(r[3], 0) + s
        if (foil_id is None or r[2] == foil_id) and (spot_id is None or r[3] == spot_id):
            gewaehlt.append(h)
    foils = {f.id: f for f in db.query(models.Foil).filter(models.Foil.id.in_(list(je_foil))).all()} if je_foil else {}
    spots = {sp.id: sp for sp in db.query(models.Spot).filter(models.Spot.id.in_(list(je_spot))).all()} if je_spot else {}
    fehlt_noch = sum(1 for h in hists if h is None)
    return {
        "breite_kmh": TH.BREITE_KMH,
        **TH.summe(gewaehlt),
        "sessions": len(gewaehlt),
        "unvollstaendig": fehlt_noch,
        "foils": sorted(({"id": i, "label": " ".join(x for x in (f.brand, f.model, f.size) if x), "s": s}
                         for i, s in je_foil.items() if (f := foils.get(i))), key=lambda x: -x["s"]),
        "spots": sorted(({"id": i, "label": sp.name or f"Spot {i}", "s": s}
                         for i, s in je_spot.items() if (sp := spots.get(i))), key=lambda x: -x["s"]),
    }


@router.get("/foil/{foil_id}")
def foil(foil_id: int, user: models.User = Depends(current_user), db: Session = Depends(get_db)) -> dict:
    hit = _foil_cache.get(foil_id)
    if hit and time.monotonic() - hit[0] < 600:
        return hit[1]
    if db.get(models.Foil, foil_id) is None:
        raise HTTPException(404, "foil not found")
    rows = (_community(db.query(AR.id, AR.tempo_hist_json, S.user_id), user.id, accel_only=False)
            .filter(S.foil_id == foil_id).all())
    hists = _hists(db, rows, 0, 1)
    je_fahrer: dict[int, list[dict]] = {}
    for r, h in zip(rows, hists):
        if h is not None and sum(h["a"]):
            je_fahrer.setdefault(r[2], []).append(h)
    out: dict = {"breite_kmh": TH.BREITE_KMH, "fahrer": len(je_fahrer), "sessions": sum(len(v) for v in je_fahrer.values()),
                 "min_fahrer": TEMPO_MIN_FAHRER}
    if len(je_fahrer) >= TEMPO_MIN_FAHRER:
        n = TH.STUFEN
        a = [0.0] * n
        g = [0.0] * n
        gb = [0.0] * n
        for hs in je_fahrer.values():
            s = TH.summe(hs)
            tot = sum(s["a"]) or 1
            for k in range(n):
                a[k] += s["a"][k] / tot
                g[k] += s["g"][k] / tot
                gb[k] += s["g_basis"][k] / tot
        f = len(je_fahrer)
        # Anteile in Promille der Fahrzeit (Mittel ueber die Fahrer) — keine Sekunden, keine Einzelwerte.
        out.update({"genug": True, "a": [round(x / f * 1000, 2) for x in a], "g": [round(x / f * 1000, 2) for x in g],
                    "g_basis": [round(x / f * 1000, 2) for x in gb]})
    else:
        out["genug"] = False
    if not any(h is None for h in hists):   # nur vollstaendige Rechnungen cachen
        _foil_cache[foil_id] = (time.monotonic(), out)
    return out
