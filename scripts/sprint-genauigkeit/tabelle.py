import pickle, sys
import numpy as np
erg = pickle.load(open(sys.argv[1], "rb"))
filt = sys.argv[2] if len(sys.argv) > 2 else ""
meth = []
for z in erg:
    for m in z["m"]:
        if m not in meth: meth.append(m)


def sel(z):
    if filt == "uhr-uhr": return z["brett"] == (None, None) and not any(g.startswith(("fit-", "imp-")) for g in z["geraete"])
    if filt == "brett": return "board" in z["brett"]
    return True


rows = [z for z in erg if sel(z)]
print(f"{len(rows)} Paar-Laeufe ({filt or 'alle'})")
for kz in ("100m", "60s"):
    print(f"\n== {kz}  (km/h)        Bestwert |A-B|: Median  p90  | gleiches Fenster |A-B|: Median p90 | Niveau vs dop  n")
    ref = {}
    for z in rows:
        r = z["m"].get("dop", {}).get(kz)
        if r: ref[id(z)] = (r[0] + r[1]) / 2
    for m in meth:
        b, w, lv = [], [], []
        for z in rows:
            r = z["m"].get(m, {}).get(kz)
            if not r: continue
            b.append(abs(r[0] - r[1]))
            if np.isfinite(r[2]) and np.isfinite(r[3]): w.append(abs(r[2] - r[3]))
            if id(z) in ref: lv.append((r[0] + r[1]) / 2 - ref[id(z)])
        if not b: continue
        b, w = np.array(b), np.array(w)
        print(f"  {m:10s} {np.median(b):6.2f} {np.percentile(b,90):5.2f}   {np.median(w):6.2f} {np.percentile(w,90):5.2f}   {np.median(lv):+6.2f}  {len(b)}")

# Bootstrap: Differenz Median/p90 gegen dop, gepaart nach Lauf, Cluster = Paar-Gruppe
if len(sys.argv) > 3:
    rng = np.random.default_rng(1)
    for kz in ("100m", "60s"):
        print(f"\nBootstrap {kz} (95%-KI der Verbesserung gegen dop, + = besser), Cluster je Aufnahme-Paar")
        for m in sys.argv[3].split(","):
            pa = [(z["g"], abs(z["m"]["dop"][kz][0]-z["m"]["dop"][kz][1]), abs(z["m"][m][kz][0]-z["m"][m][kz][1]))
                  for z in rows if kz in z["m"].get("dop", {}) and kz in z["m"].get(m, {})]
            gs = sorted({p[0] for p in pa})
            byg = {g: [p for p in pa if p[0] == g] for g in gs}
            dm, d9 = [], []
            for _ in range(2000):
                smp = [p for g in rng.choice(gs, len(gs)) for p in byg[g]]
                a = np.array([p[1] for p in smp]); b = np.array([p[2] for p in smp])
                dm.append(np.median(a) - np.median(b)); d9.append(np.percentile(a, 90) - np.percentile(b, 90))
            print(f"  {m:10s} Median {np.median(dm):+.2f} [{np.percentile(dm,2.5):+.2f},{np.percentile(dm,97.5):+.2f}]  p90 {np.median(d9):+.2f} [{np.percentile(d9,2.5):+.2f},{np.percentile(d9,97.5):+.2f}]")
