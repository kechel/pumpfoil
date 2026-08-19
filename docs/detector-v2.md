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
Schwellen. **Sie gilt überall** — die vom Besitzer gewählte Stufe IST seine maßgebliche Auswertung,
Community, Rekorde und Bestenlisten eingeschlossen (so rechnet `run_analysis`, und so ist es am
19.08.2026 von Jan bestätigt worden). Der frühere Satz hier — „Community und Rekorde rechnen immer
mit `normal`" — war falsch und stand wortgleich auch im Hilfetext der App; beides ist berichtigt.

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

## 8. Keim-Rettung — warum es sie gibt und woher jede Zahl kommt (19.08.2026)

**Befund.** Nutzermeldung zu #2430: ein Lauf, den beide Quellen zeigen, fehlte in der Auswertung —
28 s / 94 m bei 11,6 km/h im GPS, dazu sieben Fenster am Stück mit sauberem 2-Hz-Pumprhythmus
(RMS 0,26–0,79 g), unmittelbar hinter einem anerkannten Lauf.

**Ursache, nicht die naheliegende.** Es lag *nicht* an den Geschwindigkeits-Schwellen: die reine
GPS-Segmentierung findet den Lauf auf allen drei Empfindlichkeitsstufen, auch auf „Standard" mit
10 km/h — und der Melder stand ohnehin schon auf der lockersten Stufe. Es lag eine Stufe höher:
sobald Accel vorhanden ist, ist das On-Foil-Modell die **Quelle** des Keims, und es hatte dort
genau **eine** Sekunde gefeuert. `_segments_from_mask` verwirft aber alles unter `min_segment_s`
**bevor** `_extend_starts_back`/`_extend_ends_forward` laufen — der Lauf entstand also gar nicht
erst und konnte nicht mehr wachsen. Zum Vergleich: Lauf 4 derselben Session wurde aus sechs
verstreuten Modell-Sekunden zu 80 s. Das Modell liefert Zündfunken, keine Läufe.

**Die Regel.** Eine zu kurze Modell-Zündung zählt trotzdem als Keim, wenn drei Bedingungen
zusammenkommen (`_rette_keime` in `analysis/detect_v2.py`):

1. Die Strecke zusammenhängender **Foil-Fenster** spannt mindestens `BELEG_MIN_MS` (30 s).
2. Sie enthält mindestens ein **PUMPEN**-Fenster — Rhythmus, nicht bloß Tempo.
3. Das Modell hat darin gefeuert, **aber kürzer als `min_segment_s`**. Reichte sein eigener Keim,
   macht der normale Weg den Lauf ohnehin, und wir fassen nichts an.

Damit bleibt „Physik als Schranke, Modell als Auslöser" (Abschnitt 3) intakt: ohne Modell-Sekunde
passiert nichts, ohne Fenster-Beleg auch nicht. Gegenprobe in derselben Session: eine zweite
Foil-Strecke (20 s, bei 2085 s) bleibt draußen — dort hat das Modell null Mal gefeuert.

**Warum 30 s — und was die Zahl NICHT bedeutet.** Sie ist keine Mindest-Lauflänge. Ein Fenster ist
10 s breit bei 5 s Hop, die Spanne einer Strecke liegt also rund 10 s über der Aktivität darin;
30 s Spanne heißt ~20 s Pumpen. Kurze Läufe werden davon nicht berührt — 31 % aller bereits
erkannten Läufe sind kürzer als 20 s, die entstehen weiter auf dem normalen Weg. Die Schwelle
steuert allein, wie viel unabhängigen Accel-Beleg wir sehen wollen, bevor aus einem einzelnen
Modell-Zucken ein Lauf wird. Gemessen über alle 1609 Sessions mit Accel:

| Beleg-Spanne | Sessions verändert | Läufe dazu | verloren | Foil-Zeit | belegter Fall #2430 |
|---|---|---|---|---|---|
| ≥ 20 s | 99 (6,2 %) | 155 (Median 9 s) | 0 | +0,29 % | gerettet |
| **≥ 30 s** | **7 (0,4 %)** | **8 (Median 20 s)** | **0** | **+0,03 %** | **gerettet** |
| ≥ 45 s | — | — | — | — | **fällt heraus** (seine Strecke spannt 40 s) |

20 s holt überwiegend 5-bis-9-Sekunden-Fragmente mit, 45 s verfehlt den Fall, für den die Regel
existiert. Bei 30 s ändert sich **kein einziger längster oder weitester Lauf einer Session** —
also bewegt sich weder eine persönliche Bestleistung noch ein Rekord, und die globale Bestenliste
(Top 5 nach Dauer und nach Distanz) ist Zeichen für Zeichen dieselbe.

**Zwei durchgerechnete und verworfene Alternativen.**

- *Keim-Mindestlänge einfach auf 1 setzen.* Verschiebt **34 %** aller Sessions und legt **762**
  Läufe dazu (Median 8 s), eine Session springt von 29 auf 57 Läufe. Das wäre eine andere
  Erkennung, keine Fehlerkorrektur.
- *Die Beleg-Strecke IMMER als Keim nehmen*, auch wo das Modell schon genug hatte (Variante C).
  Verlängert bestehende, richtige Läufe um im Median 1 %, im Extremfall 34 %, und verschiebt
  19 % der Sessions statt 0,4 %. Deshalb Bedingung 3: nur retten, nie vergrößern.

**Bekannte Grenze, bewusst offen gelassen.** Von den acht geretteten Läufen stammen zwei (#1619,
#913) aus Strecken, in denen die Position deutlich schneller springt als das Doppler-Signal sagt
(27 bzw. 40 km/h gegen 14 bzw. 24) — GPS-Streuung, ihre Distanzen sind Zitter. Dieses Rauschen
steckt in beiden Sessions schon in den *bestehenden* Läufen; die Regel erzeugt also keine neue
Fehlerart. Ein Zusatzriegel „Strecke muss zu ≥60 % aus Pump-Fenstern bestehen" würde genau #1619
entfernen (40 %) und die übrigen sieben stehen lassen — bewusst **nicht** eingebaut: das ist ein
GPS-Qualitätsthema und gehört als eigener Befund behandelt, statt im Detektor Knöpfe anzuhäufen,
die je einen Einzelfall erschlagen.

**Verifikation des Einbaus.** Der eingebaute Code wurde gegen die vorab gemessene Variante geprüft:
für alle 1609 Sessions Lauf-für-Lauf identische Listen (Start, Ende, Distanz). Reanalysiert werden
mussten nur die sieben veränderten Sessions.

## Was NICHT gemacht wird

- Keine stillen Schnitte an Nutzerdaten. Was v2 für Fremdkraft hält, wird **vorgeschlagen**
  (`excluded_ranges` + Ein-Tipp-Rücknahme), nicht entschieden.
- Keine Rohdaten anfassen. Trim und Ausschluss bleiben Fenster-Angaben.
- Keine Schwelle „aus dem Gefühl". Jede Zahl in v2 braucht eine Messung über den Bestand und einen
  Gegenprobe-Fall, so wie die Drift-Regel (Geradheit 0,97 aus 747 Lauf-Enden).
