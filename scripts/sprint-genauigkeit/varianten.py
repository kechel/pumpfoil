"""Varianten in Produktivform auf den Paar-Daten (rein lesend). Ausgabe: pickle mit Werten je Lauf/Variante."""
import pickle, sys, numpy as np
sys.path.insert(0, sys.argv[1])
from app.analysis import sprint as SP
import v7; v7.install()
d = pickle.load(open(sys.argv[1] + "/daten.pkl", "rb"))
BASIS = {"W": 0.5, "PW_S": 2.5, "ACC": None, "NACH_LUECKE_S": 0.0, "W_ADAPT": False}
VAR = {"V6": {"W": None}}
for w in (0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0):
    for pw in (1.5, 2.5, 3.5, 4.5):
        VAR[f"W{w}_p{pw}"] = {"W": w, "PW_S": pw}
for acc in (2.0, 3.0, 5.0):
    VAR[f"V6_acc{acc}"] = {"W": 1.0, "ACC": acc}; VAR[f"V7_acc{acc}"] = {"ACC": acc}
for nl in (2.0, 4.0):
    VAR[f"V6_nl{nl}"] = {"W": 1.0, "NACH_LUECKE_S": nl}; VAR[f"V7_nl{nl}"] = {"NACH_LUECKE_S": nl}
VAR["V7_adapt"] = {"W_ADAPT": True}
res = []
for gi, g in enumerate(d):
    for l in g["laeufe"]:
        t0 = l["t0"]; G = lambda S: [[(r[0]-t0)*1000, r[1], r[2], (None if not np.isfinite(r[3]) else float(r[3]))] for r in S]
        ga, gb, e = G(l["A"]), G(l["B"]), (l["t1"]-t0)*1000
        z = {"g": gi, "user": g["user"], "geraete": (g["ga"], g["gb"]), "pl": (g["pa"], g["pb"]), "v": {}}
        for name, cfg in VAR.items():
            v7.CFG.update(BASIS); v7.CFG.update(cfg)
            fa, fb = {}, {}
            z["v"][name] = (SP.lauf_sprints(ga, 0, e, fa, max_mps=32/3.6) or {}, SP.lauf_sprints(gb, 0, e, fb, max_mps=32/3.6) or {}, fa, fb)
        res.append(z)
pickle.dump(res, open(sys.argv[1] + "/varianten.pkl", "wb"))
print(len(res), "Laeufe", len(VAR), "Varianten")
