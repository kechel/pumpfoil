# Rein lesend: Accel-Versatz aller Brett-Paare gegen GPS-Tempo-Kreuzkorrelation (Konvention: brett_t = uhr_t + vers).
import sys, json, pathlib, logging
import numpy as np
R = pathlib.Path("/home/jan/garmin-connect-iq/scripts")
sys.path.insert(0, str(R / "pumpgleit")); sys.path.insert(0, str(R / "v3"))
import gemeinsam as G
logging.disable(logging.WARNING)
from app import models, storage
db = G.db_lesend()
def gps(sid):
    s = db.get(models.Session, sid)
    g = [x for x in storage.load_gps(s.session_uuid) if x[3] is not None]
    a = np.asarray([[x[0], x[3]] for x in g], float)
    return s.started_at.timestamp() * 1000, a
paare = G.paare_beste()
print(f"{len(paare)} Uhr-Sessions (beste Paare)")
for p in paare:
    b, u = p["brett"], p["uhr"]
    b0, B = gps(b); u0, U = gps(u)
    if len(B) < 60 or len(U) < 60:
        print(f"#{b}/#{u}: zu wenig GPS"); continue
    ab, au = B[:, 0] + b0, U[:, 0] + u0
    grid = np.arange(max(ab[0], au[0]), min(ab[-1], au[-1]), 250.0)
    if grid.size < 400:
        print(f"#{b}/#{u}: Ueberlappung zu kurz"); continue
    bv = np.interp(grid, ab, B[:, 1])
    res = []
    for off in np.arange(-90000, 90001, 250):
        uv = np.interp(grid + off, au, U[:, 1], left=np.nan, right=np.nan)
        m = ~np.isnan(uv)
        if m.sum() < 400: continue
        res.append((np.corrcoef(bv[m], uv[m])[0, 1], off))
    r, off = max(res)
    r3 = max(x for x, o in res if abs(o - off) >= 3000)
    vg = u0 - b0 - off
    va = p.get("versatz_ms")
    d = None if va is None else va - vg
    flag = "" if d is not None and abs(d) <= 1500 else "  <-- !!"
    print(f"#{b}/#{u} u{p['uhr_etiketten']['user']:<4} {p['qualitaet']:7} accel {va!s:>8}  gps {vg:8.0f} (r {r:.3f}, naechster Gipfel >=3 s r {r3:.3f})  diff {d if d is None else round(d)!s:>7}{flag}")
db.rollback(); db.close()
