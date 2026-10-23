#!/usr/bin/env python3
"""Schritte 2+3: heutiger Handgelenk-Zaehler (Stufe 11 auf den gespeicherten v3-Laeufen) gegen die
Brett-Wahrheit, und Laufenden Uhr gegen Brett (Puffer-Frage). Liest NUR die Pickles aus labels.py.

Pumps: Brett-Ereignis = tiefster Punkt eines Zyklus mit Energie (GROUND-TRUTH §5). Der Uhr-Gipfel
(Vertikal-Push) sitzt phasenversetzt; der Versatz wird EINMAL global aus den guten Paaren geschaetzt
(Median der naechsten Abstaende) und gemeldet. Bewertet nur, wo Uhr-Lauf UND Brett-Lauf (mit Aussage,
Start bis Aufsetzen) gleichzeitig liegen.

Aufruf: cd server && .venv/bin/python ../scripts/pumpgleit/heute.py [--lag-ms X]
"""
import argparse
import json
import pathlib
import pickle
import sys
from collections import defaultdict

import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gemeinsam as G


def laden():
    out = []
    for f in sorted((G.AUS / "paare").glob("*.pkl")):
        with open(f, "rb") as h:
            out.append(pickle.load(h))
    return out


def zonen(P, uhr_laeufe):
    """Ueberlappung Uhr-Lauf x Brett-Lauf (ok, Start..Aufsetzen) als Liste (a, b, uhr_idx, brett_idx)."""
    z = []
    for j, L in enumerate(P["laeufe"]):
        if not L["ok"]:
            continue
        for i, (a, b) in enumerate(uhr_laeufe):
            lo, hi = max(a, L["start"]), min(b, L["aufsetzen"])
            if hi - lo > 2000:
                z.append((lo, hi, i, j))
    return z


def lag_schaetzen(paare, heute):
    d = []
    for P in paare:
        if P["meta"]["qualitaet"] != "gut" or not P["meta"]["pump_timing_ok"]:
            continue
        H = heute[P["meta"]["uhr"]]
        for lo, hi, i, j in zonen(P, [(h["a"], h["b"]) for h in H]):
            w = np.array([x for x in P["laeufe"][j]["pumps_tief"] if lo <= x <= hi])
            e = np.array([x for x in H[i]["pump_ms"] if lo <= x <= hi])
            if w.size and e.size:
                for x in e:
                    k = np.argmin(np.abs(w - x))
                    if abs(w[k] - x) <= 400:
                        d.append(x - w[k])
    return float(np.median(d)) if d else 0.0, d


def bewerten_pumps(P, laeufe_pump_ms, uhr_laeufe, lag):
    """-> dict je Paar: Treffer/verpasst/extra bei 250/400 ms, je Lauf Zahlen und Kadenzen."""
    r = {"250": [0, 0, 0], "400": [0, 0, 0], "laeufe": []}
    for lo, hi, i, j in zonen(P, uhr_laeufe):
        w = np.array([x for x in P["laeufe"][j]["pumps_tief"] if lo <= x <= hi])
        e = np.array([x for x in laeufe_pump_ms[i] if lo + lag <= x <= hi + lag])
        for tol in ("250", "400"):
            t_, v_, x_, _ = G.zuordnen(w, e, float(tol), lag)
            r[tol][0] += t_; r[tol][1] += v_; r[tol][2] += x_
        dur = (hi - lo) / 1000.0
        r["laeufe"].append({"dauer_s": round(dur, 1), "brett": int(w.size), "uhr": int(e.size),
                            "kad_brett": w.size / dur, "kad_uhr": e.size / dur})
    return r


def bewerten_gleit(P, gleit_erk, uhr_laeufe, t_raster):
    """Gleit-Intervalle: Praezision/Trefferquote je Intervall + je Sekunde, nur in den Zonen.
    Zusaetzlich: Brett-Gleiten, das AUSSERHALB jedes Uhr-Laufs liegt (fuer die Puffer-Frage)."""
    z = zonen(P, uhr_laeufe)
    wahr = [g for L in P["laeufe"] if L["ok"] for g in L["gleit"]]
    wz = [(max(a, lo), min(b, hi)) for a, b in wahr for lo, hi, _, _ in z if min(b, hi) - max(a, lo) > 0]
    ez = [(max(a, lo), min(b, hi)) for a, b in gleit_erk for lo, hi, _, _ in z if min(b, hi) - max(a, lo) > 0]
    tp_e, n_e, _, _ = G.intervalle_vergleich(wahr, ez)
    _, _, tp_w, n_w = G.intervalle_vergleich(wahr, gleit_erk)   # Brett-Intervalle gesamt (auch ausserhalb)
    zm = np.zeros(t_raster.size, bool)
    for lo, hi, _, _ in z:
        zm |= (t_raster >= lo) & (t_raster < hi)
    mw = G.sekunden_maske(t_raster, wahr) & zm
    me = G.sekunden_maske(t_raster, gleit_erk) & zm
    return {"tp_e": tp_e, "n_e": n_e, "tp_w": tp_w, "n_w": n_w, "n_w_zone": len(wz),
            "s_tp": float((mw & me).sum()), "s_w": float(mw.sum()), "s_e": float(me.sum()),
            "s_w_gesamt": round(sum(b - a for a, b in wahr) / 1000.0, 2)}


