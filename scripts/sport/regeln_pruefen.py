#!/usr/bin/env python3
"""Sportart-Regeln ohne KI gegen die Labels messen (Jan, 06.10.2026). REIN LESEND.

Eingabe: die Merkmal-Datei von merkmale.py (`--aus data/ml/sport/merkmale-alle.jsonl`, gitignored —
Sessiondaten und Labels bleiben auf der VM; hier im Repo stehen nur Regeln und Auswertung).

Labels: Urteil eines Menschen (sport_source admin/owner) und — fuer Pumpfoil — der unbestrittene
Standard. Gezaehlt wird JE FAHRER (jeder Fahrer gleich schwer), weil die Wind-/Wellen-Labels von
sehr wenigen Fahrern stammen (06.10.: Wing 671 von 740 aus einem Konto, Welle 2 Fahrer). Dazu
derselbe Lauf ohne den groessten Fahrer, damit keine Regel nur einen Menschen lernt.

Stand 06.10.2026 — Regel v6 (Kuestenabstand + Spot): Pump je Fahrer 97,2 %, Wind 85,5 %, Welle 92,4 %
(u741 90, u798 88, u692 100). v5 ohne Spot: Pump 96,8 %. Vorher, Regel v3 nach Korrektur von 55 falsch einsortierten Wind-Sessions:
Pump je Fahrer 97,8 %, Wind 85,5 % (19 Fahrer), Welle 45,6 % (nur 2 Fahrer; trennt sich mit diesen
Merkmalen nicht von langsamem Pumpen).
Gemessen und VERWORFEN (06.10.): Tempoverlauf im Lauf — Wellenritte fallen nicht ab (abfall -0,02 gegen
Pump +0,04). Zwischen den Laeufen trennt es besser (Welle 42 m / 3,3 km/h zurueck, Pump 18 m / 2,1 km/h),
aber jede Variante, die u741s Wellen von 75 auf 85 % hebt, macht 50+ Pump-Sessions mehr zur Welle — bei
302 Pump- gegen 2 Wellen-Fahrer nicht uebernommen. Durchschnittliche Pumpfrequenz trennt auch nicht
(E-Foil 1,55 Hz, Pumpfoil 1,57 Hz, Wing 1,37 Hz). Alle Kite-/Wellen-Labels sind GPS-only-Importe.
Nach dem dritten Wellen-Fahrer (06.10.) gemessen, NICHT uebernommen — Variante v4 fuer Welle:
  tempo_med >= 13, dauer_med <= 45, anteil_foil <= 0.2, flaeche_km >= 0.05, zw_weg_m >= 30, zw_kmh >= 2.5
  -> Welle je Fahrer 35 -> 64 % (u741 76, u798 54, u692 61), Pump 97,8 -> 96,6 %: 55 Pump-Sessions von
  32 Fahrern werden „Welle", fast alle auf BINNENSEEN (Annet, Senden, Thalwil, Pasohlavky). Welle braucht
  das Meer — das fehlende Merkmal ist die Lage (Abstand zur Kueste), nicht die Bewegung.
Aufruf (aus server/): .venv/bin/python ../scripts/sport/regeln_pruefen.py data/ml/sport/merkmale-alle.jsonl
"""
import collections, json, sys
import numpy as np
import pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2] / "server"))

GRUPPE = {"wingfoil": "wind", "kitefoil": "wind", "parawing": "wind", "surf_wave": "welle", "pumpfoil": "pump"}


# Spot -> {fahrer: Mehrheitsgruppe seiner gelabelten Sessions dort}; von spot_stimmen() gefuellt.
SPOT = {}


def spot_stimmen(lab):
    """Je Spot und Fahrer EINE Stimme (seine haeufigste Gruppe dort) — ein Vielfahrer ueberstimmt nicht
    den ganzen Spot. Ausgewertet wird immer ohne den Fahrer der Session selbst (sonst entschiede die
    Session ueber ihr eigenes Label)."""
    st = collections.defaultdict(collections.Counter)
    for r in lab:
        if r.get("spot"):
            st[(r["spot"], r["nutzer"])][GRUPPE[r["klasse"]]] += 1
    SPOT.clear()
    for (p, u), c in st.items():
        SPOT.setdefault(p, {})[u] = c.most_common(1)[0][0]


