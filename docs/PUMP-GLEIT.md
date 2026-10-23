# Pump- und Gleit-Erkennung am Handgelenk: ein Modell, gegen das Brett gemessen (23.10.2026, nichts live)

Auftrag (Jan, 23.10.2026): EIN Modell für Pumps UND Gleiten aus dem Uhr-Accel, innerhalb der Läufe von v2/v3,
Wahrheit aus den Brett-Paaren (Brett-Regeln: Pumps mit Energie, Aufsetzen, Gleitzeit). Kapazität an die
Datenmenge angepasst (5 Fahrer), Fahrer herausgehalten bewertet, Puffer am Laufende geprüft. Alles rein
lesend, keine Zeile in der DB, nichts an `server/app/` geändert. Skripte `scripts/pumpgleit/`, Daten
`server/data/ml/pumpgleit/` (nicht im Repo).

## Ablauf

| Schritt | Skript | Ausgabe |
|---|---|---|
| 1 Labels | `labels.py` (Brett-Regeln kopiert + Tiefpunkt je Zyklus, `gemeinsam.je_lauf_erweitert`) | `paare/<uhr>.pkl`, `labels.json` |
| 2+3 heute + Laufenden | `heute.py` (Stufe 11 nachgebaut, trifft die gespeicherten Pumps) | `heute.json` |
| 4 Modell | `modell.py` (Fahrer heraus, Kandidaten, Ablation, Lernkurve, Carve) | `modell.json`, `modell.log`, `modell_gesamt.pkl` |
| 5 Bestand | `korpus.py --jobs 8`, dann `--bericht` | `korpus.jsonl`, `korpus-bericht.txt` |

DB-Zugriff nur über `gemeinsam.db_lesend()` (commit/flush werfen eine Ausnahme). Pools mit `spawn` (OpenMP + fork).

## Wahrheit und Bewertung

- Pump-Ereignis = tiefster Punkt eines Brett-Zyklus mit Energie (GROUND-TRUTH §5); Gegenprobe: Pumps je Lauf =
  gespeicherte Brett-Pumps in allen Läufen. Uhr-Gipfel liegen im Median **−49 ms** daneben (IQR −79..−14), Toleranz ±250 ms.
- Gleiten = Brett-Gleitphasen nach Anzeige-Regel (1,5–15 s, ohne Anlauf, bis Aufsetzen). 60 von 104 enden am Aufsetzen.
- Training/Bewertung nur Paare mit Uhr ≥ 15 Hz und Ausrichtung gut/mittel: 14 Uhr-Sessions, 5 Fahrer
  (u2, u13, u244, u574 nur Wear 1.2.42, u683). Die Wear-Paare < 15 Hz bzw. mit unplausibler Rate sind nur gelistet.
- Kein Brett-Paar hat einen Uhr-Kreisel → Kreisel als Merkmal vorbereitet (NaN), aber nicht lernbar (im Bestand 163 Sessions mit Kreisel).

## Modell

- Merkmale je 0,25-s-Fenster (Raster 25 Hz, 23 Spalten ohne Kreisel): senkrechte Dynamik (RMS 1/2/4 s relativ zum
  Laufmedian, Einbruch, Pumpband-Anteil, Rhythmus/Periode relativ), Querachsen (waagerechter Anteil, Hochfrequenz,
  Neigung der Uhr), GPS (Tempo abs./rel., Tempoänderung, Kursrate), Zeit im Lauf (seit Start, bis Ende).
  Keine Geräte-/Fahrer-Kennung.
- Ziel: aus / gleiten / pumpen (Brett). Gewichte: jede Klasse und jeder Fahrer gleich.
- Ableitung (`merkmale.ableiten`): Pump-Kandidaten wie heute (`find_pumps_cadence`), behalten nur im Zustand
  „pumpen“; Gleitphasen = Zustand „gleiten“ ≥ 1,5 s nach dem ersten Pump; im Puffer endet die Stufe am ersten
  „aus“ ≥ 1 s. Gleit-Schwelle θ auf den Trainingsfahrern gewählt (gesamt 0,70).
- Gewählt **hgb_7** (HistGradientBoosting, 7 Blätter, min_samples_leaf 400, l2 1, 150 Runden): kleinstes Modell
  innerhalb 0,02 der besten Note (Mittel Pump-F1/Gleit-F1, herausgehalten). hgb_15/31 sind nicht besser, haben
  aber Train/Held-out 0,92–0,94 gegen 0,71 (Auswendiglernen).

