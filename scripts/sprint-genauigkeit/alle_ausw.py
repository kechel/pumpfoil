import json, sys, numpy as np
from collections import defaultdict
R = [json.loads(l) for l in open(sys.argv[1])]
err = [r for r in R if "err" in r]
R = [r for r in R if "err" not in r]
print(len(R), "Sessions,", len(err), "Fehler", err[:3])
def pk(p):
    if p in ("garmin", "garm", "fit-"): return "Garmin"
    if p == "apple": return "Apple Watch"
    if p == "wear": return "Wear OS"
    if p in ("suun",): return "Suunto"
    if p in ("zepp", "huawei", "coro", "pola"): return {"zepp": "Amazfit", "huawei": "Huawei", "coro": "COROS", "pola": "Polar"}[p]
    if p in ("ios",) or len(p) == 4 and all(c in "0123456789abcdef" for c in p): return "Handy"
    return "Import/sonst" if p in ("imp-", "merg") else p
# Abgleich gespeichert vs V6 frisch
for kz in ("sprint_100m", "sprint_60s"):
    ab = [r for r in R if abs(r["alt"].get(kz, 0) - r["v6"].get(kz, 0)) > 0.003]
    print(kz, "gespeichert != V6 frisch:", len(ab), [(r["id"], r["alt"].get(kz), r["v6"].get(kz)) for r in ab[:5]])
for var in ("v7", "v7a"):
    print(f"\n######## {var}")
    for kz in ("sprint_100m", "sprint_60s", "sprint_200m"):
        per = defaultdict(list); weg = defaultdict(int); neu = defaultdict(int)
        for r in R:
            p = pk(r["plat"]); n = r["v6"] if (var == "v7a" and p == "Apple Watch") else r["v7"]
            a = r["v6"].get(kz); b = n.get(kz)
            if a and not b: weg[p] += 1
            if b and not a: neu[p] += 1
            if a and b: per[p].append((b - a) * 3.6); per["ALLE"].append((b - a) * 3.6)
        print(f"== {kz}: Wert V7-V6 (km/h)   n  Median  p10  p90  |>0,5| Anteil  weg  neu")
        for p in sorted(per, key=lambda p: -len(per[p])):
            x = np.array(per[p])
            print(f"   {p:13s} {len(x):5d} {np.median(x):+.2f} {np.percentile(x,10):+.2f} {np.percentile(x,90):+.2f}  {np.mean(np.abs(x)>0.5)*100:4.0f}%  {weg[p]} {neu[p]}")
