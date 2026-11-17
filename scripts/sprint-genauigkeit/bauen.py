"""Datensatz fuer Sprint-Genauigkeit (rein lesend): gleichzeitige Aufnahmen desselben Fahrers, zeitlich abgeglichen.

Ausgabe: daten.pkl = Liste von Gruppen {user, sessions:[{id, geraet, placement}], laeufe:[{t0,t1, spuren:{sid: arrays}}]}
Arrays je Spur (Wanduhr-Sekunden, auf die erste Session abgeglichen): t, lat, lon, v (Doppler, nan=fehlt), hacc.
"""
import json, pickle, sys
import numpy as np
sys.path.insert(0, "/home/jan/garmin-connect-iq/server")
from sqlalchemy import text
from app.db import SessionLocal
from app import models, storage

db = SessionLocal()
pm = json.load(open("/home/jan/garmin-connect-iq/watch/bin/partmap.json"))
rows = db.execute(text("""select a.id, b.id from sessions a join sessions b on a.user_id=b.user_id and a.id<b.id
 and a.started_at < coalesce(b.ended_at,b.started_at) and b.started_at < coalesce(a.ended_at,a.started_at)
 join analysis_results ra on ra.session_id=a.id join analysis_results rb on rb.session_id=b.id
 where a.deleted is not true and b.deleted is not true and a.merged_into is null and b.merged_into is null
 and ra.num_runs>0 and rb.num_runs>0 and coalesce(a.device_id,-1)<>coalesce(b.device_id,-2)
 and a.sport_class in ('pumpfoil','foil_scoot') and b.sport_class in ('pumpfoil','foil_scoot')""")).all()


def geraet(s):
    d = db.get(models.DeviceToken, s.device_id) if s.device_id else None
    plat = (d.platform if d else None) or s.session_uuid[:4]
    name = s.device_model or ((pm.get(d.part_number) or {}).get("name") if d and d.part_number else None) or "?"
    return f"{plat}|{name.split('·')[0].strip()}"


def spur(s):
    g = storage.load_gps(s.session_uuid, roh=True)
    t0 = s.started_at.timestamp()
    a = []
    for p in g:
        if not p or p[1] is None or p[2] is None:
            continue
        v = p[3] if len(p) > 3 and isinstance(p[3], (int, float)) and p[3] is not None and p[3] >= 0 else np.nan
        h = p[5] if len(p) > 5 and isinstance(p[5], (int, float)) else np.nan
        a.append((t0 + p[0] / 1000.0, p[1], p[2], v, h))
    a = np.array(a, float)
    if len(a):
        a = a[np.argsort(a[:, 0])]
        _, k = np.unique(a[:, 0], return_index=True)
        a = a[k]
    return a


def laeufe(s):
    ar = db.query(models.AnalysisResult).filter_by(session_id=s.id).one()
    segs = json.loads(ar.segments_json or "[]")
    t0 = s.started_at.timestamp()
    out = []
    for g in segs:
        a, b = g.get("t_start_session_ms"), g.get("t_end_session_ms")
        if a is None:
            if g.get("t_start_ms") is None:
                continue
            a, b = g["t_start_ms"] + (s.trim_start_ms or 0), g["t_end_ms"] + (s.trim_start_ms or 0)
        out.append((t0 + a / 1000, t0 + b / 1000))
    return out


def versatz(A, B):
    """Zeitversatz von B gegen A (s), aus der Kreuzkorrelation des Doppler-Tempos (0,1-s-Raster, +-8 s)."""
    lo, hi = max(A[0, 0], B[0, 0]), min(A[-1, 0], B[-1, 0])
    if hi - lo < 120:
        return None, 0
    tt = np.arange(lo + 10, hi - 10, 0.1)
    fa = np.interp(tt, A[:, 0], np.nan_to_num(A[:, 3]))
    best, bk = -1, None
    for k in np.arange(-8, 8.01, 0.1):
        fb = np.interp(tt + k, B[:, 0], np.nan_to_num(B[:, 3]))
        m = (fa > 1.5) | (fb > 1.5)
        if m.sum() < 300:
            continue
        c = np.corrcoef(fa[m], fb[m])[0, 1]
        if c > best:
            best, bk = c, k
    return bk, best


gruppen = []
for ia, ib in rows:
    A, B = db.get(models.Session, ia), db.get(models.Session, ib)
    sa, sb = spur(A), spur(B)
    if len(sa) < 100 or len(sb) < 100:
        continue
    # Dublette (dieselbe Aufnahme zweimal, z. B. Import + App)?
    k, c = versatz(sa, sb)
    if k is None or c < 0.45:
        print(ia, ib, "kein Abgleich", k, c)
        continue
    sbk = sb.copy(); sbk[:, 0] -= k
    tt = np.arange(max(sa[0, 0], sbk[0, 0]), min(sa[-1, 0], sbk[-1, 0]), 2.0)
    dist = 111000 * np.hypot(np.interp(tt, sa[:, 0], sa[:, 1]) - np.interp(tt, sbk[:, 0], sbk[:, 1]),
                             (np.interp(tt, sa[:, 0], sa[:, 2]) - np.interp(tt, sbk[:, 0], sbk[:, 2])) * np.cos(np.radians(sa[0, 1])))
    dmed = float(np.median(dist))
    if dmed < 1.5:
        print(ia, ib, "derselbe Chip", round(dmed, 2)); continue
    if dmed > 15:
        print(ia, ib, "nicht zusammen", round(dmed, 1)); continue
    common = np.intersect1d(np.round(sa[:, 0], 1), np.round(sbk[:, 0], 1))
    if c > 0.995 and len(common) > 0.8 * min(len(sa), len(sb)):
        va = np.interp(common, sa[:, 0], sa[:, 3]); vb = np.interp(common, sbk[:, 0], sbk[:, 3])
        if np.nanmedian(np.abs(va - vb)) < 0.03:
            print(ia, ib, "Dublette")
            continue
    la, lb = laeufe(A), laeufe(B)
    gem = []
    for a0, a1 in la:
        for b0, b1 in lb:
            b0k, b1k = b0 - k, b1 - k
            x0, x1 = max(a0, b0k), min(a1, b1k)
            if x1 - x0 >= 12 and (x1 - x0) >= 0.6 * max(a1 - a0, b1k - b0k):
                # Lauf etwas grosszuegiger schneiden (Vereinigung), Fenster entscheiden spaeter
                u0, u1 = min(a0, b0k), max(a1, b1k)
                cut = lambda S: S[(S[:, 0] >= u0 - 2) & (S[:, 0] <= u1 + 2)]
                gem.append({"t0": x0, "t1": x1, "u0": u0, "u1": u1, "A": cut(sa), "B": cut(sbk)})
    if not gem:
        continue
    gruppen.append({"user": A.user_id, "a": ia, "b": ib, "ga": geraet(A), "gb": geraet(B),
                    "pa": A.placement, "pb": B.placement, "versatz": k, "korr": c, "abstand": dmed, "laeufe": gem})
    print(ia, ib, geraet(A), "|", geraet(B), A.placement, B.placement, f"versatz {k:+.1f}s r={c:.3f} abst {dmed:.1f}m", len(gem), "Laeufe")

pickle.dump(gruppen, open(sys.argv[1], "wb"))
print("Gruppen", len(gruppen), "Laeufe", sum(len(g["laeufe"]) for g in gruppen),
      "Fahrer", len({g["user"] for g in gruppen}))
