"""Niveau gegen Handy am Brett: je Fenster (Uhr-Methode) minus (Brett-Referenz), Median + Cluster-Bootstrap.
Brett-Referenzen: dop (Doppler des Handys) und pos_ma5 (seine Positionen)."""
import pickle, sys, collections
import numpy as np
sys.path.insert(0, sys.argv[1])
import versuch as V
gruppen = pickle.load(open(sys.argv[2], "rb"))
meth = sys.argv[3].split(",")
rows = collections.defaultdict(list)
for G in gruppen:
    if (G["pa"] == "board") == (G["pb"] == "board"): continue
    for L in G["laeufe"]:
        A, B = L["A"], L["B"]
        if len(A) < 10 or len(B) < 10: continue
        uhr, brett = (A, B) if G["pb"] == "board" else (B, A)
        lat0, lon0 = A[0, 1], A[0, 2]
        ru, rb = V.raster(uhr, L["t0"], L["t1"], lat0, lon0), V.raster(brett, L["t0"], L["t1"], lat0, lon0)
        g = ru[0]
        if g.size < 15 or g.size != rb[0].size: continue
        if np.isnan(ru[3]).mean() > 0.2 or np.isnan(rb[3]).mean() > 0.2: continue
        lk = ru[4] | rb[4]
        cref = V.kum(V.m_dop(rb))
        fl = {"100m": [], "60s": []}
        i = 0
        while i < g.size - 3:
            j = np.searchsorted(cref, cref[i] + 100)
            if j >= g.size: break
            if not lk[i:j + 1].any(): fl["100m"].append((g[i], g[j]))
            i = j
        for i in range(0, g.size - 60, 60):
            if not lk[i:i + 61].any(): fl["60s"].append((g[i], g[i + 60]))
        bref = {"b_dop": V.kum(V.m_dop(rb)), "b_pos5": V.kum(V.m_pos(rb, w=5)), "b_mix50p5": V.kum(V.m_mix(rb, w=0.5, pw=5))}
        for m in meth:
            fn, kw = V.METHODEN[m]
            cu = V.kum(fn(ru, **kw))
            for kz, f in fl.items():
                for a, b in f:
                    vu = V.tempo_im(g, cu, a, b) * 3.6
                    for rn, cb in bref.items():
                        vb = V.tempo_im(g, cb, a, b) * 3.6
                        rows[(m, kz, rn)].append((G["a"], vu - vb, abs(vu - vb)))
rng = np.random.default_rng(4)
for kz in ("100m", "60s"):
    for rn in ("b_dop", "b_pos5", "b_mix50p5"):
        print(f"\n== {kz}, Referenz Brett-{rn[2:]}: Uhr minus Brett (km/h): Mittel [90%-KI], mittlerer Betrag")
        for m in meth:
            r = rows[(m, kz, rn)]
            gs = sorted({x[0] for x in r}); byg = {g_: [x for x in r if x[0] == g_] for g_ in gs}
            bs = [np.mean([x[1] for g_ in rng.choice(gs, len(gs)) for x in byg[g_]]) for _ in range(1000)]
            print(f"  {m:10s} {np.mean([x[1] for x in r]):+.2f} [{np.percentile(bs,5):+.2f},{np.percentile(bs,95):+.2f}]  |d| {np.mean([x[2] for x in r]):.2f}  n={len(r)} Gruppen {len(gs)}")
