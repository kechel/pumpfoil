#!/usr/bin/env python3
"""Tanz erkennen per SCHNITTMENGE (Jan, 25.10.2026): „wenn accel in bestimmten richtungen (x/y/z) & gyro & takt
jeweils auf 2-3 eingrenzen, dann koennte die schnittmenge schon der richtige treffer sein".

NUR LESEN. Je beschriftetem Abschnitt (alle Tanz-Sessions) die 10-s-Fenster mit Merkmalen; je Tanz und Merkmal ein
grosszuegiger Bereich (Perzentile); je Fenster die Tanz-Kandidaten je Merkmal und deren Schnittmenge; je Abschnitt
die Mehrheit. Bewertet LEAVE-ONE-SESSION-OUT: die Bereiche kommen nur aus den ANDEREN Sessions.

    cd server && .venv/bin/python ../scripts/tanz_schnittmenge.py [--lo 5 --hi 95] [--merkmale tempo,akt,...]
"""
import argparse
import collections
import math
import os
import pathlib
import sys

import numpy as np


def env():
    for line in pathlib.Path(".env").read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            os.environ["DATABASE_URL"] = line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.path.insert(0, ".")


ALLE = ["tempo", "akt", "quer", "umdr", "b1", "b2", "ax", "ay", "az", "gx", "gy", "gz"]


def fenster_der_session(s, storage, ts, ta):
    """Server-Fenster (tempo, klar, akt, quer, umdr, b1, b2) + je Achse: Streuung der Beschleunigung (Uhr-Achsen,
    linkes Handgelenk) und mittlerer Betrag der Drehrate je Achse."""
    a = storage.load_accel(s.session_uuid).astype(float) / (s.accel_scale or 1000)
    g = storage.load_gyro(s.session_uuid).astype(float)
    g = g[:len(a)] / 1024 * 180 / math.pi if len(g) else None
    fs = ts.fenster(a, g)
    for f in fs:
        i = f["t_ms"] // 40
        w = a[i:i + ta.N]
        f["ax"], f["ay"], f["az"] = (float(v) for v in w.std(0))
        if g is not None and len(g) >= i + ta.N:
            f["gx"], f["gy"], f["gz"] = (float(v) for v in np.abs(g[i:i + ta.N]).mean(0))
    return fs


def tempo_passt(v, lo, hi):
    """Takt grosszuegig: auch halber/doppelter Wert zaehlt (der Taktfinder rastet gern auf Vielfache ein)."""
    return any(lo <= v * k <= hi for k in (0.5, 1.0, 2.0))