| herausgehalten, Mittel über 5 Fahrer | Pump F1 | Präz. | Treffer | Anzahl-Fehler je Lauf | Kadenz-Fehler | Gleit-Int. P / R | Gleit-s P / R | längste/Lauf MAE |
|---|---|---|---|---|---|---|---|---|
| heute (Stufe 11) | 0,830 | 0,783 | 0,885 | 17 % | 0,21 Hz | 0,21 / 0,00 | 0,21 / 0,04 | 2,4 s (−2,0) |
| Regel (3 Schwellen) | 0,775 | 0,848 | 0,729 | 17 % | 0,23 Hz | 0,27 / 0,71 | 0,23 / 0,72 | 4,4 s |
| logreg | 0,821 | 0,826 | 0,827 | 16 % | 0,19 Hz | 0,44 / 0,48 | 0,39 / 0,50 | 2,2 s |
| hgb_3 | 0,825 | 0,840 | 0,818 | 15 % | 0,18 Hz | 0,36 / 0,54 | 0,32 / 0,58 | 3,1 s |
| **hgb_7** | **0,844** | 0,838 | 0,852 | **11 %** | **0,14 Hz** | **0,45 / 0,54** | 0,40 / 0,57 | 2,6 s (+1,0) |
| hgb_31 | 0,850 | 0,830 | 0,871 | 10 % | 0,12 Hz | 0,51 / 0,53 | 0,47 / 0,53 | 2,2 s |

Ablation (hgb_7, Note): alle 0,655 · ohne Querachsen 0,653 · ohne GPS 0,614 · ohne Zeit 0,629 · nur senkrecht 0,608 ·
ohne senkrecht 0,540. Lernkurve (Trainingsfahrer 1/2/3/4): Note 0,55 / 0,61 / 0,64 / 0,66 — steigt noch.
Puffer 0 statt 5 s: Gleit-F1 0,42 statt 0,47.

## Laufenden (Puffer)

Uhr-Laufende minus Brett-Aufsetzen (Median): u2 +0,7 s (9 von 21 Läufen VOR dem Aufsetzen, P10 −4,7 s), u13 0,0,
u244 +0,4, u574 +3,3, u683 +7,0. Laufstart Uhr 1–2 s vor dem Brett (u244 +0,9). Brett-Gleiten hinter dem Uhr-Ende:
43 s / 11 Intervalle; Puffer 2 s holt 27 s / 8, 3 s 34 s / 10, **5 s alles**. Vorschlag: nur für die Pump-/Gleit-Stufe
jeden Lauf um 5 s verlängern (am nächsten Laufstart gekappt), Ende am ersten „aus“; Laufgrenzen/Rekorde unverändert.

## Bestand (3990 Sessions detection=model, 33 461 Läufe mit Accel)

Pumpfoil: Pumps −9,1 %, Gleit-Sekunden 21 742 → 83 724 (Gleitanteil 6,7 % der Foil-Zeit, Brett-Paare ~7 %),
Läufe mit Gleiten 27 % → 65 %, längste Gleitphase je Lauf Median 1,3 → 2,0 s, `best_glide_s` Median 1,6 → 4,2 s.
Rekord „längste Gleitphase“: heute #16824 14,85 s; neu mehrere Sessions auf der 15-s-Obergrenze (#14927, #8398,
#1982, #14331, #1245) — die Obergrenze würde zum Rekord.

## Risiken

- 5 Fahrer, 64 Brett-Gleitphasen: die Gleit-Zahlen tragen ±10 Punkte Unsicherheit. Auf den Paaren sagt das Modell
  1,6× so viel Gleitzeit wie das Brett (heute 0,3×).
- Wichtigste Merkmale sind „bis Laufende“/„seit Start“: ein Vorwissen, wo Gleiten liegt (am Ende), keine Messung.
- u2 (größter Fahrer): Pump-F1 0,82 → 0,80 (Treffer 0,86 → 0,77), die übrigen vier besser.
- Andere Sportarten (efoil, foildrive) verlieren ~32 % Pumps — dort gibt es keine Wahrheit.
- Carve: 42 Ereignisse (60 s) in den Trainingspaaren, je Fahrer 3–19; Fenster-AUC herausgehalten 0,79–0,97,
  aber zu wenig für eine eigene Klasse (Ziel ≥ 150 Ereignisse von ≥ 8 Fahrern).

## Vorschau später (Vertrag)

Eingang je Session: Uhr-Accel (Raster wie Stufe 11, `gemeinsam.uhr_daten`), GPS, gespeicherte Läufe (Session-ms).
`merkmale.signale` → `merkmale.merkmale(S, laeufe, puffer_s=5)` → `clf.predict_proba(X[:, sp])` (aus
`modell_gesamt.pkl`: `clf`, `sp`, `theta`, `puffer_s`, `klassen`) → `merkmale.ableiten(..., theta)` liefert je Lauf
`pump_ms`, `gleit` [(Start, Ende) Session-ms], `ende`, `longest`. Für eine Admin-Vorschau (`?pumpgleit=1` analog
`?v3=`) müsste das Modell nach `server/app/analysis/` (mit Jans OK), rein lesend in `get_session`.

## Kontrolle gegen Wahrheiten außerhalb des Trainings (23.10.2026, `kontrolle.py`, `korpus.py --kontrolle`)

Sessions eines Trainingsfahrers wurden mit dem Modell OHNE diesen Fahrer gerechnet.

