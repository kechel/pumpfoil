"""Fehler je Geraeteklasse aus dem Paar-Netz (verallgemeinerter Three-Cornered Hat):
E[(vA-vB)^2] = s_A^2 + s_B^2 je gleichem Fenster; kleinste Quadrate ueber alle Paar-Klassen, Cluster-Bootstrap."""
import pickle, sys, collections
import numpy as np
from scipy.optimize import nnls
sys.path.insert(0, sys.argv[1])
import versuch as V
gruppen = pickle.load(open(sys.argv[2], "rb"))
meth = sys.argv[3].split(",")

def klasse(geraet, platz):
    pl = geraet.split("|")[0]
    if platz == "board": return "Handy am Brett"
    if platz == "phone": return "Handy (Tasche)"
    if pl in ("garmin", "garm", "fit-", "imp-"): return "Garmin-Uhr"
    if pl == "apple": return "Apple Watch"
    if pl == "wear": return "Wear-Uhr"
    return "Handy (Tasche)"

daten = collections.defaultdict(list)   # (m, kz) -> [(gruppe, kA, kB, d2)]
for G in gruppen:
    kA, kB = klasse(G["ga"], G["pa"]), klasse(G["gb"], G["pb"])
    for L in G["laeufe"]:
        A, B = L["A"], L["B"]
        if len(A) < 10 or len(B) < 10: continue
        lat0, lon0 = A[0, 1], A[0, 2]
        ra, rb = V.raster(A, L["t0"], L["t1"], lat0, lon0), V.raster(B, L["t0"], L["t1"], lat0, lon0)
        g = ra[0]
        if g.size < 15 or g.size != rb[0].size: continue
        if np.isnan(ra[3]).mean() > 0.2 or np.isnan(rb[3]).mean() > 0.2: continue
        lk = ra[4] | rb[4]
        cref = V.kum(0.5 * (V.m_dop(ra) + V.m_dop(rb)))
        fl = {"100m": [], "60s": []}
        i = 0
        while i < g.size - 3:
            j = np.searchsorted(cref, cref[i] + 100)
            if j >= g.size: break
            if not lk[i:j + 1].any(): fl["100m"].append((g[i], g[j]))
            i = j
        for i in range(0, g.size - 60, 60):
            if not lk[i:i + 61].any(): fl["60s"].append((g[i], g[i + 60]))
        for m in meth:
            fn, kw = V.METHODEN[m]
            ca, cb = V.kum(fn(ra, **kw)), V.kum(fn(rb, **kw))
            for kz, f in fl.items():
                for a, b in f:
                    d = (V.tempo_im(g, ca, a, b) - V.tempo_im(g, cb, a, b)) * 3.6
                    daten[(m, kz)].append((G["a"], kA, kB, d * d))

klassen = sorted({k for v in daten.values() for _, a, b, _ in v for k in (a, b)})
print("Paar-Typen:", collections.Counter(tuple(sorted((a, b))) for _, a, b, _ in daten[(meth[0], "100m")]))
rng = np.random.default_rng(3)

def loesen(rows):
    typen = collections.defaultdict(list)
    for _, a, b, d2 in rows: typen[tuple(sorted((a, b)))].append(d2)
    M, y, w = [], [], []
    for (a, b), v in typen.items():
        z = np.zeros(len(klassen)); z[klassen.index(a)] += 1; z[klassen.index(b)] += 1
        M.append(z * np.sqrt(len(v))); y.append(np.mean(v) * np.sqrt(len(v)))
    s2, _ = nnls(np.array(M), np.array(y))
    return np.sqrt(s2)

for kz in ("100m", "60s"):
    print(f"\n== {kz}: geschaetzter Fehler (1 Sigma, km/h) je Klasse, 90%-KI aus Cluster-Bootstrap")
    print("  " + " " * 10 + "".join(f"{k:>24s}" for k in klassen))
    for m in meth:
        rows = daten[(m, kz)]
        gs = sorted({r[0] for r in rows}); byg = {g_: [r for r in rows if r[0] == g_] for g_ in gs}
        est = loesen(rows)
        bs = np.array([loesen([r for g_ in rng.choice(gs, len(gs)) for r in byg[g_]]) for _ in range(500)])
        print(f"  {m:10s}" + "".join(f"{est[i]:8.2f} [{np.percentile(bs[:,i],5):.2f},{np.percentile(bs[:,i],95):.2f}] " for i in range(len(klassen))))