def abschnitt_ebene(zeilen, sessions, merk, args):
    """Dieselbe Idee auf ABSCHNITTEN: Median je Abschnitt und Merkmal; Bereich je Tanz = Spanne der Abschnitts-Mediane
    der Trainings-Sessions (+/- Rand); Schnittmenge; daneben zum Vergleich das naechste Muster (z-Abstand, wie s1)."""
    def med(ws, m):
        v = [w[m] for w in ws if w.get(m) is not None and not (m == "tempo" and w[m] <= 0)]
        return float(np.median(v)) if v else None
    rows = [(sid, t, {m: med(ws, m) for m in merk}, len(ws)) for sid, t, ws in zeilen]
    erg = {"schnitt": [0, 0], "naechstes": [0, 0], "eindeutig": 0, "leer": 0, "n": 0}
    verw = collections.Counter()
    for sid in sessions:
        train = [r for r in rows if r[0] != sid]
        werte = collections.defaultdict(lambda: collections.defaultdict(list))
        for _, t, f, _n in train:
            for m, v in f.items():
                if v is not None:
                    werte[t][m].append(v)
        taenze = [t for t in werte if len(werte[t].get("akt", [])) >= 2]
        alle = collections.defaultdict(list)
        for t in taenze:
            for m, v in werte[t].items():
                alle[m] += v
        sd = {m: float(np.std(v)) or 1.0 for m, v in alle.items()}
        for _, wahr, f, n in (r for r in rows if r[0] == sid):
            if wahr not in taenze:
                continue
            erg["n"] += 1
            je_merk = []
            for m, v in f.items():
                if v is None:
                    continue
                rand = 0.25 * sd.get(m, 1.0)
                k = {t for t in taenze if werte[t].get(m) and
                     (min(werte[t][m]) - rand <= v <= max(werte[t][m]) + rand or
                      (m == "tempo" and any(min(werte[t][m]) - rand <= v * q <= max(werte[t][m]) + rand for q in (0.5, 2.0))))}
                je_merk.append(k)
            schnitt = set(taenze)
            for k in je_merk:
                schnitt &= k
            stimmen = collections.Counter(t for k in je_merk for t in k)
            erg["eindeutig"] += len(schnitt) == 1
            erg["leer"] += not schnitt
            # naechstes Muster (Mittel je Tanz, Abstand in Gesamt-Streuungen)
            def abst(t):
                d = 0.0
                for m, v in f.items():
                    if v is None or not werte[t].get(m):
                        continue
                    mu = float(np.mean(werte[t][m]))
                    d += ((v - mu) / sd.get(m, 1.0)) ** 2
                return d
            naechst = min(taenze, key=abst)
            if schnitt:
                tipp = min(schnitt, key=abst)          # mehrere in der Schnittmenge -> der naechste davon
            else:
                top = max(stimmen.values())
                tipp = min((t for t, c in stimmen.items() if c == top), key=abst)
            for key, tp in (("schnitt", tipp), ("naechstes", naechst)):
                erg[key][0] += tp == wahr
                erg[key][1] += 1
            if tipp != wahr:
                verw[(wahr, tipp)] += 1
    n = max(1, erg["n"])
    print(f"\nABSCHNITTS-EBENE ({erg['n']} bewertbare Abschnitte, Merkmale {','.join(merk)}):")
    print(f"  Schnittmenge: {erg['schnitt'][0]}/{erg['schnitt'][1]} richtig = {100 * erg['schnitt'][0] / n:.0f} %"
          f"  (eindeutig {100 * erg['eindeutig'] / n:.0f} %, leer {100 * erg['leer'] / n:.0f} %)")
    print(f"  naechstes Muster (wie s1, gleiche Merkmale): {erg['naechstes'][0]}/{erg['naechstes'][1]} = {100 * erg['naechstes'][0] / n:.0f} %")
    print("  Verwechslungen Schnittmenge:", dict(verw.most_common(10)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lo", type=float, default=5)
    ap.add_argument("--hi", type=float, default=95)
    ap.add_argument("--merkmale", default=",".join(ALLE))
    ap.add_argument("--je-abschnitt", action="store_true",
                    help="leave-one-ABSCHNITT-out statt Session (trennt: Merkmale schwach vs. Abende verschieden)")
    ap.add_argument("--norm", action="store_true", help="Groessen-Merkmale je Abend auf den Abend-Median normieren")
    ap.add_argument("--min-fenster", type=int, default=12, help="Tanz braucht so viele Fenster in den Trainings-Sessions")
    args = ap.parse_args()
    merk = args.merkmale.split(",")
    env()
    from app import models, storage, tanz, tanz_server as ts, tanz_analyse as ta
    from app.db import SessionLocal
    db = SessionLocal()

    zeilen = []    # (session_id, tanz, [fenster])
    for k in db.query(models.TanzSession).all():
        s = db.get(models.Session, k.session_id)
        if s is None or s.deleted:
            continue
        ab = [r for r in tanz.laden(db, s.id)["abschnitte"]
              if r.get("gewaehlt") and r["gewaehlt"] not in tanz.OHNE_TANZ and (r["ende_ms"] is None or r["ende_ms"] > r["start_ms"])]
        if not ab:
            continue
        fs = fenster_der_session(s, storage, ts, ta)
        if args.norm:
            # je Abend normieren: Groessen-Merkmale durch ihren Median ueber alle TANZENDEN Fenster des Abends
            # (braucht keine Beschriftung, ginge auch live mit dem bisherigen Abend)
            tz = [f for f in fs if f["akt"] >= ta.AKT_G]
            for m in ("akt", "ax", "ay", "az", "gx", "gy", "gz", "umdr"):
                v = [f[m] for f in tz if f.get(m) is not None]
                if v:
                    md = float(np.median(v)) or 1.0
                    for f in fs:
                        if f.get(m) is not None:
                            f[m] = f[m] / md
        for r, ws in zip(ab, ts.zeilen_fenster(fs, ab)):
            ws = [w for w in ws if w["akt"] >= ta.AKT_G]          # Stillstand im Abschnitt raus
            if ws:
                zeilen.append((s.id, r["gewaehlt"], ws))
    abende = collections.defaultdict(set)
    for sid, t, _ws in zeilen:
        abende[t].add(sid)
    print("Abende je Tanz:", {t: len(v) for t, v in sorted(abende.items(), key=lambda x: -len(x[1]))})
    if args.je_abschnitt:
        zeilen = [(i, t, ws) for i, (_sid, t, ws) in enumerate(zeilen)]
    sessions = sorted({z[0] for z in zeilen})
    print(f"{len(zeilen)} beschriftete Abschnitte, {sum(len(z[2]) for z in zeilen)} Fenster, {len(sessions)} Sessions")
    je = collections.Counter()
    for _, t, ws in zeilen:
        je[t] += len(ws)
    print("Fenster je Tanz:", dict(je.most_common()))

    def bereiche(train):
        werte = collections.defaultdict(lambda: collections.defaultdict(list))
        for _, t, ws in train:
            for w in ws:
                for m in merk:
                    v = w.get(m)
                    if v is not None and not (m == "tempo" and v <= 0):
                        werte[t][m].append(v)
        out = {}
        for t, mw in werte.items():
            if len(mw.get("akt", [])) < args.min_fenster:
                continue
            out[t] = {m: (float(np.percentile(v, args.lo)), float(np.percentile(v, args.hi))) for m, v in mw.items() if len(v) >= 5}
        return out

    def kandidaten(w, B):
        """Je Merkmal die passenden Taenze; Schnittmenge; Stimmen (in wie vielen Merkmalen passt ein Tanz)."""
        stimmen = collections.Counter()
        n_merk = 0
        je_merk = {}
        for m in merk:
            v = w.get(m)
            if v is None or (m == "tempo" and v <= 0):
                continue
            n_merk += 1
            k = {t for t, b in B.items() if m in b and (tempo_passt(v, *b[m]) if m == "tempo" else b[m][0] <= v <= b[m][1])}
            je_merk[m] = k
            for t in k:
                stimmen[t] += 1
        schnitt = set(B) if je_merk else set()
        for k in je_merk.values():
            schnitt &= k
        return schnitt, stimmen, je_merk

    treffer = gesamt = 0
    treffer_gew = gesamt_gew = 0.0
    eindeutig = leer = 0
    nfenster = 0
    merk_stat = collections.defaultdict(lambda: [0, 0, 0])   # Merkmal -> [wahr drin, Fenster, Summe Kandidaten]
    verwechslung = collections.Counter()
    for sid in sessions:
        train = [z for z in zeilen if z[0] != sid]
        test = [z for z in zeilen if z[0] == sid]
        B = bereiche(train)
        for _, wahr, ws in test:
            if wahr not in B:
                continue        # Tanz kommt nur in dieser Session vor -> nicht bewertbar
            punkte = collections.Counter()
            for w in ws:
                schnitt, stimmen, je_merk = kandidaten(w, B)
                nfenster += 1
                for m, k in je_merk.items():
                    st = merk_stat[m]
                    st[0] += wahr in k
                    st[1] += 1
                    st[2] += len(k)
                if len(schnitt) == 1:
                    eindeutig += 1
                if not schnitt:
                    leer += 1
                # Schnittmenge zaehlt voll (geteilt durch ihre Groesse); ist sie leer, die Taenze mit den meisten Stimmen
                if schnitt:
                    for t in schnitt:
                        punkte[t] += 1.0 / len(schnitt)
                elif stimmen:
                    top = max(stimmen.values())
                    beste = [t for t, n in stimmen.items() if n == top]
                    for t in beste:
                        punkte[t] += 0.5 / len(beste)
            if not punkte:
                continue
            tipp = punkte.most_common(1)[0][0]
            gesamt += 1
            treffer += tipp == wahr
            gesamt_gew += len(ws)
            treffer_gew += len(ws) * (tipp == wahr)
            if tipp != wahr:
                verwechslung[(wahr, tipp)] += 1
    abschnitt_ebene(zeilen, sessions, merk, args)
    print(f"\nFENSTER-EBENE — Bereich je Merkmal: {args.lo:g}.–{args.hi:g}. Perzentil, Merkmale: {','.join(merk)}")
    print(f"Abschnitte richtig: {treffer}/{gesamt} = {100 * treffer / max(1, gesamt):.0f} %  "
          f"(nach Laenge gewichtet {100 * treffer_gew / max(1, gesamt_gew):.0f} %)")
    print(f"Fenster: Schnittmenge eindeutig {100 * eindeutig / max(1, nfenster):.0f} %, leer {100 * leer / max(1, nfenster):.0f} %")
    print("Merkmal | wahrer Tanz im Kandidatensatz | Kandidaten im Mittel")
    for m in merk:
        st = merk_stat.get(m)
        if st and st[1]:
            print(f"  {m:5s} {100 * st[0] / st[1]:5.0f} %   {st[2] / st[1]:4.1f}")
    print("Verwechslungen (wahr -> Tipp):", dict(verwechslung.most_common(12)))


if __name__ == "__main__":
    main()