def enden(P, uhr_laeufe):
    """Je Brett-Lauf (ok) der Uhr-Lauf mit groesster Ueberlappung: Start-/Endabstaende (s)."""
    out = []
    for L in P["laeufe"]:
        if not L["ok"]:
            continue
        best, bi = 0.0, None
        for i, (a, b) in enumerate(uhr_laeufe):
            u = min(b, L["ende"]) - max(a, L["start"])
            if u > best:
                best, bi = u, i
        if bi is None:
            out.append({"gefunden": False}); continue
        a, b = uhr_laeufe[bi]
        nxt = uhr_laeufe[bi + 1][0] if bi + 1 < len(uhr_laeufe) else np.inf
        out.append({"gefunden": True, "start_diff": (a - L["start"]) / 1000.0,
                    "ende_minus_aufsetzen": (b - L["aufsetzen"]) / 1000.0,
                    "ende_minus_brettende": (b - L["ende"]) / 1000.0,
                    "uhr_ende": b, "naechster_start": nxt, "uhr_idx": bi,
                    "gleit": L["gleit"], "aufsetzen": L["aufsetzen"]})
    return out


def puffer_wirkung(alle_enden, n_s):
    """Brett-Gleiten am Laufende, das hinter dem Uhr-Laufende liegt: verloren ohne / mit Puffer."""
    verl_s = rett_s = 0.0
    verl_n = rett_n = 0
    for e in alle_enden:
        if not e.get("gefunden"):
            continue
        b = e["uhr_ende"]
        grenze = min(b + n_s * 1000.0, e["naechster_start"])
        for x, y in e["gleit"]:
            if y > b:
                hinten = (y - max(x, b)) / 1000.0
                verl_s += hinten
                frac_vorher = max(0.0, min(y, b) - x) / (y - x)
                if frac_vorher < 0.5:
                    verl_n += 1
                    if max(0.0, min(y, grenze) - x) / (y - x) >= 0.5:
                        rett_n += 1
                rett_s += max(0.0, min(y, grenze) - max(x, b)) / 1000.0
    return verl_s, rett_s, verl_n, rett_n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lag-ms", type=float, default=None)
    a = ap.parse_args()
    paare = laden()
    heute = {}
    for P in paare:
        U = P["uhr"]
        heute[P["meta"]["uhr"]] = G.heute_pumps(U, G.gespeicherte_laeufe(U))
    lag, d = lag_schaetzen(paare, heute)
    if a.lag_ms is not None:
        lag = a.lag_ms
    print(f"Phasenversatz Uhr-Gipfel minus Brett-Tiefpunkt (gute Paare): Median {lag:.0f} ms, "
          f"IQR {np.percentile(d, 25):.0f}..{np.percentile(d, 75):.0f} ms, n={len(d)}")
    erg = {"lag_ms": lag, "paare": []}
    je_fahrer = defaultdict(lambda: defaultdict(float))
    alle_enden = defaultdict(list)
    for P in paare:
        m = P["meta"]; U = P["uhr"]; H = heute[m["uhr"]]
        ul = [(h["a"], h["b"]) for h in H]
        # Nachbau-Gegenprobe gegen die gespeicherten Pumps
        gesp = [g.get("pumps") for g in U["segs"]]
        nachbau = sum(1 for h, g in zip(H, gesp) if h["pumps"] == g)
        pb = bewerten_pumps(P, [h["pump_ms"] for h in H], ul, lag)
        gl = bewerten_gleit(P, [g for h in H for g in h["gleit"]], ul, U["t"])
        en = enden(P, ul)
        gruppe = f"u{m['user']}" + ("" if m["pump_timing_ok"] and m["qualitaet"] != "schwach" else "*")
        alle_enden[gruppe] += en
        F = je_fahrer[gruppe]
        F["paare"] += 1
        for tol in ("250", "400"):
            for k, n in zip(("t", "v", "x"), pb[tol]):
                F[f"{k}{tol}"] += n
        for L in pb["laeufe"]:
            F["brett"] += L["brett"]; F["uhr"] += L["uhr"]; F["laeufe"] += 1
            F["kad_abs"] += abs(L["kad_uhr"] - L["kad_brett"])
            F["anz_rel"] += abs(L["uhr"] - L["brett"]) / max(L["brett"], 1)
        for k in ("tp_e", "n_e", "tp_w", "n_w", "s_tp", "s_w", "s_e", "s_w_gesamt"):
            F[k] += gl[k]
        erg["paare"].append({"meta": m, "nachbau": f"{nachbau}/{len(gesp)}", "pumps": pb, "gleit": gl,
                             "enden": [{k: v for k, v in e.items() if k not in ("gleit",)} for e in en]})
        print(f"#{m['uhr']} u{m['user']} {m['qualitaet']:7} Nachbau {nachbau}/{len(gesp)} | ±250: "
              f"T{pb['250'][0]} V{pb['250'][1]} X{pb['250'][2]} | ±400: T{pb['400'][0]} V{pb['400'][1]} "
              f"X{pb['400'][2]} | Gleit Int P {gl['tp_e']}/{gl['n_e']} R {gl['tp_w']}/{gl['n_w']} "
              f"s {gl['s_tp']/U['fs']:.1f}/{gl['s_w']/U['fs']:.1f} (erk {gl['s_e']/U['fs']:.1f})")
    print("\nJe Fahrer (* = Rate < 15 Hz oder Ausrichtung schwach: nur Gleit-/Lauf-Zahlen belastbar)")
    print(f"{'Fahrer':7} {'Paare':>5} {'Laeufe':>6} {'Brett':>6} {'Uhr':>6} | {'±250 Tr%':>8} {'Extra%':>6} | "
          f"{'±400 Tr%':>8} {'Extra%':>6} | {'|Kad| Hz':>8} {'|Anz| %':>7} | {'GlP':>5} {'GlR':>5} {'sP':>5} {'sR':>5}")
    for g, F in sorted(je_fahrer.items()):
        tr = lambda tol: 100 * F[f"t{tol}"] / max(F["brett"], 1)
        ex = lambda tol: 100 * F[f"x{tol}"] / max(F["uhr"], 1)
        print(f"{g:7} {int(F['paare']):5} {int(F['laeufe']):6} {int(F['brett']):6} {int(F['uhr']):6} | "
              f"{tr('250'):8.1f} {ex('250'):6.1f} | {tr('400'):8.1f} {ex('400'):6.1f} | "
              f"{F['kad_abs']/max(F['laeufe'],1):8.3f} {100*F['anz_rel']/max(F['laeufe'],1):7.1f} | "
              f"{F['tp_e']/max(F['n_e'],1):5.2f} {F['tp_w']/max(F['n_w'],1):5.2f} "
              f"{F['s_tp']/max(F['s_e'],1):5.2f} {F['s_tp']/max(F['s_w'],1):5.2f}")
    erg["fahrer"] = {g: dict(F) for g, F in je_fahrer.items()}
    # Laufenden
    print("\nLaufgrenzen Uhr (v3, gespeichert) gegen Brett, Sekunden (Median [P10..P90])")
    erg["enden"] = {}
    for g, en in sorted(alle_enden.items()):
        f = [e for e in en if e.get("gefunden")]
        q = lambda k: np.percentile([e[k] for e in f], [10, 50, 90]) if f else [np.nan] * 3
        sd, ea, eb = q("start_diff"), q("ende_minus_aufsetzen"), q("ende_minus_brettende")
        frueh = sum(1 for e in f if e["ende_minus_aufsetzen"] < 0)
        print(f"{g:7} Brett-Laeufe {len(en):3} gefunden {len(f):3} | Start {sd[1]:+5.1f} [{sd[0]:+5.1f}..{sd[2]:+5.1f}] | "
              f"Ende-Aufsetzen {ea[1]:+5.1f} [{ea[0]:+5.1f}..{ea[2]:+5.1f}] vor Aufsetzen {frueh} | "
              f"Ende-Brettende {eb[1]:+5.1f} [{eb[0]:+5.1f}..{eb[2]:+5.1f}]")
        erg["enden"][g] = {"n": len(en), "gefunden": len(f), "start": list(sd), "ende_aufsetzen": list(ea),
                           "ende_brettende": list(eb), "vor_aufsetzen": frueh}
    print("\nBrett-Gleiten hinter dem Uhr-Laufende: verloren / mit Puffer N s zurueck (gekappt am naechsten Lauf)")
    erg["puffer"] = {}
    for n_s in (0, 1, 2, 3, 4, 5, 8):
        tot = [0.0, 0.0, 0, 0]
        for g, en in alle_enden.items():
            v = puffer_wirkung(en, n_s)
            tot = [x + y for x, y in zip(tot, v)]
        print(f"  N={n_s}: Sekunden verloren {tot[0]:.1f} zurueck {tot[1]:.1f} · Intervalle verloren {tot[2]} zurueck {tot[3]}")
        erg["puffer"][n_s] = tot
    gl_ende = sum(1 for P in paare for L in P["laeufe"] if L["ok"] for x, y in L["gleit"] if abs(y - L["aufsetzen"]) < 100)
    gl_alle = sum(1 for P in paare for L in P["laeufe"] if L["ok"] for _ in L["gleit"])
    print(f"Brett-Gleitphasen, die am Aufsetzen enden: {gl_ende} von {gl_alle}")
    erg["gleit_am_ende"] = [gl_ende, gl_alle]
    (G.AUS / "heute.json").write_text(json.dumps(erg, indent=1, default=float))


if __name__ == "__main__":
    main()
