# Rein lesend: Laufstarts Brett vs. Uhr unter Accel- und GPS-Versatz (brett_t = uhr_t + vers).
import sys, json, pathlib, logging
import numpy as np
R = pathlib.Path("/home/jan/garmin-connect-iq/scripts")
sys.path.insert(0, str(R / "pumpgleit")); sys.path.insert(0, str(R / "v3"))
import gemeinsam as G
sys.path.insert(0, str(R)); from lokal_faelle import laden as _laden
_F = _laden("ausrichtung_paare", "scripts/pumpgleit/ausrichtung_paare.beispiel.json")   # IDs nur lokal
logging.disable(logging.WARNING)
from app import models
db = G.db_lesend()
GPSV = _F["GPSV"]
def starts(sid):
    s = db.get(models.Session, sid)
    segs = json.loads(s.result.segments_json or "[]")
    return np.array([g["t_start_session_ms"] for g in segs if "t_start_session_ms" in g], float)
def guete(bs, us, v):
    if not len(bs) or not len(us): return None, 0
    d = [min(abs(b - (u + v)) for b in bs) for u in us]
    d = np.array(d); m = d < 20000
    return (float(np.median(d[m])) if m.any() else None), int(m.sum())
paare = {(p["brett"], p["uhr"]): p for p in G.paare_beste()}
paare[(_F["SCOOT_BRETT"], _F["SCOOT_UHREN"][0])] = _F["SCOOT_SCHWACH"]
for k, vg in GPSV.items():
    p = paare.get(k); va = p.get("versatz_ms")
    bs, us = starts(k[0]), starts(k[1])
    ma, na = guete(bs, us, va); mg, ng = guete(bs, us, vg)
    f = lambda x: "-" if x is None else f"{x/1000:5.1f}s"
    print(f"#{k[0]}/#{k[1]} {p['qualitaet']:7} Laeufe B{len(bs):3} U{len(us):3} | Accel: Median-Abstand {f(ma)} ({na} Treffer) | GPS: {f(mg)} ({ng})")
db.rollback(); db.close()
