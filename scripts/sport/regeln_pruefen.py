#!/usr/bin/env python3
"""Sportart-Regeln ohne KI gegen die Labels messen (Jan, 06.10.2026). REIN LESEND.

Eingabe: die Merkmal-Datei von merkmale.py (`--aus data/ml/sport/merkmale-alle.jsonl`, gitignored —
Sessiondaten und Labels bleiben auf der VM; hier im Repo stehen nur Regeln und Auswertung).

Labels: Urteil eines Menschen (sport_source admin/owner) und — fuer Pumpfoil — der unbestrittene
Standard. Gezaehlt wird JE FAHRER (jeder Fahrer gleich schwer), weil die Wind-/Wellen-Labels von
sehr wenigen Fahrern stammen (06.10.: Wing 671 von 740 aus einem Konto, Welle 2 Fahrer). Dazu
derselbe Lauf ohne den groessten Fahrer, damit keine Regel nur einen Menschen lernt.

Stand 06.10.2026, Regel v3 nach Korrektur von 55 falsch einsortierten Wind-Sessions:
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

GRUPPE = {"wingfoil": "wind", "kitefoil": "wind", "parawing": "wind", "surf_wave": "welle", "pumpfoil": "pump"}


def regel(r):
    """v3: Wind = schnell UND lange Laeufe, oder viel Zeit auf dem Foil ueber eine grosse Flaeche bei
    mindestens 15 km/h (darunter: Langstrecken-Pumper, Annecy/Prevessin/Spiez); Welle = kurze schnelle
    Ritte bei wenig Foil-Zeit UND verteilten Startpunkten (Line-up) — alle Starts an einem Fleck ist
    der Steg, das sind schnelle Pumper (Illmensee, Senden, Pasohlavky: 15-16 km/h); sonst Pump."""
    v = r.get("tempo_med", 0); d = r.get("dauer_med", 0)
    a = r.get("anteil_foil", 0); fl = r.get("flaeche_km", 0)
    if (v >= 17 and d >= 60) or (a >= 0.3 and fl >= 0.4 and v >= 15):
        return "wind"
    if v >= 15 and d <= 30 and a <= 0.2 and fl >= 0.05:
        return "welle"
    return "pump"


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
    auswerten(lab, "alle Labels")
    groesster = collections.Counter(r["nutzer"] for r in lab if GRUPPE[r["klasse"]] != "pump").most_common(1)[0][0]
    auswerten([r for r in lab if r["nutzer"] != groesster], "ohne den groessten Wind-/Wellen-Fahrer")