def regel(r):
    """v6 (06.10.2026) = v5 + Spot: sagt v5 „Welle", aber mindestens 2 ANDERE Fahrer am selben Spot
    und davon >= 80 % Pumper, ist es Pump (Hafenbecken: Barcelona Forum). NUR fuer Welle — fuer Wind
    gemessen und verworfen: Wing und Pump teilen sich viele Seen, Wind fiel von 85,5 auf 78,8 %.
    Der Rueckweg (Pump -> Wind/Welle an Wind-/Wellen-Spots) aendert nichts.
    Ebenfalls gemessen, NICHT uebernommen: Wind-Zweig „weiter Weg zwischen den Laeufen" (zw_weg_m >= 50,
    flaeche_km >= 0.4, tempo_med >= 13) — Wind 85,5 -> 91,9 %, Pump 97,2 -> 96,4 %; von 25 neuen
    Pump->Wind-Treffern sind nur ~7 echte Wind-Sessions, der Rest Pumper mit langem Rueckweg am Ufer.
    Leichtwind-Zweig (Foil-Anteil + Flaeche bei niedrigem Tempo) ebenso: Wind +2..5, Pump -0,4..1,4.
    Ein Laufzeit-Deckel fuer Wellen (zw_weg_m <= 100) kostet Welle 92 -> 76 %."""
    g = regel_v5(r)
    if g == "welle":
        andere = [x for u, x in SPOT.get(r.get("spot"), {}).items() if u != r["nutzer"]]
        if len(andere) >= 2 and andere.count("pump") / len(andere) >= 0.8:
            return "pump"
    return g


def regel_v5(r):
    """Die Regel selbst steht in server/app/analysis/sportregel.py (EINE Quelle fuer Server und Messung;
    Abgleich 06.10.2026: 600 von 600 Sessions gleich). Beschreibung dort."""
    from app.analysis.sportregel import regel_v5 as server_regel
    return server_regel(r)


def labels(rows):
    return [r for r in rows if r.get("qualitaet") == "ok" and r.get("laeufe", 0) >= 3 and GRUPPE.get(r.get("klasse"))
            and (r["quelle"] in ("admin", "owner") or (r["klasse"] == "pumpfoil" and r["quelle"] == "default"))]


def auswerten(rs, titel):
    per = collections.defaultdict(list)
    for r in rs:
        per[(GRUPPE[r["klasse"]], r["nutzer"])].append(regel(r) == GRUPPE[r["klasse"]])
    print(titel)
    for g in ("pump", "wind", "welle"):
        q = [np.mean(v) for (gg, _), v in per.items() if gg == g]
        alle = [x for (gg, _), v in per.items() if gg == g for x in v]
        if q:
            print(f"  {g:6s} Fahrer {len(q):3d} Sessions {len(alle):5d}  je Fahrer {np.mean(q)*100:5.1f} %  "
                  f"je Session {np.mean(alle)*100:5.1f} %")
    fehl = collections.Counter((GRUPPE[r["klasse"]], regel(r)) for r in rs)
    print("  Verwechslungen:", {f"{a}->{b}": n for (a, b), n in fehl.items() if a != b})


if __name__ == "__main__":
    rows = [json.loads(l) for l in open(sys.argv[1], encoding="utf-8")]
    lab = labels(rows)
    spot_stimmen(lab)
    auswerten(lab, "alle Labels")
    groesster = collections.Counter(r["nutzer"] for r in lab if GRUPPE[r["klasse"]] != "pump").most_common(1)[0][0]
    auswerten([r for r in lab if r["nutzer"] != groesster], "ohne den groessten Wind-/Wellen-Fahrer")
