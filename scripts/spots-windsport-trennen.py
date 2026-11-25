#!/usr/bin/env python3
"""Bestehende Spots auf die Windsport-Regel umstellen (Jan, 25.11.2026; Regel in server/app/spots.py, WEIT_SPORTARTEN).

Seit 25.11. traegt eine Wing-/Kite-/Windsurf-Session nur noch ihren STARTPUNKT zur Spot-Flaeche bei. Der Bestand ist
noch mit den langen Strecken geclustert: Spots, die nur ueber eine Wind-Strecke zusammenhaengen, sind in Wahrheit
mehrere. Dieses Skript nimmt jeden Spot mit mindestens einer Windsport-Session, clustert seine Sessions neu
(`spots.build_spots` mit der neuen Geometrie) und

  * baut das Polygon neu, wenn alles ein Spot bleibt (es schrumpft auf Pumpfoil-Strecken + Wind-Starts);
  * trennt sonst die kleineren Teile mit `spots.trennen` ab (neuer Spot, automatischer Name, Paar bleibt getrennt).
    Der groesste Teil behaelt Spot-Id und Namen (von Hand vergebene Namen bleiben so unberuehrt).
    Sessions, die zwei Teile beruehren (build_spots: „unklar"), gehen wie in `assign_one` zu dem Teil, in dem sie
    STARTEN (mehrere: der mit dem naechsten Startpunkt); liegt der Start in keinem Teil, bleiben sie beim alten Spot.

Ohne --echt nur Trockenlauf. Mit --echt vorher Sicherung nach server/data/sicherung/ (neue Datei).

    cd server && DATABASE_URL=... nice -n 15 .venv/bin/python ../scripts/spots-windsport-trennen.py
    cd server && DATABASE_URL=... nice -n 15 .venv/bin/python ../scripts/spots-windsport-trennen.py --echt
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "server"))

from shapely.geometry import Point  # noqa: E402
from shapely.ops import unary_union  # noqa: E402

from app import models, spots as SP  # noqa: E402
from app.db import SessionLocal  # noqa: E402


def main() -> None:
    echt = "--echt" in sys.argv
    db = SessionLocal()
    S = models.Session
    je: dict[int, list] = defaultdict(list)
    for s in db.query(S).filter(S.spot_id.isnot(None), S.deleted.isnot(True)).all():
        je[s.spot_id].append(s)
    betroffen = {k: v for k, v in je.items() if any(s.sport_class in SP.WEIT_SPORTARTEN for s in v)}
    plan = []
    for sid, sess in sorted(betroffen.items()):
        sp = db.get(models.Spot, sid)
        if sp is None or sp.merged_into is not None:
            continue
        geoms = [g for g in (SP._session_geom(db, s) for s in sess) if g and g.points]
        if not geoms:
            continue
        teile, zuordnung = SP.build_spots(geoms)
        # Unklare (beruehren zwei Teile) nach dem Start einsortieren — Projektion wie in build_spots (Median-lat)
        pts = [q for g in geoms for q in g.points]
        lat0 = sorted(q[0] for q in pts)[len(pts) // 2]
        gmap = {g.sid: g for g in geoms}
        for gid, t_id in zuordnung.items():
            if t_id is not None or len(teile) < 2:
                continue
            g = gmap[gid]
            x, y = SP._project([g.start], lat0)[0]
            pt = Point(x, y)
            drin = [t for t in teile if t.poly.contains(pt)]
            if not drin and g.radius == SP.WEIT_START_M:   # Windsport: naechster Teil im Startkreis (wie assign_one)
                nah = [t for t in teile if t.poly.distance(pt) <= SP.WEIT_START_M]
                drin = [min(nah, key=lambda t: t.poly.distance(pt))] if nah else []
            if drin:
                bester = min(drin, key=lambda t: SP.abstand_m(t.rep[0], t.rep[1], g.start[0], g.start[1]))
                bester.session_ids.append(gid)
                zuordnung[gid] = bester.id
        teile.sort(key=lambda t: -len(t.session_ids))
        abtrennen = [t.session_ids for t in teile[1:]]
        plan.append({"spot": sid, "name": sp.name, "quelle": sp.name_source, "sessions": len(sess),
                     "teile": [len(t.session_ids) for t in teile],
                     "unklar_bleiben": sum(1 for v in zuordnung.values() if v is None),
                     "abtrennen": abtrennen})

    getrennt = [p for p in plan if p["abtrennen"]]
    print(f"Spots mit Windsport: {len(plan)} · davon zerfallen: {len(getrennt)} · "
          f"Sessions, die umziehen: {sum(len(x) for p in getrennt for x in p['abtrennen'])}")
    for p in getrennt:
        print(f"  #{p['spot']:<5} {str(p['name'])[:32]:32} [{p['quelle'] or '-'}] {p['sessions']} Sessions -> Teile {p['teile']}"
              + (f", {p['unklar_bleiben']} unklar (bleiben)" if p["unklar_bleiben"] else ""))
    if not echt:
        print("\nTrockenlauf — nichts geschrieben. Mit --echt ausfuehren.")
        return

    # Sicherung: alle beruehrten Spots und ihre Sessions, wie sie JETZT sind
    ziel = Path(__file__).resolve().parent.parent / "server" / "data" / "sicherung"
    ziel.mkdir(parents=True, exist_ok=True)
    datei = ziel / f"spots-windsport-{datetime.now():%Y%m%d-%H%M%S}.json"
    sicherung = {
        "spots": [{"id": sp.id, "name": sp.name, "name_source": sp.name_source, "water_name": sp.water_name,
                   "lat": sp.lat, "lon": sp.lon, "poly_wkt": sp.poly_wkt}
                  for sp in db.query(models.Spot).filter(models.Spot.id.in_([p["spot"] for p in plan])).all()],
        "sessions": [{"id": s.id, "spot_id": s.spot_id, "place_name": s.place_name, "place_water": s.place_water}
                     for p in plan for s in je[p["spot"]]],
    }
    datei.write_text(json.dumps(sicherung, ensure_ascii=False, default=str))
    print(f"\nSicherung: {datei}")

    neu = []
    for p in plan:
        sp = db.get(models.Spot, p["spot"])
        for ids in p["abtrennen"]:
            n = SP.trennen(db, sp.id, ids, notiz="Windsport-Regel 25.11.2026 (scripts/spots-windsport-trennen.py)")
            neu.append((sp.id, n.id, n.name, len(ids)))
        if not p["abtrennen"]:
            # nur Polygon neu: Pumpfoil-Strecken + Wind-Starts
            rest = [g for g in (SP._session_geom(db, s) for s in je[p["spot"]]) if g and g.points]
            lat0 = sp.lat or rest[0].start[0]
            sp.poly_wkt = SP._m_to_wkt(unary_union([SP._geom_poly(g, lat0) for g in rest]), lat0)
        db.commit()
    for alt, n, name, k in neu:
        print(f"  neu #{n} „{name}“ aus #{alt} ({k} Sessions)")
    print(f"Fertig: {len(neu)} neue Spots, {len(plan) - len(getrennt)} Polygone neu gebaut.")


if __name__ == "__main__":
    main()
