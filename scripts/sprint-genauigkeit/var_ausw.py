import pickle, sys, numpy as np
R = pickle.load(open("varianten.pkl", "rb"))
VAR = list(R[0]["v"])
rng = np.random.default_rng(1)
def paar(r, name, kz):
    a, b = r["v"][name][0], r["v"][name][1]
    return abs(a[kz] - b[kz]) * 3.6 if kz in a and kz in b else None
def brett(r, name, kz):
    if "board" not in r["pl"] or r["pl"] == ("board", "board"): return None
    ib = r["pl"].index("board"); x = r["v"][name]
    return (x[1-ib][kz] - x[ib][kz]) * 3.6 if kz in x[0] and kz in x[1] else None
def tabelle(names):
    print(f"{'Variante':14s} | 100m |A-B| n  dV6 [KI]            | 60s |A-B| n  dV6 [KI]           | Brett100 |f| bias | Brett60 |f| bias")
    for nm in names:
        z = [nm[:14].ljust(14)]
        for kz in ("sprint_100m", "sprint_60s"):
            pa = [(r["g"], paar(r, "V6", kz), paar(r, nm, kz)) for r in R]
            pa = [p for p in pa if p[1] is not None and p[2] is not None]
            gs = sorted({p[0] for p in pa}); byg = {g: [p for p in pa if p[0] == g] for g in gs}
            dm = []
            for _ in range(1000):
                s = np.array([p[1:] for g in rng.choice(gs, len(gs)) for p in byg[g]]); dm.append(s[:, 0].mean() - s[:, 1].mean())
            A = np.array([p[1:] for p in pa])
            z.append(f"{A[:,1].mean():.3f} {len(A):3d} {np.mean(dm):+.3f} [{np.percentile(dm,2.5):+.2f},{np.percentile(dm,97.5):+.2f}]")
        for kz in ("sprint_100m", "sprint_60s"):
            e = np.array([x for x in (brett(r, nm, kz) for r in R) if x is not None])
            z.append(f"{np.abs(e).mean():.2f} {e.mean():+.2f} n{len(e)}")
        print(" | ".join(z))
mode = sys.argv[1]
if mode == "raster":
    print("Raster W x Glaettung (100 m |A-B| / 60 s |A-B| / Brett 100 |f|):")
    for pw in (1.5, 2.5, 3.5, 4.5):
        row = []
        for w in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0):
            nm = f"W{w}_p{pw}"
            a = [x for x in (paar(r, nm, "sprint_100m") for r in R) if x is not None]
            b = [x for x in (paar(r, nm, "sprint_60s") for r in R) if x is not None]
            c = [abs(x) for x in (brett(r, nm, "sprint_100m") for r in R) if x is not None]
            row.append(f"{np.mean(a):.2f}/{np.mean(b):.2f}/{np.mean(c):.2f}")
        print(f" ±{pw}s  " + "  ".join(f"W{w}:{x}" for w, x in zip((0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0), row)))
    # Kreuzvalidierung: je Fahrer weglassen, Parameter auf dem Rest waehlen
    grid = [n for n in VAR if n.startswith("W")]
    users = sorted({r["user"] for r in R})
    def score(rows, nm):
        a = [x for x in (paar(r, nm, "sprint_100m") for r in rows) if x is not None]
        b = [x for x in (paar(r, nm, "sprint_60s") for r in rows) if x is not None]
        return np.mean(a) + np.mean(b) if a and b else np.mean(a)
    cv, fix, v6, wahl = [], [], [], []
    for u in users:
        tr = [r for r in R if r["user"] != u]; te = [r for r in R if r["user"] == u]
        best = min(grid, key=lambda n: score(tr, n)); wahl.append(best)
        for kz in ("sprint_100m",):
            for nm, L in ((best, cv), ("W0.5_p2.5", fix), ("V6", v6)):
                L += [x for x in (paar(r, nm, kz) for r in te) if x is not None]
    print(f"\nKreuzvalidierung je Fahrer (100 m, {len(users)} Fahrer): V6 {np.mean(v6):.3f}  fest W0.5/±2.5 {np.mean(fix):.3f}  auf Rest gewaehlt {np.mean(cv):.3f}")
    from collections import Counter; print("  gewaehlt:", Counter(wahl).most_common())
else:
    tabelle(sys.argv[2].split(","))
