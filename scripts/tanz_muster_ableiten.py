"""Muster je Tanz aus Jans beschrifteten Sessions ableiten -> server/app/data/tanz_muster.json (rein lesend
gegenueber der DB). Dazu eine Pruefung „ohne die eigene Quelle“ (leave-one-out), damit die Zahlen nicht
an sich selbst gemessen werden. Aufruf: cd server && .venv/bin/python ../scripts/tanz_muster_ableiten.py [--schreiben]
Siehe docs/TANZ.md."""
from __future__ import annotations

import json
import math
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
from app import models, storage, tanz, tanz_analyse as ta  # noqa: E402
from app.db import SessionLocal  # noqa: E402

DATA = Path(__file__).resolve().parents[1] / "server" / "app" / "data"
# Ohne eigene Daten: aus Musiktempo geschaetzt (Schrittrhythmus ~ halber Schlag, s. docs/TANZ.md), breit.
GESCHAETZT = {"slowfox": 58, "paso": 60, "discofox": 125, "bachata": 66}


def lade(sid):
    s = SessionLocal().get(models.Session, sid)
    a = storage.load_accel(s.session_uuid).astype(float) / (s.accel_scale or 1000)
    g = storage.load_gyro(s.session_uuid).astype(float)
    g = g[:len(a)] / 1024 * 180 / math.pi if len(g) else None
    return s, ta.fenster(a, g)


def web_korrekturen(sid):
    """Jans Korrekturen in der Tabelle „Taenze" (quelle web) — die staerkste Wahrheit."""
    s = SessionLocal().get(models.Session, sid)
    d = tanz.laden(s.session_uuid) or {}
    return [(r["start_ms"], r.get("ende_ms") or r["start_ms"], r["gewaehlt"]) for r in d.get("abschnitte") or []
            if r.get("quelle") == "web" and r.get("gewaehlt") and r["gewaehlt"] != "kein"]


def quellen():
    """[(quelle_id, tanz, fenster)] aus Wahrheit + Marker-Sessions; Web-Korrekturen gehen vor."""
    w = json.loads((DATA / "tanz_wahrheit.json").read_text())
    out = []
    ids = [e["id"] for e in w["sessions"]] + [e["id"] for e in w["marker_sessions"]] + [e["id"] for e in w["nur_auswahl"]]
    korr = {sid: web_korrekturen(sid) for sid in ids}
    def frei(sid, fs):   # Fenster, die keine Web-Korrektur abdeckt
        return [f for f in fs if not any(v <= f["t_ms"] < b for v, b, _k in korr[sid])]
    for e in w["sessions"]:
        _s, fs = lade(e["id"])
        for i, (von, bis, key) in enumerate(e["abschnitte"]):
            teil = [f for f in frei(e["id"], fs) if f["t_ms"] >= von and (bis is None or f["t_ms"] + 10000 <= bis)]
            out.append((f"{e['id']}#{i}", key, teil))
    for e in w["marker_sessions"]:
        s, fs = lade(e["id"])
        d = tanz.laden(s.session_uuid) or {}
        mk = [(m["start_ms"], m["gewaehlt"]) for m in (d.get("uhr") or d.get("abschnitte") or []) if m.get("quelle") == "marker"]
        for i, (von, bis, key) in enumerate(ta.marker_deuten(mk, fs)):
            out.append((f"{e['id']}m{i}", key, [f for f in frei(e["id"], fs) if von <= f["t_ms"] < bis]))
    for sid, ks in korr.items():
        if not ks:
            continue
        _s, fs = lade(sid)
        for i, (von, bis, key) in enumerate(ks):
            out.append((f"{sid}w{i}", key, [f for f in fs if von <= f["t_ms"] < bis]))
    return out


def ableiten(qs):
    je = defaultdict(list)
    for _q, key, fs in qs:
        je[key] += [f for f in fs if ta.tanzt(f)]
    muster = {}
    for key, fs in je.items():
        if len(fs) < 3:
            continue
        lt = np.log([f["tempo"] for f in fs if f["tempo"] > 0])
        qu = np.array([f["quer"] for f in fs])
        um = np.array([f["umdr"] for f in fs if f["umdr"] is not None])
        iqr = lambda x: (np.percentile(x, 75) - np.percentile(x, 25)) / 1.35
        m = {"tempo": [round(float(np.exp(np.median(lt))), 1), round(max(0.12, float(iqr(lt))), 3)],
             "quer": [round(float(np.median(qu)), 3), round(max(0.15, float(iqr(qu))), 3)],
             "fenster": len(fs)}
        if len(um) >= 3:
            m["umdr"] = [round(float(np.median(um)), 3), round(max(0.15, float(iqr(um))), 3)]
        muster[key] = m
    for key, t in GESCHAETZT.items():
        muster.setdefault(key, {"tempo": [t, 0.35], "geschaetzt": True, "fenster": 0})
    return muster


