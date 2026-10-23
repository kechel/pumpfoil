#!/usr/bin/env python3
"""pg-1 bei Foil Scoot (Jan, 24.10.2026) — REIN LESEND, nichts in die DB, pg-1 nur im Speicher erzwungen.

1. Ausrichtung Brett-Handy #16729 (u267, foil_scoot) gegen die Uhr-Kandidaten #16719 und #16708 mit
   scripts/v3/paare_ausrichten.laden()/ausrichten() direkt (paare_finden schliesst Nicht-Pumpfoil-Bretter
   bewusst aus und bleibt unveraendert). Ergebnis nach server/data/ml/pumpgleit/scoot_paar.json.
2. Brett-Wahrheit (Brett-Regeln, gemeinsam.brett_wahrheit) auf die Uhr gelegt, Bewertung wie modell.py:
   heute (Stufe 11) gegen pg-1 (app.analysis.pumpgleit.ableiten, Sportart-Pruefung umgangen).
3. Bestandsvorschau ueber alle Foil-Scoot-Sessions mit Modell-Erkennung (pg-1 erzwungen, trocken).

Aufruf (aus server/): DATABASE_URL=... OMP_NUM_THREADS=1 nice .venv/bin/python ../scripts/pumpgleit/scoot_paar.py
"""
import os
os.environ.setdefault("OMP_NUM_THREADS", "1")
import json
import logging
import pathlib
import sys

import numpy as np

HIER = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HIER))
sys.path.insert(0, str(HIER.parent / "v3"))
import gemeinsam as G
import merkmale as M
import modell as MO

BRETT, UHREN = 16729, (16719, 16708)


