import sys, json, pathlib, logging
import numpy as np
R = pathlib.Path("/home/jan/garmin-connect-iq/scripts")
sys.path.insert(0, str(R / "pumpgleit")); sys.path.insert(0, str(R / "v3"))
import gemeinsam as G
logging.disable(logging.WARNING)
from app import models
db = G.db_lesend()
out = {}
for sid in (16729, 16719):
    s = db.get(models.Session, sid)
    U = G.uhr_daten(db, sid)
    g = U["gps"]
    t0 = s.started_at.timestamp() * 1000
    out[sid] = (t0 + g[:, 0], g[:, 3], s.trim_start_ms or 0)
    print(sid, s.started_at, s.device_model, "gps n", len(g), "trim", s.trim_start_ms, "dt median", np.median(np.diff(g[:, 0])))
(ab, vb, trb), (au, vu, tru) = out[16729], out[16719]
grid = np.arange(max(ab[0], au[0]), min(ab[-1], au[-1]), 250.0)
best = []
for off in np.arange(-60000, 60001, 250):
    b = np.interp(grid, ab, vb); u = np.interp(grid + off, au, vu, left=np.nan, right=np.nan)
    m = ~np.isnan(u)
    if m.sum() < 1000: continue
    best.append((np.corrcoef(b[m], u[m])[0, 1], off))
best.sort(reverse=True)
print("beste GPS-Versaetze (r, off_ms: uhr_abs = brett_abs + off):", [(round(r, 3), o) for r, o in best[:5]])
# Accel-Versatz -23189 ist in Session-ms (brett_t + vers = uhr_t?) -> in Absolutzeit umrechnen
print("Startdifferenz uhr-brett ms:", au[0] - ab[0] if False else None)
db.rollback(); db.close()
