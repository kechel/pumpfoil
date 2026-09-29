#!/usr/bin/env python3
"""Erkennung v3, Phase 1: Messwerkzeug. Vermisst EIN Erkennungs-Ergebnis gegen den Label-Satz.

REIN LESEND. Liest ein Ergebnis im Format von `detektor-v3-phase0.py` (baseline-*.json.gz oder
spaeter die v3-Ausgabe), den Label-Satz und — fuer die GPS-Kennzahlen — die gespeicherten
Rohdaten. Schreibt nur einen Bericht nach server/data/ml/.

Die Kennzahlen (s. docs/DETECTION-V3.md):
  A  Sportart Pumpfoil ja/nein gegen menschlich gesetzte Sportarten
  B  Laeufe in Bereichen, die Nutzer aussortiert haben          (falsch erkannt, Obergrenze)
  C  von Nutzern zurueckgeholte Laeufe, die fehlen             (verpasst)
  D  menschlich markierte Pump-Bereiche, die kein Lauf abdeckt (verpasst)
  E  Einzel-Urteile runs.json                                  (beides)
  F  Laeufe direkt an einer Autofahrt                          (falsch erkannt, maschinell)
  G  Uhr gegen Handy am Brett: Lauf-Treffer und Pump-Verhaeltnis je Fahrer
  H  Pump-Tipps gegen gezaehlte Pumps
  I  Empfindlichkeits-Gruppen
  J  Summen je Geraetefamilie

Aufruf (aus server/):
  DATABASE_URL=... .venv/bin/python ../scripts/detektor-v3-messen.py \
      [--ergebnis data/ml/baseline-2026-09-29.json.gz] [--labels data/ml/labels-2026-09-29.json.gz] \
      [--name baseline]
"""
import argparse
import collections
import gzip
import json
import math
import pathlib
import statistics as st
import sys

import numpy as np

WURZEL = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WURZEL / "server"))
ML = WURZEL / "server" / "data" / "ml"

AUTO_V = 40 / 3.6      # darueber faehrt niemand Foil aus eigener Kraft
AUTO_S = 20            # so lange am Stueck, damit GPS-Ausreisser nicht zaehlen
AUTO_NAH_S = 60        # ein Lauf so nah an einer Autofahrt ist keiner
PAAR_TOL_S = 10        # Lauf-Partner Uhr/Brett: Start UND Ende innerhalb


def laden(p):
    with gzip.open(p) as f:
        return json.load(f)


def familie(m):
    m = m or ""
    if "Wear OS" in m:
        return "wear"
    if m.startswith("Watch"):
        return "apple_watch"
    if m.startswith("iPhone"):
        return "iphone"
    if "Android" in m:
        return "android_phone"
    if not m:
        return "garmin/import"
    return "andere"


def ueberlappung(a0, a1, b0, b1):
    return max(0.0, min(a1, b1) - max(a0, b0))


def abgedeckt(t0, t1, runs):
    """Anteil von [t0, t1], der von Laeufen abgedeckt ist."""
    if t1 <= t0:
        return 0.0
    return min(1.0, sum(ueberlappung(t0, t1, r["t0"], r["t1"]) for r in runs) / (t1 - t0))


def pumpfoil_vorhersage(s):
    """Ja/Nein der ERKENNUNG. v3 schreibt `sport_pred`; fuer v2 zaehlt das sportauto-Urteil."""
    if "sport_pred" in s:
        return s["sport_pred"] == "pumpfoil"
    return s.get("sport_auto") is None


def autostrecken(sessions):
    """Autofahrten je Session aus den gespeicherten GPS-Daten. Zwischengespeichert, weil teuer."""
    cache = ML / "autostrecken.json"
    if cache.exists():
        return {int(k): v for k, v in json.loads(cache.read_text()).items()}
    from app import storage
    aus = {}
    for s in sessions:
        if not s["runs"] or not s.get("uuid"):
            continue
        try:
            g = np.asarray(storage.load_gps(s["uuid"]), dtype=float)
        except Exception:
            continue
        if g.ndim != 2 or len(g) < 30:
            continue
        t, v = g[:, 0], np.nan_to_num(g[:, 3])
        schnell = v > AUTO_V
        strecken, i = [], 0
        while i < len(t):
            if schnell[i]:
                j = i
                while j + 1 < len(t) and schnell[j + 1] and t[j + 1] - t[j] <= 5000:
                    j += 1
                if (t[j] - t[i]) / 1000 >= AUTO_S:
                    strecken.append([float(t[i]), float(t[j])])
                i = j + 1
            else:
                i += 1
        if strecken:
            aus[s["id"]] = strecken
    cache.write_text(json.dumps(aus))
    return aus


