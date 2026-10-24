# Rein lesend: Laufstarts Brett vs. Uhr unter Accel- und GPS-Versatz (brett_t = uhr_t + vers).
import sys, json, pathlib, logging
import numpy as np
R = pathlib.Path("/home/jan/garmin-connect-iq/scripts")
sys.path.insert(0, str(R / "pumpgleit")); sys.path.insert(0, str(R / "v3"))
import gemeinsam as G
logging.disable(logging.WARNING)
from app import models
db = G.db_lesend()
GPSV = {(9528,9529):234750,(9535,9534):132750,(9650,9648):323750,(9650,9649):1214000,(10195,10194):213000,(10248,10250):538250,
 (10328,10326):652500,(10875,10873):697000,(10968,10969):179750,(10993,10979):267250,(12610,12608):-3089500,(12687,12722):218000,
 (12738,12737):350500,(13055,13051):459000,(13908,13909):319750,(14073,14072):867500,(15004,15003):299000,(15099,15097):379000,
 (16667,16666):406500,(17639,17638):368250,(16729,16719):-8000}
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
paare[(16729,16719)] = {"versatz_ms": -23189, "qualitaet": "schwach"}
for k, vg in GPSV.items():
    p = paare.get(k); va = p.get("versatz_ms")
    bs, us = starts(k[0]), starts(k[1])
    ma, na = guete(bs, us, va); mg, ng = guete(bs, us, vg)
    f = lambda x: "-" if x is None else f"{x/1000:5.1f}s"
    print(f"#{k[0]}/#{k[1]} {p['qualitaet']:7} Laeufe B{len(bs):3} U{len(us):3} | Accel: Median-Abstand {f(ma)} ({na} Treffer) | GPS: {f(mg)} ({ng})")
db.rollback(); db.close()
