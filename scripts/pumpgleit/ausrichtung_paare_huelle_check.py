# Rein lesend: Einhuellende der Uhr-Armbewegung gegen Brett-Zustand "pumpt" (taktfrei), brett_t = uhr_t + vers.
import sys, json, pathlib, logging
import numpy as np
R = pathlib.Path("/home/jan/garmin-connect-iq/scripts")
sys.path.insert(0, str(R / "pumpgleit")); sys.path.insert(0, str(R / "v3"))
import gemeinsam as G
logging.disable(logging.WARNING)
exec(open(pathlib.Path(__file__).with_name("ausrichtung_paare_lauf_check.py")).read().split("def starts")[0].split("db = G.db_lesend()")[1])
db = G.db_lesend()
paare = {(p["brett"], p["uhr"]): p for p in G.paare_beste()}
paare[(16729, 16719)] = {"versatz_ms": -23189, "qualitaet": "schwach"}
def glatt(x, n):
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")
for k, vg in GPSV.items():
    p = paare[k]; va = float(p["versatz_ms"])
    BW = G.brett_wahrheit(db, k[0]); U = G.uhr_daten(db, k[1], mit_gyro=False)
    if not BW.get("ok") or U is None:
        print(f"#{k[0]}/#{k[1]}: keine Daten"); continue
    fs = U["fs"]
    mag = np.linalg.norm(U["acc"], axis=1)
    hp = mag - glatt(mag, int(2 * fs))
    env = np.sqrt(glatt(hp ** 2, int(1.5 * fs)))            # 1,5-s-RMS der Armbewegung
    tb, lab = BW["t"], BW["lab"]
    pump = (lab == 2).astype(float); gilt = lab >= 0
    pump = glatt(pump, int(1.5 * 25))
    tu = U["t"]
    res = []
    for v in np.arange(min(va, vg) - 6000, max(va, vg) + 6001, 250):
        j = np.searchsorted(tb, tu + v)
        ok = (j > 0) & (j < tb.size)
        j = np.clip(j, 0, tb.size - 1)
        m = ok & gilt[j] & U["echt"]
        if m.sum() < 25 * 30: continue
        res.append((np.corrcoef(env[m], pump[j][m])[0, 1], v))
    if not res:
        print(f"#{k[0]}/#{k[1]}: keine Ueberlappung"); continue
    r, vb = max(res)
    at = lambda x: min(res, key=lambda q: abs(q[1] - x))[0]
    print(f"#{k[0]}/#{k[1]} {p['qualitaet']:7} Gipfel {vb:9.0f} (r {r:.3f}) | Accel {va:9.0f} r {at(va):.3f} (Abst {(vb-va)/1000:+5.1f}s) | GPS {vg:9.0f} r {at(vg):.3f} (Abst {(vb-vg)/1000:+5.1f}s)")
db.rollback(); db.close()
