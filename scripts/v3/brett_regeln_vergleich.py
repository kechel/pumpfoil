#!/usr/bin/env python3
"""Vorher/Nachher fuer die Brett-Regeln (app/analysis/brett_regeln.py) — REIN LESEND.

Je Brett-Session (placement = board, mit Kreisel): heutige Analyse (Laeufe, Foilzeit, Pumps aus dem
Handgelenk-Zaehler auf der Vertikalbeschleunigung) gegen die Regeln (Pumps mit Energie, Foilzeit bis
zum Aufsetzen, Gleitzeit), dazu die Montage-Kennzahlen. Aendert nichts an der Datenbank.

Aufruf (aus server/): DATABASE_URL=... .venv/bin/python ../scripts/v3/brett_regeln_vergleich.py [--json pfad]
"""
import argparse, json, logging, os, pathlib, sys
os.environ.setdefault("OMP_NUM_THREADS", "1")
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))
logging.disable(logging.WARNING)
import numpy as np
from app import models, storage
from app.db import SessionLocal
from app.api.sessions import _lage_antwort
from app.api.brett_vorschau import echt_maske
from app.analysis import brett_regeln as BR

ap = argparse.ArgumentParser()
ap.add_argument("--json")
a = ap.parse_args()
db = SessionLocal()
ss = (db.query(models.Session).filter(models.Session.placement == "board", models.Session.deleted.isnot(True))
      .order_by(models.Session.started_at).all())
zeilen = []
print(f"{'Session':>8} {'Nutzer':>6} {'Läufe':>5} {'Foil s alt':>10} {'Foil s neu':>10} {'Pumps alt':>9} "
      f"{'Pumps neu':>9} {'Gleit s':>7} {'Gleit %':>7} {'Aufs. GPS':>9} {'Nick':>5} {'Lage°':>5}")
for s in ss:
    if not storage.chunk_laengen(s.session_uuid, "gyro") or s.result is None:
        continue
    seg = json.loads(s.result.segments_json or "[]")
    if not seg:
        continue
    off = int(s.trim_start_ms or 0)
    laeufe = [(float(g.get("t_start_session_ms", g["t_start_ms"] + off)),
               float(g.get("t_end_session_ms", g["t_end_ms"] + off))) for g in seg]
    dauer = (s.ended_at - s.started_at).total_seconds() * 1000 if s.ended_at else laeufe[-1][1] + 10000
    r = _lage_antwort(db, s, from_ms=0, to_ms=int(dauer), pad_s=0.0, hz=BR.HZ)
    if not r.get("ok") or not r.get("hub_cm"):
        print(f"#{s.id:>7} u{s.user_id:<5} keine Lage/Hub ({r.get('grund')})")
        continue
    t = np.asarray(r["t_ms"], float)
    gps = np.asarray(storage.load_gps(s.session_uuid), float)
    _, lauf = BR.je_lauf(t, r["hub_cm"], r["pitch_deg"], gps, laeufe, echt=echt_maske(s, t))
    mo = BR.montage(t, np.nan_to_num(np.asarray(r["pitch_deg"], float)),
                    np.nan_to_num(np.asarray(r.get("roll_deg") or np.zeros(t.size), float)), laeufe)
    foil_alt = sum((b - x) / 1000 for x, b in laeufe)
    # ohne Aussage (zu wenig Zyklen) bleibt der Lauf, wie er ist — wie in app/api/brett_vorschau.py
    foil_neu = sum(((k["aufsetzen_ms"] if k["ok"] else b) - x) / 1000 for (x, b), k in zip(laeufe, lauf))
    pumps_alt = sum(int(g.get("pumps") or 0) for g in seg)
    # Laeufe ohne Aussage (zu wenig Zyklen) behalten die alte Zaehlung — wie die Vorschau.
    pumps_neu = sum(k["pumps"] if k["ok"] else int(g.get("pumps") or 0) for g, k in zip(seg, lauf))
    gleit = sum(k["gleit_s"] or 0 for k in lauf)
    gps_td = sum(1 for k in lauf if k["aufsetzen_quelle"] == "gps")
    z = dict(id=s.id, user=s.user_id, laeufe=len(laeufe), foil_alt=foil_alt, foil_neu=foil_neu,
             pumps_alt=pumps_alt, pumps_neu=pumps_neu, gleit_s=gleit, aufsetzen_gps=gps_td,
             ok_laeufe=sum(1 for k in lauf if k["ok"]), montage=mo, je_lauf=lauf)
    zeilen.append(z)
    print(f"#{s.id:>7} u{s.user_id:<5} {len(laeufe):5} {foil_alt:10.0f} {foil_neu:10.0f} {pumps_alt:9} {pumps_neu:9} "
          f"{gleit:7.0f} {(gleit / foil_neu if foil_neu else 0):7.0%} {gps_td:4}/{len(laeufe):<4} "
          f"{mo['nick_anteil'] if mo['nick_anteil'] is not None else '–':>5} "
          f"{mo['lage_streuung_grad'] if mo['lage_streuung_grad'] is not None else '–':>5}")
if zeilen:
    fa, fn = sum(z["foil_alt"] for z in zeilen), sum(z["foil_neu"] for z in zeilen)
    pa, pn = sum(z["pumps_alt"] for z in zeilen), sum(z["pumps_neu"] for z in zeilen)
    print(f"Summe {len(zeilen)} Sessions: Foil {fa:.0f} s -> {fn:.0f} s ({fn / fa - 1:+.0%}), "
          f"Pumps {pa} -> {pn} ({pn / max(pa, 1) - 1:+.0%}), Gleiten {sum(z['gleit_s'] for z in zeilen):.0f} s")
if a.json:
    json.dump(zeilen, open(a.json, "w"), indent=1)
db.close()
