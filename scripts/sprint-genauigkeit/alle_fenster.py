"""Alle Fenster je gemeinsamem Lauf (nicht nur das beste): je Lauf mittlerer |vA-vB| ueber nicht ueberlappende
Referenzfenster; plus Niveau je Plattform (Methode minus dop, je Geraet)."""
import pickle, sys, collections
import numpy as np
sys.path.insert(0, sys.argv[1])
import versuch as V
gruppen = pickle.load(open(sys.argv[2], "rb"))
meth = sys.argv[3].split(",")
proLauf = collections.defaultdict(list)   # m -> [(gruppe, kz, mean|d|)]
niveau = collections.defaultdict(list)    # (m, plattform, kz) -> [delta]
typ = {}
for G in gruppen:
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
        fenster = {"100m": [], "60s": []}
        i = 0
        while i < g.size - 3:   # 100-m-Fenster hintereinander
            j = np.searchsorted(cref, cref[i] + 100)
            if j >= g.size: break
            if not lk[i:j + 1].any(): fenster["100m"].append((g[i], g[j]))
            i = j
        for i in range(0, g.size - 60, 60):
            if not lk[i:i + 61].any(): fenster["60s"].append((g[i], g[i + 60]))
        cum = {}
        for m in meth:
            fn, kw = V.METHODEN[m]
            cum[m] = (V.kum(fn(ra, **kw)), V.kum(fn(rb, **kw)))
        for kz, fl in fenster.items():
            if not fl: continue
            for m in meth:
                ca, cb = cum[m]
                d = [abs(V.tempo_im(g, ca, a, b) - V.tempo_im(g, cb, a, b)) * 3.6 for a, b in fl]
                proLauf[m].append((G["a"], kz, float(np.mean(d)), len(fl)))
                if m != "dop":
                    for c, cd, ga in ((ca, cum["dop"][0], G["ga"]), (cb, cum["dop"][1], G["gb"])):
                        pl = ga.split("|")[0]
                        pl = {"garm": "garmin", "fit-": "import", "imp-": "import"}.get(pl, pl)
                        pl = pl if pl in ("garmin", "apple", "wear", "ios", "import") else "android-handy"
                        niveau[(m, pl, kz)] += [(V.tempo_im(g, c, a, b) - V.tempo_im(g, cd, a, b)) * 3.6 for a, b in fl]
rng = np.random.default_rng(2)
for kz in ("100m", "60s"):
    base = {(x[0], i): x[2] for i, x in enumerate(proLauf["dop"]) if x[1] == kz}
    print(f"\n== {kz}: mittlerer |A-B| je Lauf ueber alle Fenster (km/h), Verbesserung gegen dop mit Cluster-Bootstrap")
    for m in meth:
        rows = [(x[0], b[2], x[2]) for x, b in zip(proLauf[m], proLauf["dop"]) if x[1] == kz]
        gs = sorted({r[0] for r in rows}); byg = {g_: [r for r in rows if r[0] == g_] for g_ in gs}
        bs = []
        for _ in range(2000):
            smp = [r for g_ in rng.choice(gs, len(gs)) for r in byg[g_]]
            bs.append(np.mean([r[1] for r in smp]) - np.mean([r[2] for r in smp]))
        print(f"  {m:10s} Mittel {np.mean([r[2] for r in rows]):.3f}  Median {np.median([r[2] for r in rows]):.3f}  "
              f"besser um {np.mean(bs):+.3f} [{np.percentile(bs,2.5):+.3f},{np.percentile(bs,97.5):+.3f}]  Laeufe {len(rows)}  Fenster {sum(x[3] for x in proLauf[m] if x[1]==kz)}")
print("\nNiveau je Plattform (Methode minus dop, km/h, Median ueber Fenster):")
for (m, pl, kz), d in sorted(niveau.items()):
    if len(d) >= 15: print(f"  {m:10s} {kz:4s} {pl:14s} {np.median(d):+.2f}  (n={len(d)})")
