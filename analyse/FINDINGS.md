# Findings — Foil-Mast-IMU vs. Wrist (2026-06-27)

Daten: 5 Paare, davon ein „kein Foiling" (P2). **P3 (20:26)** ist das einzige Paar, bei
dem die Mast-Uhr den **vollen Foiling-Lauf** mitschnitt (42 s Überlapp); P5 nur 13 s
partiell. Bei P1/P4 hörte der Mast-Accel **vor** dem Foiling auf → Object-Store-
Abbruch (s. u.). Tiefenanalyse daher auf **P3** (fenix #309 / FR55 #314).

## 1. Zeit-Sync gelöst (ohne GPS)
UUID-Präfix = Unix-Startzeit der Uhr; beide Uhren clock-synchron → Accel-Streams absolut
ausrichtbar auf <1 s. Kein Aufprall-Spike nötig. (`lib.accel_abs_t`)

## 2. Mast ≠ „sauberere Wrist" — es misst etwas **anderes**
Die Ausgangshypothese (Mast liefert die saubereren Pumps) ist **so nicht bestätigt**:

| Größe (Foiling-Fenster) | Wrist (fenix) | Mast (FR55) |
|---|---|---|
| Heave-RMS (vertikal, dyn.) | **1.05 g** | **0.06 g** |
| dominante Frequenz | 1.50 Hz (90/min) | 0.4–0.9 Hz, breit |
| Kippwinkel-RMS | – (arm-confounded) | Pitch 14.6°, Roll 12.2° |

- **Wrist** = Arm-Pumpbewegung, sehr energiereich, scharfer 1,5-Hz-Peak. Gut für **Kadenz**.
- **Mast unter Wasser** = stark **wasserdämpft** (Heave 18× kleiner!), kaum Hochfrequenz.
  Dafür misst er die **Foil-Lage** (Pitch/Roll), die das Handgelenk **gar nicht** sieht.
- **Kohärenz** Wrist↔Mast im Pump-Band nur **0,36** → die beiden Uhren messen
  überwiegend **verschiedene physikalische Größen**, nicht dasselbe Signal sauberer/unsauberer.

→ **Wrist = Kadenz-Sensor, Mast = Lage-/Technik-Sensor. Komplementär.** (Plots 02, 03)

## 3. Mast erkennt Foiling glasklar (Regime-Detektor)
Über die ganze Aufnahme (Plot 04):

| Phase | Tilt-RMS | Heave-RMS |
|---|---|---|
| Anpumpen/Takeoff (vor GPS-Foiling) | 15.9° | **0.256 g** |
| **Foiling** | 9.4° | **0.059 g** |
| Setup/Handling | (Ausreißer >100°) | – |

Beim Abheben fällt die Heave-RMS um **~4×** und die Lage wird ruhiger. Der Mast
unterscheidet „fliegt" vs. „pflügt/pumpt an" **ohne GPS** — potenziell ein besserer
Foiling-Detektor als Wrist-GPS (das unter Wasser ohnehin tot ist).

## 4. Jans Pitch-Pump-Modell — qualitativ sichtbar, noch nicht sauber quantifizierbar
Modell: Board mit den Beinen kippen → Foil pitcht über den 85-cm-Mast-Hebel fore/aft;
runterdrücken → Nase runter (Vortrieb), leicht werden → Nase hoch (steigen). Erwartung:
Pitch oszilliert ~1×/Pump-Zyklus, phasengekoppelt an die vertikale Last (Heave). (Plot 05)

- **Bestätigt:** der Mast pitcht real & kräftig (**±15° RMS**), Lage-Oszillation klar vorhanden.
- **Phase Heave→Pitch ≈ −53°** — Pitch und vertikale Last sind gekoppelt und laufen in der
  vom Modell erwarteten Richtung, aber **nicht** als sauberer 0°/180°-Limit-Zyklus.
- **Limit:** 10 Hz (Lite-Modus) + nur 42 s + Wasserdämpfung → die Propulsions-Kadenz lässt
  sich **nicht eindeutig** von der langsamen Lage-Drift trennen (dominante Energie <0,5 Hz,
  Anisotropie nur 1,3× → Rocking nicht rein fore/aft). Für den sauberen Nachweis fehlt
  Auflösung.

## Konsequenzen fürs nächste Field-Test
1. **FR55 in FULL (25 Hz)** aufzeichnen, nicht „Sparsam"/Lite (10 Hz) — Philipps Konto umstellen.
2. **Object-Store-Abbruch fixen**: der Mast-Accel bricht mitten im Lauf ab (P1/P4 ganz
   vor dem Foiling). Ursache = voller CIQ-Store → `setValue` wirft, Chunk wird verworfen
   (1.0.37 fängt nur ab, rettet die Daten aber nicht). → vor Session-Start syncen/Store leeren,
   oder Ring-Puffer. Sonst verlieren wir genau das Foiling-Fenster.
3. **Längere, saubere Foiling-Strecken** (1 langer Lauf) für Kadenz/Phasen-Statistik.
4. Mit 25 Hz + vollem Lauf: Pitch-Pump-Phase, Mastbiegung (Board-Uhr − Foil-Uhr, Konfig B
   mit zweiter Deck-Uhr) und AoA-Oszillation werden quantifizierbar.

## NACHTRAG — FIT-Daten (beide Uhren voll, 2026-06-27 spät)
Garmin-Connect-Export („Original") beider Uhren importiert → **die Chunk-Limits sind irrelevant**:
- **fenix Wrist: 100 Hz, volle 640 s** (4× unsere 25-Hz-Chunks). FIT-Ruhewert ≈1000 → ÷1000=g
  **dritte unabhängige Bestätigung des accel_scale-Bugs** (2048 ist falsch).
- **FR55 Mast: 25 Hz, volle 657 s** (statt 165 s/10 Hz-Stummel). SensorLogging schreibt in den
  Activity-Flash, nicht in den CIQ-Object-Store → kein Abbruch.
- Skripte: `fitlib.py` (FIT-Loader, FIT-Zeit ist UTC → `_unix()`), `06_start_sequence.py`,
  `07_p3_pitch_fit.py`. FITs in `fits/` (gitignored, Philipps Daten).

**Pitch-Pump-Modell bestätigt (07, volle 25-Hz-Mastdaten):** im Foiling dominiert die
**Fore-Aft-Pitch-Bewegung den Roll ~3,6:1** (Pitch-RMS 13,3° vs Roll 3,7°) — genau Jans
85-cm-Hebel-Modell. Heave↔Pitch gekoppelt (Phasenlag ~67°). Ein großer Pitch-Event bei ~35 s
(harter Move oder Gravitations-Lowpass-Artefakt durch Horizontalbeschl.) noch isoliert zu prüfen.

**Startsequenz korrekt gelesen (06):** 0–14 s Board auf dem Kopf am Steg (Gravitation·z≈−1) →
14–17 s **180°-Flip** (umdrehen, Foil eintauchen) → Vorbereiten → ~72 s **Anschieben+Sprung+
Landung** (fenix-Impuls 5,4 g @100 Hz; Mast 2,8 g @25 Hz — 10 Hz verpasste die <100 ms-Spitze)
→ sofort Speed-Rampe → Foiling. **Der echte Start ist der Wrist-Impuls, nicht die GPS-10-km/h-
Schwelle** (die ~9 s später triggert und die Anpump-Phase verpasst). Cross-Watch-Clock-Sync via
koinzidentem Impuls auf 0,02 s bestätigt.

**Konsequenz für die Produkt-Erkennung:** (1) accel_scale → 1000 (Bug verschluckt sonst Pump-
Fenster: 104 statt 20 „idle" auf #309). (2) Start besser impuls-basiert (scharfe Wrist-Spitze +
Speed-Anstieg) statt reiner GPS-Schwelle. (3) Wo FIT verfügbar: höhere Rate nutzen.

## Reproduktion
```
cd analyse && . ../server/.venv/bin/activate   # numpy/scipy/matplotlib
python3 lib.py                 # Übersicht aller Sessions
python3 01_overview.py         # Timelines je Paar          -> out/01_overview.png
python3 02_pump_spectrum.py    # Pump-Kadenz Mast vs Wrist  -> out/02_pump_spectrum.png
python3 03_orientation_coherence.py  # Foil-Lage + Kohärenz -> out/03_*.png
python3 04_takeoff_regime.py   # Takeoff/Regimewechsel      -> out/04_*.png
python3 05_pitch_pump.py       # Pitch-Pump-Kopplung        -> out/05_*.png
```
