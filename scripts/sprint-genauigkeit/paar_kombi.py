import pickle, sys, os, numpy as np
from collections import defaultdict
sys.path.insert(0, sys.argv[1])
from app.analysis import sprint as SP
import v7; v7.install()
d = pickle.load(open(sys.argv[1] + "/daten.pkl", "rb"))
def kl(g,p):
    pl=g.split('|')[0]
    if p=='board': return 'Brett'
    if p=='phone': return 'HandyTasche'
    if pl in('garmin','garm','fit-'): return 'Garmin'
    return {'apple':'Apple','wear':'Wear'}.get(pl,'Handy?')
acc=defaultdict(lambda: defaultdict(list))
for g in d:
    k=' + '.join(sorted([kl(g['ga'],g['pa']),kl(g['gb'],g['pb'])]))
    for l in g['laeufe']:
        t0=l['t0']; G=lambda S:[[(r[0]-t0)*1000,r[1],r[2],(None if not np.isfinite(r[3]) else float(r[3]))] for r in S]
        ga,gb=G(l['A']),G(l['B']); e=(l['t1']-t0)*1000
        out={}
        for W in (None,0.5):
            v7.CFG['W']=W; out[W]=(SP.lauf_sprints(ga,0,e,max_mps=32/3.6) or {}, SP.lauf_sprints(gb,0,e,max_mps=32/3.6) or {})
        for kz in ('sprint_100m','sprint_60s'):
            if all(kz in x for x in out[None]+out[0.5]):
                acc[k][kz].append((abs(out[None][0][kz]-out[None][1][kz])*3.6, abs(out[0.5][0][kz]-out[0.5][1][kz])*3.6))
for k,v in acc.items():
    for kz,x in v.items():
        x=np.array(x); print(f"{k:22s} {kz:12s} n={len(x):3d}  V6 {x[:,0].mean():.2f}  V7 {x[:,1].mean():.2f}")