def main():
    logging.disable(logging.WARNING)
    import paare_ausrichten as PA3
    from app import models
    from app.analysis import pumpgleit as PG
    db = G.db_lesend()
    out = {"ausrichtung": {}}
    try:
        B = PA3.laden(db, BRETT)
        for u in UHREN:
            U0 = PA3.laden(db, u)
            if U0["mag"].size == 0:
                out["ausrichtung"][u] = {"grund": "Uhr ohne Beschleunigung"}
                print(f"#{u}: ohne Accel, keine Feinausrichtung"); continue
            a = PA3.ausrichten(B, U0)
            out["ausrichtung"][u] = a
            print(f"#{u}: Laeufe {len(B['laeufe'])}/{len(U0['laeufe'])}, Partner {a.get('laeufe_partner')}, "
                  f"fein je Lauf {a.get('fein_je_lauf_ms')}, r {a.get('r_je_lauf')}, Streuung {a.get('streuung_ms')} ms, "
                  f"Versatz {a.get('versatz_ms')}")
        best = min((u for u in UHREN if out["ausrichtung"][u].get("versatz_ms") is not None),
                   key=lambda u: out["ausrichtung"][u].get("streuung_ms") or 1e9)
        a = out["ausrichtung"][best]
        p = {"r_je_lauf": a.get("r_je_lauf"), "streuung_ms": a.get("streuung_ms"), "versatz_ms": a.get("versatz_ms")}
        out["uhr"], out["qualitaet"] = best, G.qualitaet(p)
        vers = float(a["versatz_ms"])
        # Brett-Wahrheit
        BW = G.brett_wahrheit(db, BRETT)
        U = G.uhr_daten(db, best)
        tu, tb = U["t"], BW["t"]
        j = np.clip(np.searchsorted(tb, tu + vers), 0, tb.size - 1)
        drin = (tu + vers >= tb[0]) & (tu + vers <= tb[-1])
        lab = np.where(drin, BW["lab"][j], -1).astype(np.int8)
        laeufe_b = []
        for k in BW["laeufe"]:
            if not k["ok"]:
                lab[(tu >= k["start"] - vers) & (tu <= k["ende"] - vers)] = -1
            laeufe_b.append({"ok": k["ok"], "start": k["start"] - vers, "ende": k["ende"] - vers,
                             "aufsetzen": k["aufsetzen"] - vers, "pumps_tief": [x["tief"] - vers for x in k["pumps"]],
                             "gleit": [[x - vers, y - vers] for x, y in k["gleit"]], "zyklen": k["zyklen"],
                             "schwach": len(k["schwach"])})
        P = {"meta": {"uhr": best, "user": U["user"]}, "laeufe": laeufe_b, "lab": lab, "carve": np.zeros(tu.size, bool),
             "uhr": U}
        laeufe = G.gespeicherte_laeufe(U)
        S = M.signale(U)
        tw, X, _, _ = M.merkmale(S, laeufe, 5.0)
        y, _ = M.ziel(P, tw)
        d = {"P": P, "S": S, "laeufe": laeufe, "tw": tw, "X": X, "y": y}
        lag = json.loads((G.AUS / "heute.json").read_text())["lag_ms"]
        heute = MO.zusammen([MO.bewerten(d, MO.heute_abl(d), lag)])
        abl = PG.ableiten(U, laeufe)
        neu = MO.zusammen([MO.bewerten(d, abl, lag)])
        hin = sum(len(x["hinschauen"]) for x in abl)
        mod = PG.laden()
        out.update({"heute": heute, "neu": neu, "hinschauen": hin,
                    "fahrer_im_training": U["user"] in (mod.get("fahrer") or [2, 13, 244, 574, 683]),
                    "brett": {"laeufe": len(laeufe_b), "ok": sum(1 for L in laeufe_b if L["ok"]),
                              "pumps": sum(len(L["pumps_tief"]) for L in laeufe_b if L["ok"]),
                              "zyklen_ohne_energie": sum(L["schwach"] for L in laeufe_b if L["ok"]),
                              "gleit_n": sum(len(L["gleit"]) for L in laeufe_b if L["ok"]),
                              "gleit_s": round(sum(y - x for L in laeufe_b if L["ok"] for x, y in L["gleit"]) / 1000, 1),
                              "foil_s": round(sum(L["aufsetzen"] - L["start"] for L in laeufe_b if L["ok"]) / 1000, 1),
                              "anteil_pump_fenster": float(np.mean(y[y >= 1] == 2)) if (y >= 1).any() else None}})
        # Takt je Brett-Lauf (Motor oder Pumpen?) und Tempo
        gps = U["gps"]
        je = []
        for L in laeufe_b:
            m = (gps[:, 0] >= L["start"]) & (gps[:, 0] <= L["aufsetzen"])
            v = gps[m, 3]
            w = np.asarray(L["pumps_tief"])
            je.append({"ok": L["ok"], "dauer_s": round((L["aufsetzen"] - L["start"]) / 1000, 1), "pumps": int(w.size),
                       "pumps_pro_min": round(w.size / max((L["aufsetzen"] - L["start"]) / 60000, 1e-3), 1),
                       "zyklen": L["zyklen"], "gleit_s": round(sum(y - x for x, y in L["gleit"]) / 1000, 1),
                       "tempo_kmh_median": round(float(np.nanmedian(v)) * 3.6, 1) if v.size else None})
        out["brett_je_lauf"] = je
        # Bestand: alle Foil-Scoot-Sessions mit Modell-Erkennung, pg-1 erzwungen
        S_, R_ = models.Session, models.AnalysisResult
        ids = [x[0] for x in db.query(S_.id).join(R_, R_.session_id == S_.id)
               .filter(S_.sport_class == "foil_scoot", R_.detection == "model", S_.deleted.isnot(True),
                       S_.merged_into.is_(None)).order_by(S_.id).all()]
        best_ = {"sessions": len(ids), "mit_ergebnis": 0, "p_alt": 0, "p_neu": 0, "gl_alt": 0, "gl_neu": 0,
                 "gs_alt": 0.0, "gs_neu": 0.0, "hin": 0, "hin_sessions": 0, "laeufe": 0, "foil_s": 0.0}
        for sid in ids:
            s = db.get(S_, sid)
            segs = json.loads(s.result.segments_json or "[]")
            n = len((json.loads(s.result.track_geojson or "{}").get("geometry") or {}).get("coordinates") or [])
            try:
                e = PG.segmente_ueberlagern(s, segs, n)
            except Exception:
                e = None
            if e is None:
                continue
            best_["mit_ergebnis"] += 1
            for g_alt, g in zip(segs, e["segments"]):
                if g.get("pumpgleit") != PG.VERSION:
                    continue
                best_["laeufe"] += 1
                best_["foil_s"] += float(g.get("duration_s") or 0)
                best_["p_alt"] += int(g_alt.get("pumps") or 0); best_["p_neu"] += int(g.get("pumps") or 0)
                best_["gl_alt"] += len(g_alt.get("glides") or []); best_["gl_neu"] += len(g.get("glides") or [])
                best_["gs_alt"] += sum(x[2] for x in (g_alt.get("glides") or []))
                best_["gs_neu"] += sum(x[2] for x in (g.get("glides") or []))
            best_["hin"] += len(e["hinschauen"]); best_["hin_sessions"] += 1 if e["hinschauen"] else 0
        out["bestand"] = best_
    finally:
        db.rollback(); db.close()
    (G.AUS / "scoot_paar.json").write_text(json.dumps(out, indent=1, default=float))
    h, n = out["heute"], out["neu"]
    print(f"Uhr #{out['uhr']}, Qualitaet {out['qualitaet']}, Fahrer im Training: {out['fahrer_im_training']}")
    print("Brett:", out["brett"])
    for L in out["brett_je_lauf"]:
        print("  Lauf", L)
    for k in ("pump_treffer", "pump_praez", "anz_fehler_rel", "kad_fehler_hz", "gl_treffer", "gl_praez", "gl_s_treffer",
              "gl_s_praez", "lg_mae", "laeufe", "brett_pumps", "gl_n_brett", "gl_n_erk"):
        print(f"  {k:16} heute {h.get(k)!s:>22}  neu {n.get(k)!s:>22}")
    print("hinschauen neu:", out["hinschauen"])
    print("Bestand:", out["bestand"])


if __name__ == "__main__":
    main()
