import os, pickle, sys, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app.analysis import sprint as SP
import v7; v7.install()
d = pickle.load(open(sys.argv[1] + "/daten.pkl", "rb"))
print("Gruppen", len(d), "Laeufe", sum(len(g["laeufe"]) for g in d))
MX = 32 / 3.6
res = []
for gi, g in enumerate(d):
    for l in g["laeufe"]:
        t0 = l["t0"]
        def gps(S):
            return [[(r[0] - t0) * 1000, r[1], r[2], (None if not np.isfinite(r[3]) else float(r[3]))] for r in S]
        ga, gb = gps(l["A"]), gps(l["B"])
        z = {"g": gi, "geraete": (g["ga"], g["gb"]), "pl": (g["pa"], g["pb"])}
        for W in (None, 0.5):
            v7.CFG["W"] = W
            a = SP.lauf_sprints(ga, 0, (l["t1"] - t0) * 1000, max_mps=MX) or {}
            b = SP.lauf_sprints(gb, 0, (l["t1"] - t0) * 1000, max_mps=MX) or {}
            z[W] = (a, b)
        res.append(z)
rng = np.random.default_rng(1)
def auswerten(rows, titel):
    print(f"\n== {titel}: {len(rows)} Laeufe, {len({r['g'] for r in rows})} Paare")
    for kz in ("sprint_100m", "sprint_60s"):
        pa = [(r["g"], abs(r[None][0][kz] - r[None][1][kz]) * 3.6, abs(r[0.5][0][kz] - r[0.5][1][kz]) * 3.6,
               ((r[0.5][0][kz] + r[0.5][1][kz]) - (r[None][0][kz] + r[None][1][kz])) / 2 * 3.6)
              for r in rows if all(kz in x for x in r[None] + r[0.5])]
        if not pa: continue
        A = np.array([p[1:] for p in pa])
        gs = sorted({p[0] for p in pa}); byg = {x: [p for p in pa if p[0] == x] for x in gs}
        dm = []
        for _ in range(2000):
            smp = np.array([p[1:] for x in rng.choice(gs, len(gs)) for p in byg[x]])
            dm.append(smp[:, 0].mean() - smp[:, 1].mean())
        print(f"  {kz:12s} n={len(pa)}  |A-B| mittel V6 {A[:,0].mean():.2f} V7 {A[:,1].mean():.2f}  Median {np.median(A[:,0]):.2f}->{np.median(A[:,1]):.2f}  p90 {np.percentile(A[:,0],90):.2f}->{np.percentile(A[:,1],90):.2f}  "
              f"Verbesserung {np.mean(dm):+.2f} KI [{np.percentile(dm,2.5):+.2f},{np.percentile(dm,97.5):+.2f}]  Niveau V7-V6 {np.median(A[:,2]):+.2f}")
uu = [r for r in res if "board" not in r["pl"]]
auswerten(res, "alle")
auswerten(uu, "Uhr-Uhr")
auswerten([r for r in res if "board" in r["pl"]], "mit Handy am Brett")
auswerten([r for r in res if any(x.startswith("apple") for x in r["geraete"])], "mit Apple Watch")
# Brett als Referenz: Fehler der Nicht-Brett-Seite
print("\n== gegen Brett (Uhr - Brett)")
for kz in ("sprint_100m", "sprint_60s"):
    e6, e7 = [], []
    for r in res:
        if "board" not in r["pl"]: continue
        ib = r["pl"].index("board"); iu = 1 - ib
        if all(kz in x for x in r[None] + r[0.5]):
            e6.append((r[None][iu][kz] - r[None][ib][kz]) * 3.6); e7.append((r[0.5][iu][kz] - r[0.5][ib][kz]) * 3.6)
    e6, e7 = np.array(e6), np.array(e7)
    print(f"  {kz}: n={len(e6)} |Fehler| mittel V6 {np.abs(e6).mean():.2f} V7 {np.abs(e7).mean():.2f}; Bias V6 {e6.mean():+.2f} V7 {e7.mean():+.2f}")
print()
for g in d: print(g["ga"], "|", g["gb"], g["pa"], g["pb"], len(g["laeufe"]))
auswerten([r for r in uu if not any(x.startswith("apple") for x in r["geraete"])], "Uhr-Uhr ohne Apple")
# V7a: Apple bleibt V6
for r in res:
    r["a"] = tuple(r[None][i] if r["geraete"][i].startswith("apple") else r[0.5][i] for i in (0, 1))
for r in res: r[0.5] = r["a"]
auswerten(res, "alle, V7a (Apple bleibt V6)")
auswerten(uu, "Uhr-Uhr, V7a")
