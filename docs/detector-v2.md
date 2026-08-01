# Erkennung v2 — Entwurf: Physik abbilden statt annehmen

**Stand: 2026-08-01, Entwurf zur Abnahme.** Nichts davon ist gebaut. v1 bleibt Standard, bis ein
Regressionsvergleich vorliegt und Jan entscheidet.

Auslöser: eine Kette von Befunden, die alle dieselbe Wurzel haben — an mehreren Stellen wird
**angenommen** statt gemessen, und die Annahmen widersprechen sich still.

| Befund | Wurzel |
|---|---|
| Accel-Zeitachse 6 min verschoben (#1328) | Rate geschätzt, obwohl `t0_ms` je Chunk mitgeliefert wird |
| Pump-Zahlen/Gleitphasen falsch in 42 Sessions | dieselbe geschätzte Rate, Abweichung bis Faktor 4 |
| Wasser-Kriterium tot | Overpass sperrt uns aus, Fehlschlag als „kein Wasser" gecacht |
| Drift-Kappung traf echte Läufe | Annahme „Ende ist nie landwärtiger als Start" |
| Autofahrt als Lauf gezählt | Ø-Grenze 25,2 km/h, Zug lag bei 23,3 |
| Meine eigenen Fehlmessungen (Puls, Amplitude) | Fenster auf falscher Zeitachse, Metrik ohne Nachlauf |

## 1. Eine Zeitachse, gemessen

Alles spricht **Millisekunden seit Session-Start**. `started_at` ist der Nullpunkt.

- **GPS:** jedes Sample trägt seinen eigenen Zeitstempel. Das *ist* die Wahrheit — keine Rate nötig.
- **Accel**, in dieser Reihenfolge:
  1. **`t0_ms` je Chunk** (Uhr liefert es; seit 01.08. serverseitig gesichert, `load_accel_t0()`).
     Wear und Apple Watch schicken es heute, Garmin noch nicht.
  2. **aus den Daten gemessene Rate**, wenn (1) fehlt — und nur, wenn die Spur die Session plausibel
     abdeckt.
  3. Die **getaggte Rate ist NIE Wahrheit**, nur Plausibilitätsschranke.
- **Herkunft mitschreiben** (`time_base = exact_chunks | measured_rate | uncertain` + Abweichung).
  Zahlen von einer unsicheren Achse werden **gekennzeichnet**, nicht als exakt ausgegeben.

**Offsets an genau einer Stelle.** `trim_*` und `excluded_ranges` wirken auf die Zeitachse; alles
danach rechnet in Session-Millisekunden. Indizes bleiben intern und werden **nie** als Anker
persistiert. (In v1 tragen Segmente `i_start/i_end` plus auf den Trim re-basierte Zeiten — dieselbe
Falle hat mich zweimal erwischt: beim Aussortieren von #1232 und beim Accel-Fenster von #1328.)

## 2. Fenster-Merkmale statt einer globalen Maske

Raster über die ganze Session: **10-s-Fenster, alle 5 s** (50 % Überlappung). Je Fenster:

- **GPS:** Median-Speed aus Doppler *und* aus der Position, Streuung, Kursänderung/Krümmung,
  Positions-Genauigkeit.
- **Accel:** RMS, dominante Frequenz im Pump-Band (0,7–2,5 Hz) mit **Gipfeligkeit** (Spitze gegen
  Grundrauschen im Band), Bandanteil, Aufteilung senkrecht/waagerecht.
- **Puls:** Median und Steigung.

Daraus ein Label je Fenster (`pumpen | gleiten | ruhe | fremdkraft`). **Läufe entstehen durch
Segmentieren der Label-Folge**, nicht aus einer Sample-Maske. Das macht Übergänge robust und die
Entscheidung nachvollziehbar (je Lauf steht da, welche Fenster ihn tragen).

## 3. Physik als Schranke, nicht als Detektor

- **Vortrieb:** Speed im Band *und* echte Positionsbewegung.
- **Pumpen ist ein Rhythmus:** Gipfel im Band, Amplitude über dem *eigenen* Rauschboden des Nutzers.
  Belegt an synchronen Sessions: Autofahrt RMS 0,037 g gegen Pumpen 1,22 g (Faktor 33) — die
  **Frequenz** trennt nicht (Auto 1,63 Hz, Pumpen 1,54 Hz), die **Wucht** schon.
- **Anstrengung kostet Puls**, mit Nachlauf: Median(2. Laufhälfte bis Ende+30 s) minus Median(90 s
  davor). Gemessen: Autofahrten −1/+4/+13, echte Läufe +26/+35/+57/+70. Nur als **Bestätigung**,
  nie allein — und nur für Läufe ab ~2 min (kürzere kann der Puls physiologisch nicht bewerten).
- **Wasser als Ground Truth, wo verfügbar:** ein Foil-Lauf ist auf dem Wasser. Optional, weil die
  Quelle unzuverlässig ist (von dieser VM antwortet derzeit nur eine Schweiz-Instanz).

## 4. Rahmendaten pro Nutzer

Aus **belegten** Pump-Läufen (menschlich klassifizierte Session, plausible Kadenz, Hin-und-Zurück-
Geometrie) — nicht aus allem, was in der DB steht. Sonst lernt das Profil von unklassifizierten
Wing-Sessions (user 135: 172 von 186 Sessions unbestätigt) und Autofahrten (user 95: Ruhepuls 133
über „Pump"-Puls 120 — Referenz verseucht).

Inhalt je Nutzer: Ruhe- und Antwort-Puls, Accel-Rauschboden und typische Pump-Amplitude/-Frequenz,
typische Geschwindigkeiten, Stammspots — **und ob seine Uhr überhaupt brauchbare Accel/Puls-Daten
liefert**. Fehlt die Referenz für ein Signal, urteilt das System damit nicht (statt selbstbewusst
falsch zu liegen).

## 5. Vorhandene Stellschrauben bleiben

Die persönliche Empfindlichkeit (`foil_sensitivity`: normal | light | attempts) steuert weiter die
Schwellen; Community und Rekorde rechnen immer mit `normal`. v2 darf das nicht umgehen.

## 6. Schalter + Regressionsvergleich

- Flag `DETECTOR_V2` (Env/pro Aufruf), **v1 bleibt Standard**.
- Harness rechnet **beide** Wege je Session im Speicher (kein Schreibzugriff) und stellt Lauf für
  Lauf gegenüber: hinzugekommen, entfallen, zusammengeführt, geteilt; dazu Foil-Zeit, Distanz und
  die Auswirkung auf die Bestenlisten. Vorbild: `<scratchpad>/nachher.py`, das dasselbe gegen den
  Snapshot macht.
- **Die beschrifteten Fälle liegen als Datei vor:** `server/data/ground-truth/runs.json` — von
  Menschen bestätigte Urteile über einzelne Läufe (Jans Sichtung vom 01.08., dazu die Wakethief- und
  Rekord-Fälle), mit Merkmalen und Quelle je Eintrag. Bewusst **nicht im Repo** (das ist öffentlich,
  die Datei verweist auf Nutzer-Sessions), aber unter `server/data/` und damit im täglichen Backup.
  Ohne diese Urteile ist ein Regressionsvergleich nur ein Zahlen-Diff — mit ihnen ist er eine Note.
- **Erst an den beschrifteten Fällen** prüfen, dann über den Bestand:
  Autofahrten #1255/2, #1255/0, #1254/2, #1281/17 · echter Lauf #890/0 (Jans Gegenbeispiel) ·
  Transport #1328 · Wakethief #1232 · Rekord-Läufe #622/7, #1031/2.
- Vor dem Anwenden: Snapshot wie am 31.07. (`server/data/analysis-snapshots/`).

## 7. Reihenfolge

1. Zeitachse v2 + Herkunft (nutzt `t0_ms`, wo vorhanden) — **das ist die Grundlage, alles andere
   hängt daran**.
2. Garmin: `t0_ms` mitschicken. Achtung: Object-Store ist auf 96-KB-Uhren knapp, ein zweiter
   Schlüssel je Chunk verdoppelt die Einträge. Variante ohne Mehrverbrauch: 4-Byte-Kopf im
   vorhandenen Chunk-Wert, den der Uploader abspaltet.
3. Fenster-Merkmale + Label-Folge, gegen v1 vergleichen.
4. Rahmendaten pro Nutzer, aus belegten Läufen.
5. Puls und Wasser als Bestätigung dazu.

## Was NICHT gemacht wird

- Keine stillen Schnitte an Nutzerdaten. Was v2 für Fremdkraft hält, wird **vorgeschlagen**
  (`excluded_ranges` + Ein-Tipp-Rücknahme), nicht entschieden.
- Keine Rohdaten anfassen. Trim und Ausschluss bleiben Fenster-Angaben.
- Keine Schwelle „aus dem Gefühl". Jede Zahl in v2 braucht eine Messung über den Bestand und einen
  Gegenprobe-Fall, so wie die Drift-Regel (Geradheit 0,97 aus 747 Lauf-Enden).
