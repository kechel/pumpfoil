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