| Quelle | heute | neu (hgb_7) |
|---|---|---|
| Tap-Pumps #295 (u2, 54 Konsens-Taps, 4 Takes), ±250 ms Treffer/verpasst/extra | 42 / 12 / 12 (54 gezählt) | 34 / 20 / 9 (43) |
| Tap-Pumps #354 (u2, 47 Taps, 5 Takes) | 34 / 13 / 12 (46) | 28 / 19 / 8 (36) |
| Label „glide“ #254 (3 s) | keine Gleitphase, 4 Pumps | 3 s gleiten, 0 Pumps |
| Label „pump“ #479 (39,5 s) | 58 Pumps, keine Gleitphase | 58 Pumps, 86 % pumpen / 3 % gleiten |
| Label-App `run_pumps` u2 (30 Läufe, 1431) | 1767, rel. Fehler 40 % | 1307, rel. Fehler 13 % |
| `run_pumps` u460 (10 lange Läufe, 8674) | 8698, 3,5 % | 8397, 7,2 % |
| `run_pumps` u717 (34 kurze Läufe, 894) | 993, 72 % | 525, 59 % |

Taps: #763 hat keine Accel-Daten, #295 ist (vom Besitzer) gelöscht, die Rohdaten sind noch da. Die Taps liegen auf
der Zuschnitt-Basis (`t_start_ms`), nicht in Session-ms. Labels: 11 der 13 Sessions sind FR55 mit 2,5 Hz oder ohne
Daten. `run_pumps`: der Lauf liegt am ENDE des Label-App-Laps; `start_time + run_duration` (so rechnet
`server/scripts/pump_calibrate.py`) trifft meist das Treiben davor (Lap 2 von 23296854256: Lap ab 0 s, Lauf ab 1296 s).
Hier über das längste `foil_status`-Stück im Lap gesucht (Länge auf 5 s gleich `run_duration`). Die Werte
1,04 / 0,83 aus dem Juli stammen aus dem alten Fenster. `run_pumps` ist der Zähler einer anderen App, also nur ein
Vergleichswert.

Befund: bei den Taps (u2, Juni) zählt heute fast genau, und neu verliert 15–20 % der Pumps. Bei `run_pumps` u2 ist
neu klar besser, bei u460 und u717 nicht eindeutig. Die Trefferquote des neuen Modells hängt am Fahrer.

**Laufende bis zum Ende einer anschließenden Gleitphase verlängern** (höchstens 5 s, Gleitphase beginnt im Lauf,
GPS-Tempo ≥ max(1,4 m/s, 0,5 × Laufmedian), kein Sprung > 2 m/s): Brett-Paare 3 von 58 Läufen um 0,4–0,6 s, keiner
über das Aufsetzen hinaus, Fehler je Fahrer praktisch unverändert (u2 MAE 3,42 → 3,38 s). Bestand: 2882 von 33 461
Läufen (8,6 %), Median +0,6 s, Foil-Zeit +0,5 h von 412 h, Strecke +5,7 km, kein Rekordhalter wechselt (Dauer #2
+0,9 s). Die Uhr-Enden liegen meist schon HINTER dem Aufsetzen (u683 +7 s, u574 +3,3 s); die Verlängerung bringt
fast nichts. Laufstart: Uhr 1–2 s vor dem Brett (u244 +0,9 s), Verlängern wäre falsch, Kürzen nicht untersucht.

**Gleitphasen ≥ 12 s** (Hinweis statt Obergrenze): 209 in 121 Sessions (Pumpfoil 63, 51 Fahrer; efoil 30,
wingfoil 9, foildrive 8, wakethief 7). Bei 166 von 207 nimmt das GPS-Tempo kaum ab (Steigung > −0,05 m/s je s), nur
16 gleiten erkennbar aus (< −0,15). Das spricht in der Regel für Welle, Fremdkraft oder verpasste Pumps, nicht für
echtes Gleiten. Beispiele: #12509, #8398, #1982, #1245 (Pumpfoil), #828, #1231 (efoil), #3235 (wakethief).

**Nicht genutzte Labelquellen:** `foil_status.json` in 134 FIT-Importen (Label-App, je Sekunde auf dem Foil →
Laufende), dazu 40 `original.fit` mit Laps; `analyse/fits` (Mast-Uhr P3/P4, 42 s, 10 Hz); `analyse/ground-truth-
sessions.json` (Nicht-Pumpfoil als Negativbeispiele); `data/ml/laeufe_an_land.json` (146 Läufe an Land) und
`land_urteil_sicht.json` (Negativbeispiele, dort darf es keine Pumps geben); `data/ml/v3/labels_fortsetzung.json`
(9 Sessions langsames Weiterpumpen); `data/wahrheit/manoever.jsonl` (Wing-Halsen, teils mit Zeitpunkten: Carve-
Wahrheit für Wing); 7 Brett-Sessions ohne Uhr (Carve-Definition am Brett); `session_bewertungen` (heute 0 Zeilen).