def paare(sessions):
    """Handy am Brett + zweites Geraet derselben Fahrt (GROUND-TRUTH.md §12b)."""
    from datetime import datetime
    def ts(x):
        return datetime.fromisoformat(x).timestamp() if x else None
    brett = [s for s in sessions if s.get("placement") == "board" and s["runs"]]
    andere = [s for s in sessions if s.get("placement") != "board" and s["runs"] and s["ended_at"]]
    out = []
    for b in brett:
        b0, b1 = ts(b["started_at"]), ts(b["ended_at"])
        if b1 is None:
            continue
        for u in andere:
            u0, u1 = ts(u["started_at"]), ts(u["ended_at"])
            ov = min(b1, u1) - max(b0, u0)
            kurz = min(b1 - b0, u1 - u0)
            if kurz <= 0 or ov / kurz < 0.5 or u["device_id"] == b["device_id"]:
                continue
            # Nur DERSELBE Fahrer: bei Gruppenfahrten liegen fremde Uhren am selben Ort (u5 am
            # 23.09. mit dem Handy am Brett, Jans Uhr daneben). #10248 gehoert inzwischen u13.
            if u["user_id"] != b["user_id"]:
                continue
            (la, lo), (lb, lob) = b.get("place") or (None, None), u.get("place") or (None, None)
            if None in (la, lb):
                continue
            km = math.hypot((la - lb) * 111, (lo - lob) * 111 * math.cos(math.radians(la)))
            if km > 0.2:
                continue
            out.append((b, u, (u0 - b0) * 1000.0))   # Versatz Session-Nullpunkte in ms
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ergebnis", default=str(ML / "baseline-2026-09-29.json.gz"))
    ap.add_argument("--labels", default=str(ML / "labels-2026-09-29.json.gz"))
    ap.add_argument("--name", default="baseline")
    a = ap.parse_args()
    S = laden(a.ergebnis)
    L = laden(a.labels)
    by = {s["id"]: s for s in S}
    R = {"name": a.name, "ergebnis": a.ergebnis}
    zeilen = []
    def p(x=""):
        zeilen.append(x); print(x)

    p(f"=== Messung: {a.name} ===")
    # --- A Sportart -------------------------------------------------------------------
    wahr = {}
    for x in L["sportart_je_session"]:
        if x["vertrauen"] == "mensch":
            wahr[x["session"]] = x["sport"]
    for x in L["pumpfoil_override"]:
        wahr.setdefault(x["session"], "pumpfoil" if x["pumpfoil"] else "nicht_pumpfoil")
    tab = collections.Counter()
    je_sport = collections.defaultdict(lambda: [0, 0])
    for sid, sp in wahr.items():
        s = by.get(sid)
        if not s or not s["runs"]:
            continue
        ist = sp == "pumpfoil"
        vor = pumpfoil_vorhersage(s)
        tab[(ist, vor)] += 1
        je_sport[sp][0] += 1
        je_sport[sp][1] += (vor == ist)
    p("\nA  Sportart Pumpfoil ja/nein (menschlich gesetzt, Sessions mit Laeufen)")
    p(f"   Pumpfoil richtig {tab[(True, True)]}, als nicht-Pumpfoil {tab[(True, False)]} · "
      f"andere Sportart richtig {tab[(False, False)]}, als Pumpfoil {tab[(False, True)]}")
    for sp, (n, ok) in sorted(je_sport.items(), key=lambda kv: -kv[1][0]):
        p(f"   {sp:16s} {ok:4d}/{n:<4d} richtig")
    R["A"] = {"tab": {f"{k[0]}-{k[1]}": v for k, v in tab.items()},
              "je_sport": {k: v for k, v in je_sport.items()}}

    # --- B aussortiert -------------------------------------------------------------------
    fp_s = gesamt_s = 0.0
    fp_laeufe = 0
    for x in L["nutzer_aussortiert"]:
        s = by.get(x["session"])
        if not s:
            continue
        for t0, t1 in x["bereiche"]:
            gesamt_s += (t1 - t0) / 1000
            fp_s += abgedeckt(t0, t1, s["runs"]) * (t1 - t0) / 1000
        for r in s["runs"]:
            dauer = max(1, r["t1"] - r["t0"])
            if sum(ueberlappung(r["t0"], r["t1"], b0, b1) for b0, b1 in x["bereiche"]) / dauer >= 0.5:
                fp_laeufe += 1
    p(f"\nB  Von Nutzern aussortierte Bereiche: {gesamt_s / 60:.0f} min, davon als Lauf erkannt "
      f"{fp_s / 60:.0f} min · Laeufe zu >= 50 % darin: {fp_laeufe}")
    R["B"] = {"aussortiert_min": gesamt_s / 60, "als_lauf_min": fp_s / 60, "laeufe": fp_laeufe}

    # --- C zurueckgeholt ------------------------------------------------------------------
    n = ok = 0
    for x in L["nutzer_zurueckgeholt"]:
        s = by.get(x["session"])
        if not s:
            continue
        for t0, t1 in x["bereiche"]:
            n += 1
            ok += abgedeckt(t0, t1, s["runs"]) >= 0.5
    p(f"\nC  Zurueckgeholte Laeufe (Nutzer: \"der zaehlt\"): {ok}/{n} zu >= 50 % als Lauf da")
    R["C"] = {"n": n, "da": ok}

    # --- D Pump-Bereiche ------------------------------------------------------------------
    n = ok = 0
    for x in L["bereiche_labels_tabelle"]:
        s = by.get(x["session"])
        if not s or x["label"] != "pump":
            continue
        n += 1
        ok += abgedeckt(x["t0"], x["t1"], s["runs"]) >= 0.5
    p(f"\nD  Menschlich markierte Pump-Bereiche: {ok}/{n} zu >= 50 % in einem Lauf")
    R["D"] = {"n": n, "da": ok}

    # --- E runs.json ----------------------------------------------------------------------
    p("\nE  Einzel-Urteile (runs.json)")
    e_ok = e_n = 0
    for x in L["laeufe_runs_json"]:
        s = by.get(x["session"])
        if not s or "t_start_ms" not in x:
            continue
        dek = abgedeckt(x["t_start_ms"], x["t_end_ms"], s["runs"])
        soll = x["urteil"] == "echt"
        e_n += 1
        e_ok += (dek >= 0.5) == soll
        p(f"   #{x['session']} {x['urteil']:10s} {x.get('art', ''):16s} abgedeckt {dek:4.0%} "
          f"{'ok' if (dek >= 0.5) == soll else 'FALSCH'}")
    if e_n == 0:
        p("   (keine Zeitangaben in runs.json — nur Merkmale)")
    R["E"] = {"n": e_n, "ok": e_ok}

    # --- F Autofahrt ----------------------------------------------------------------------
    auto = autostrecken(S)
    f_laeufe, f_sess = 0, set()
    for sid, strecken in auto.items():
        s = by.get(sid)
        if not s or (s.get("sport_class") or "pumpfoil") != "pumpfoil":
            continue
        for r in s["runs"]:
            for c0, c1 in strecken:
                if (0 <= (c0 - r["t1"]) / 1000 <= AUTO_NAH_S or 0 <= (r["t0"] - c1) / 1000 <= AUTO_NAH_S
                        or (r["t0"] < c1 and r["t1"] > c0)):
                    f_laeufe += 1
                    f_sess.add(sid)
                    break
    p(f"\nF  Laeufe <= {AUTO_NAH_S} s an einer Autofahrt (Pumpfoil-Sessions): {f_laeufe} in "
      f"{len(f_sess)} Sessions")
    R["F"] = {"laeufe": f_laeufe, "sessions": len(f_sess)}

    # --- G Uhr gegen Brett ----------------------------------------------------------------
    p("\nG  Uhr/zweites Geraet gegen Handy am Brett (Brett = Wahrheit fuer Lauf und Pumps)")
    je_fahrer = collections.defaultdict(lambda: {"brett": 0, "treffer": 0, "extra": 0, "quot": []})
    for b, u, versatz in paare(S):
        brett_l = b["runs"]
        uhr_l = [{**r, "t0": r["t0"] + versatz, "t1": r["t1"] + versatz} for r in u["runs"]]
        # Versatz der Uhren fein: Median der naechsten Starts
        d = []
        for r in brett_l:
            nah = min(uhr_l, key=lambda q: abs(q["t0"] - r["t0"]))
            if abs(nah["t0"] - r["t0"]) < 30000:
                d.append(nah["t0"] - r["t0"])
        fein = st.median(d) if d else 0
        uhr_l = [{**r, "t0": r["t0"] - fein, "t1": r["t1"] - fein} for r in uhr_l]
        k = f"u{u['user_id']}"
        g = je_fahrer[k]
        benutzt = set()
        for r in brett_l:
            g["brett"] += 1
            for i, q in enumerate(uhr_l):
                if i in benutzt:
                    continue
                if abs(q["t0"] - r["t0"]) <= PAAR_TOL_S * 1000 and abs(q["t1"] - r["t1"]) <= PAAR_TOL_S * 1000:
                    g["treffer"] += 1
                    benutzt.add(i)
                    if r.get("pumps") and q.get("pumps") is not None:
                        g["quot"].append(q["pumps"] / r["pumps"])
                    break
        g["extra"] += len(uhr_l) - len(benutzt)
    for k, g in sorted(je_fahrer.items()):
        q = f"Pumps Uhr/Brett Median {st.median(g['quot']):.2f} (n={len(g['quot'])})" if g["quot"] else ""
        p(f"   {k}: Brett-Laeufe {g['brett']}, davon auf der Uhr {g['treffer']}, Uhr-Laeufe ohne "
          f"Brett-Partner {g['extra']} · {q}")
    R["G"] = {k: {**v} for k, v in je_fahrer.items()}

    # --- H Pump-Tipps ---------------------------------------------------------------------
    p("\nH  Pump-Tipps gegen gezaehlte Pumps")
    tipps = collections.defaultdict(list)
    for x in L["pump_tipps"]:
        tipps[x["session"]].append(x["t_ms"])
    for sid, ts in sorted(tipps.items()):
        s = by.get(sid)
        if not s:
            continue
        for r in s["runs"]:
            n_t = sum(1 for t in ts if r["t0"] <= t <= r["t1"])
            if n_t:
                p(f"   #{sid} Lauf {r['t0'] / 1000:.0f}-{r['t1'] / 1000:.0f} s: getippt {n_t}, "
                  f"gezaehlt {r.get('pumps')}")
    # --- I Empfindlichkeit ----------------------------------------------------------------
    p("\nI  Empfindlichkeit (Profil): Laeufe je Session unter 'normal' gegen die eigene Einstellung")
    for grp in ("normal", "light", "attempts"):
        ss = [s for s in S if s.get("sensitivity") == grp and s["runs"] is not None
              and s.get("andere_empfindlichkeit")]
        if not ss:
            continue
        eig = [len(s["runs"]) for s in ss]
        nor = [(s["andere_empfindlichkeit"].get("normal") or {}).get("num_runs") for s in ss]
        nor = [x for x in nor if x is not None]
        kurz = sum(1 for s in ss for r in s["runs"] if (r.get("dur_s") or 0) < 8)
        p(f"   {grp:9s} Sessions {len(ss):5d} · Laeufe Median {st.median(eig):.0f} (unter normal "
          f"{st.median(nor) if nor else float('nan'):.0f}) · Laeufe < 8 s: {kurz}")

    # --- K foil_status der anderen App (unabhaengig, je Sekunde) ------------------------------
    import glob as _glob
    tp = fp = fn = 0
    for s in S:
        f = WURZEL / "server" / "data" / (s.get("uuid") or "_") / "foil_status.json"
        if not s.get("uuid") or not f.exists():
            continue
        from app import storage
        try:
            g = storage.load_gps(s["uuid"])
        except Exception:
            continue
        fs = json.loads(f.read_text())
        if len(fs) != len(g):
            continue
        t = np.array([x[0] for x in g], dtype=float)
        drin = np.zeros(t.size, bool)
        for r in s["runs"]:
            drin |= (t >= r["t0"]) & (t <= r["t1"])
        wahr = np.asarray(fs) >= 0.5
        tp += int((drin & wahr).sum()); fp += int((drin & ~wahr).sum()); fn += int((~drin & wahr).sum())
    if tp + fp + fn:
        p(f"\nK  Gegen foil_status der anderen App (je Sekunde): Praezision {tp / max(tp + fp, 1):.3f}, "
          f"Trefferquote {tp / max(tp + fn, 1):.3f} ({tp + fn} s auf dem Foil)")
    R["K"] = {"tp": tp, "fp": fp, "fn": fn}

    # --- L Sichtpruefung Laeufe an Land ----------------------------------------------------
    sp = ML / "land_urteil_sicht.json"
    if sp.exists():
        sicht = json.loads(sp.read_text())
        rot = {}
        for x in json.loads((ML / "laeufe_an_land.json").read_text()):
            rot.setdefault(x[0], []).append((x[3], x[4]))
        land_da = land_n = wasser_da = wasser_n = 0
        for sid, bereiche in rot.items():
            s = by.get(sid)
            if not s:
                continue
            for b0, b1 in bereiche:
                dek = abgedeckt(b0, b1, s["runs"]) >= 0.5
                if sid in sicht["land"]:
                    land_n += 1; land_da += dek
                elif sid in sicht["wasser"]:
                    wasser_n += 1; wasser_da += dek
        p(f"\nL  Sichtpruefung: Laeufe AN LAND noch als Lauf da {land_da}/{land_n} (soll 0) · "
          f"Laeufe auf schmalem Wasser da {wasser_da}/{wasser_n} (soll alle)")
        R["L"] = {"land_da": land_da, "land_n": land_n, "wasser_da": wasser_da, "wasser_n": wasser_n}

    # --- M feste Pruefliste ---------------------------------------------------------------
    tp_ = ML / "testfaelle.json"
    if tp_.exists():
        p("\nM  Feste Pruefliste (testfaelle.json)")
        ok_n = n_n = 0
        base = {x["id"]: x for x in laden(sorted(ML.glob("baseline-*.json.gz"))[-1])}
        for fall in json.loads(tp_.read_text())["faelle"]:
            s = by.get(fall["session"])
            if not s:
                p(f"   #{fall['session']}: nicht im Ergebnis"); continue
            if fall.get("alle_laeufe"):
                ref = base[fall["session"]]["runs"]
                da = sum(abgedeckt(r["t0"], r["t1"], s["runs"]) >= 0.5 for r in ref)
                ok = da == len(ref)
                txt = f"{da}/{len(ref)} der heutigen Laeufe da"
            else:
                dek = abgedeckt(fall["t0"], fall["t1"], s["runs"])
                ok = (dek >= 0.5) == (fall["soll"] == "lauf")
                txt = f"abgedeckt {dek:.0%}"
            n_n += 1; ok_n += ok
            p(f"   {'ok    ' if ok else 'FALSCH'} #{fall['session']} soll {fall['soll']:9s} {txt} — {fall['warum']}")
        p(f"   {ok_n}/{n_n} erfuellt")
        R["M"] = {"ok": ok_n, "n": n_n}
    # --- J Summen ------------------------------------------------------------------------
    p("\nJ  Summen je Geraetefamilie (nur Sessions mit Laeufen)")
    fam = collections.defaultdict(lambda: [0, 0, 0.0, 0.0])
    for s in S:
        if not s["runs"]:
            continue
        f = fam[familie(s.get("device_model"))]
        f[0] += 1
        f[1] += len(s["runs"])
        f[2] += sum((r.get("dur_s") or 0) for r in s["runs"]) / 3600
        f[3] += sum((r.get("dist_m") or 0) for r in s["runs"]) / 1000
    for k, (ns, nl, h, km) in sorted(fam.items(), key=lambda kv: -kv[1][0]):
        p(f"   {k:14s} Sessions {ns:5d} · Laeufe {nl:6d} · {h:6.1f} h · {km:7.1f} km")
    R["J"] = {k: v for k, v in fam.items()}

    (ML / f"messung-{a.name}.json").write_text(json.dumps(R, default=str, indent=1))
    (ML / f"messung-{a.name}.txt").write_text("\n".join(zeilen) + "\n")


if __name__ == "__main__":
    main()