UHR_KEYS = ["lw", "tango", "ww", "slowfox", "quickstep", "samba", "chacha", "rumba", "paso", "jive",
            "salsa", "bachata", "discofox", "boogie"]


def uhr_block(muster):
    """Konstanten fuer watch-dance/source/Tanz.mc (Reihenfolge = KEYS dort)."""
    t = [round(muster.get(k, {}).get("tempo", [0])[0]) for k in UHR_KEYS]
    q = [round(1000 * muster[k]["quer"][0]) if muster.get(k, {}).get("quer") else -1 for k in UHR_KEYS]
    u = [round(1000 * muster[k]["umdr"][0]) if muster.get(k, {}).get("umdr") else -1 for k in UHR_KEYS]
    g = [1 if muster.get(k, {}).get("geschaetzt") else 0 for k in UHR_KEYS]
    return ("    // MUSTER-BEGINN (erzeugt: scripts/tanz_muster_ableiten.py --uhr; nicht von Hand aendern)\n"
            f"    const M_TEMPO = {t};\n    const M_QUER = {q};     // x1000, -1 = keine Daten\n"
            f"    const M_UMDR = {u};     // Umdrehungen je 10 s x1000, -1 = keine Daten\n"
            f"    const M_GESCH = {g};   // 1 = geschaetzt (ohne eigene Daten)\n"
            "    // MUSTER-ENDE")


def main():
    qs = quellen()
    muster = ableiten(qs)
    print("Muster:")
    for k, m in sorted(muster.items()):
        print(f"  {k:10} tempo {m['tempo']}  quer {m.get('quer')}  umdr {m.get('umdr')}  n={m['fenster']}{'  GESCHAETZT' if m.get('geschaetzt') else ''}")
    # Pruefung 1: Taenze mit MEHREREN Quellen — Muster ohne die eigene Quelle (echtes Wiedererkennen).
    # Pruefung 2: grosse Einzel-Quellen — erste Haelfte lernen, zweite pruefen (nur Stabilitaet).
    def mit(mu, f):
        orig = ta.muster
        ta.muster = lambda: mu  # type: ignore
        try:
            return f()
        finally:
            ta.muster = orig
    def stuecke(fs):
        st = [fs[i:i + 6] for i in range(0, len(fs), 6)]
        return [x for x in st if sum(ta.tanzt(f) for f in x) >= 3]
    zahl = defaultdict(int)
    for _q, key, _fs in qs:
        zahl[key] += 1
    print("\nPruefung 1 — ohne eigene Quelle (nur Taenze mit mehreren Quellen):")
    ok = n = 0
    for q, key, fs in qs:
        if zahl[key] < 2:
            continue
        mu = ableiten([x for x in qs if x[0] != q])
        v = mit(mu, lambda: ta.vorschlag(fs))
        st = stuecke(fs)
        r = mit(mu, lambda: sum(ta.vorschlag(x) == key for x in st))
        ok += v == key; n += 1
        print(f"  {q:10} {key:9} -> {v:9} {'OK ' if v == key else '   '} | 1-min-Stuecke {r}/{len(st)}")
    print(f"  ganze Quellen richtig: {ok}/{n}")
    print("\nPruefung 2 — erste Haelfte lernen, zweite pruefen (je Quelle mit >= 10 tanzenden Fenstern):")
    for q, key, fs in qs:
        tz = [f for f in fs if ta.tanzt(f)]
        if len(tz) < 10:
            continue
        h = len(fs) // 2
        mu = ableiten([x for x in qs if x[0] != q] + [(q, key, fs[:h])])
        st = stuecke(fs[h:])
        r = mit(mu, lambda: [ta.vorschlag(x) for x in st])
        print(f"  {q:10} {key:9} 2. Haelfte: {sum(x == key for x in r)}/{len(st)} richtig, sonst {sorted(set(x for x in r if x != key))}")
    print("\nNur EINE Quelle (nicht unabhaengig pruefbar):", sorted(k for k, z in zahl.items() if z < 2))
    if "--uhr" in sys.argv:
        print(uhr_block(muster))
    if "--schreiben" in sys.argv:
        (DATA / "tanz_muster.json").write_text(json.dumps({
            "_zweck": "Muster je Tanz fuer app/tanz_analyse.py und watch-dance/Tanz.mc; erzeugt von scripts/tanz_muster_ableiten.py aus app/data/tanz_wahrheit.json + Marker-Sessions. Nicht von Hand aendern — Wahrheit ergaenzen und neu ableiten. Siehe docs/TANZ.md.",
            "taenze": muster}, indent=1, ensure_ascii=False))
        print("geschrieben:", DATA / "tanz_muster.json")


if __name__ == "__main__":
    main()
