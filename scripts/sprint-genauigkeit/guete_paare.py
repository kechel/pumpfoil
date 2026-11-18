import pickle, sys, numpy as np
sys.path.insert(0, sys.argv[1])
from app.analysis import sprint as SP
from guete import guete
from scipy.stats import spearmanr
d = pickle.load(open(sys.argv[1] + "/daten.pkl", "rb"))
rows = []
for g in d:
    for l in g["laeufe"]:
        t0 = l["t0"]; G = lambda S: [[(r[0]-t0)*1000, r[1], r[2], (None if not np.isfinite(r[3]) else float(r[3]))] for r in S]
        e = (l["t1"]-t0)*1000
        a = SP.lauf_sprints(G(l["A"]), 0, e, max_mps=32/3.6) or {}; b = SP.lauf_sprints(G(l["B"]), 0, e, max_mps=32/3.6) or {}
        q = []
        for S in (l["A"], l["B"]):
            m = (S[:, 0] >= l["t0"]) & (S[:, 0] <= l["t1"]); S = S[m]
            q.append(guete(S[:, 0], S[:, 1], S[:, 2], S[:, 3]))
        if None in q: continue
        for kz in ("sprint_100m", "sprint_60s"):
            if kz in a and kz in b:
                rows.append((kz, abs(a[kz]-b[kz])*3.6, q, g["ga"], g["gb"], g["pa"], g["pb"]))
for kz in ("sprint_100m", "sprint_60s"):
    R = [r for r in rows if r[0] == kz]
    err = np.array([r[1] for r in R])
    print(f"\n{kz}: n={len(R)}  Spearman |A-B| gegen Guete (Summe beider Geraete / schlechteres Geraet):")
    for key in ("zittern_m", "tempo_unruhe", "abw_10s"):
        s = np.array([r[2][0][key] + r[2][1][key] for r in R]); mx = np.array([max(r[2][0][key], r[2][1][key]) for r in R])
        ok = np.isfinite(s)
        print(f"  {key:13s} rho={spearmanr(s[ok], err[ok])[0]:+.2f} (max {spearmanr(mx[ok], err[ok])[0]:+.2f})  Median je Lauf {np.nanmedian([r[2][0][key] for r in R]):.3f}")
    # Terzile nach abw_10s-Summe
    s = np.array([r[2][0]["abw_10s"] + r[2][1]["abw_10s"] for r in R]); ok = np.isfinite(s)
    q1, q2 = np.percentile(s[ok], [33, 67])
    for nm, m in (("gut", s <= q1), ("mittel", (s > q1) & (s <= q2)), ("schlecht", s > q2)):
        print(f"   Drittel {nm:8s}: |A-B| mittel {err[m].mean():.2f}  p90 {np.percentile(err[m],90):.2f}  n={m.sum()}")
# Geraeteklassen-Mittel
print("\nGuete je Geraet (Median ueber Laeufe):")
from collections import defaultdict
dd = defaultdict(list)
for r in rows:
    if r[0] != "sprint_100m": continue
    for q, gname, pl in ((r[2][0], r[3], r[5]), (r[2][1], r[4], r[6])):
        dd[("Brett " if pl == "board" else "") + gname].append((q["zittern_m"], q["tempo_unruhe"], q["abw_10s"]))
for k, v in sorted(dd.items(), key=lambda x: -len(x[1])):
    v = np.array(v); print(f"  {k:45s} n={len(v):3d} zittern {np.nanmedian(v[:,0]):.2f} m  unruhe {np.nanmedian(v[:,1]):.3f} m/s  abw10 {np.nanmedian(v[:,2])*100:.1f} %")
# Fehlermodell: |A-B| ~ sqrt(2/pi)*sqrt(sA^2+sB^2), s = a + c*abw*v  (v = Sprintwert km/h)
from scipy.optimize import minimize
for kz in ("sprint_100m", "sprint_60s"):
    R = [r for r in rows if r[0] == kz and np.isfinite(r[2][0]["abw_10s"]) and np.isfinite(r[2][1]["abw_10s"])]
    err = np.array([r[1] for r in R]); qa = np.array([r[2][0]["abw_10s"] for r in R]); qb = np.array([r[2][1]["abw_10s"] for r in R])
    def nll(p):
        a, c = np.abs(p); s = np.sqrt((a + c*qa)**2 + (a + c*qb)**2)  # |A-B| halbnormal mit sigma s
        return np.sum(np.log(s) + err**2 / (2*s**2))
    a, c = np.abs(minimize(nll, [0.2, 5], method="Nelder-Mead").x)
    s0 = np.sqrt(2) * np.sqrt(np.mean(err**2) / 2)
    print(f"{kz}: sigma je Geraet = {a:.2f} + {c:.1f} * abw  (km/h)  -> abw 2 %: {a+c*.02:.2f}, 5 %: {a+c*.05:.2f}, 10 %: {a+c*.10:.2f}")
