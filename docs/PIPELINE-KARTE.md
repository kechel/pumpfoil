# Analyse-Pipeline: was beeinflusst was (Stand 23.10.2026)

Karte für Arbeiten an der Erkennung, besonders vor einem neuen v3-Modell (Jan, 23.10.2026: „das ist etwas
komplex geworden inzwischen, vielleicht erstmal recherchieren und mappen was wie wo wann genau was
beeinflusst"). Rein lesend erhoben (Code + Prod-DB). **[V]** nachgesehen, **[A]** abgeleitet.
Ergänzt [`DATA-PIPELINE.md`](DATA-PIPELINE.md) (Datenweg) und [`DETECTION-V3.md`](DETECTION-V3.md) (Modell).

## Schalter und Versionen [V]

- `server/.env`: `DETECTOR_V2=1`, `DETECTOR_V3=1`, `OMP_NUM_THREADS=2`.
- Versionen: `detect_v2.ALGO_VERSION = "v2-windows-1"` (in `analysis_results.algo_version`, **zeigt v3 NICHT an**) ·
  `v3/nachbearbeitung.VERSION = "v3-r4-mild-2"` (in `metrics.v3.version`, `fremdkraft_laeufe[].modell`, `seg.v3`) ·
  `brett_regeln.REGEL_VERSION = "brett-regeln-2"` · `sportregel.VERSION = "v6"` · `windlauf.VERSION = "wind-1"`.
- Live-Modelle: `server/app/analysis/v3/modelle/stufe_a_r4.pkl` + `stufe_a_r3.pkl` (r3 = Referenz für die
  Haltungs-Merkmale von r4). On-Foil-Modell v1/v2: `server/app/analysis/foil_rf.pkl`.
- Welche v3-Fassung eine Session trägt: `metrics_json->'v3'->>'version'`.

## Auslöser [V]

- **Zwischenanalyse** (`final=False`, Chunk-Upload / laufende Session öffnen): nur v2.
- **Final**: `abschliessend_auswerten` (`__init__.py`, bei `/complete`, Hänger-Timer, Live-Analyse) und jedes
  `run_analysis(db, s)` (Zuschnitt, Lauf-Ausschluss, Zurückholen, Setup, Sportart, Reanalyse, Import, Admin).
- Pro Nutzer nach Empfindlichkeits-Wechsel (`reanalysis.py`); Massen-Reanalyse `scripts/reanalyse-alle.py`.

## Stufen in Reihenfolge (`server/app/analysis/__init__.py`, `run_analysis`)

| # | Stufe | wann | Wirkung |
|---|---|---|---|
| 1 | Autofahrten (`autofahrt.py`) | jede Analyse | `sessions.auto_fahrten`, wirken wie Ausschluss |
| 2 | Zeitachse + Raster (`timebase.py`) | jede | `metrics.accel_axis`, `time_base`, Maske echter Messwerte |
| 3 | Zuschnitt + Ausschluss | jede | `trim_*`, `excluded_ranges`, Autofahrten |
| 4 | Weg-Wahl | jede | am Brett = placement board + Kreisel; Accel nutzbar ab **8 Hz** (`MODEL_MIN_ACCEL_HZ`) -> `detection` model / gps_only / none |
| 5 | Empfindlichkeit | jede | `users.foil_sensitivity` -> normal / light / attempts |
| 6 | Erkennung v2 (`detect_v2`) | jede | Läufe, Foil-Zeit/-Strecke, Max-Tempo, Fremdkraft (nur pumpfoil). Brett + GPS-only: GPS-Heuristik |
| 6w | Wind-Weg (`windlauf.py`) | wingfoil/kitefoil/parawing | eigene Schwellen, **kein v3** |
| 7 | **Erkennung v3** (`v3/nachbearbeitung.anwenden`) | **nur final**, Accel nutzbar, nicht Wind, nicht Brett | s. unten |
| 10 | is_pumpfoil | jede | Läufe > 0 (GPS-only ≤ 30 km/h) + Prüfung mit „attempts" (rechnet v3 mit); `pumpfoil_override` gewinnt |
| 11 | Pumps + Pumppausen je Lauf | Accel ≥ 8 Hz | innerhalb der (v3-)Laufgrenzen: `pumps`, Kadenz, `longest_glide_s` (≤ 15 s), `seg.glides` |
| 12 | Ergebnis schreiben | jede | Summen, Track, Segmente, `start_attempts_json` (nur pumpfoil) |
| 13 | Merkmale Sportart-Regel v6 | final | nur `metrics.sportregel`; Urteil nur per Klick im Admin |
| 14 | Bestwerte | jede | `best_distance/duration/speed/glide`, `num_runs`, `pump_count`, `max_pump_hz` |
| 15 | Automatische Sportart (`sportauto`) | final, pumpfoil, `sport_source` default | längster Lauf ≥ 240 s + Puls/Tempo -> efoil / needs_classification |
| 16 | Brett-Regeln (`brett_anwenden`) | final, am Brett | Pumps, Ende am Aufsetzen, Gleitzeit, Bestwerte |
| 18 | Auto-Zuschnitt (`maybe_auto_trim`) | nach erster Final-Analyse | aus den gespeicherten (v3-)Läufen -> zweite Analyse |
| 19 | Brett-Automatik | placement phone, nicht vom Nutzer gesetzt | Lage je gespeichertem Lauf -> placement board -> dritte Analyse |
| 20 | Rekord-Snapshot (`records.py`) | täglich 03:15 | `record_events` / `record_snapshots` |

## Was v3 ändert [V]

Kandidaten = v2-Läufe ∪ zweite v2-Rechnung ohne foil_rf („tief"); p je Sekunde über die ganze Aufnahme (r4,
mit Haltungs-Merkmalen aus r3); Läufe an p zerlegen, Veto, kurze Stücke streng; dann an Ausschlüssen kappen,
neue Stücke müssen die Empfindlichkeit erfüllen, Zepp ohne Randschnitt, `fremdkraft_keep` bleibt unberührt.

- **Direkt:** Laufgrenzen, Laufzahl, **Dauer/Strecke/Max-Tempo je Lauf**, neue Läufe, weggenommene Läufe
  (`metrics.fremdkraft_laeufe` mit `quelle: "v3"`, Ein-Tipp-Rückholung), Session-Summen Foil-Zeit/-Strecke/Max-Tempo.
- **Indirekt:** Pumps, Kadenz, Pumppausen (auf neuen Grenzen gezählt), alle `best_*`, `num_runs`, `pump_count`,
  **is_pumpfoil**, Auto-Zuschnitt, `sportauto` (240-s-Schwelle), `metrics.sportregel`, Brett-Automatik, Startversuche.
- **Nicht nachgezogen (v2-Stand):** `avg_speed`, 5-s-Tempi, `powered_*`, `window_labels`, `track_geojson`, `total_distance_m`.
- **Betroffen:** alle Uhr-Sessions mit Accel ≥ 8 Hz außer Wind-Sportarten, auch efoil/wakethief/foildrive
  (ohne Fremdkraft-Urteil) und foil_scoot (Pump-Board mit Lenker, KEIN Motor), auch Handy-Sessions mit placement phone. **Nicht:** GPS-only, Brett-Sessions.
- **Sportart ist getrennt** (`sportauto`, Regel v6), liest aber die Läufe nach v3.

## Rekorde [V]

- Community-Rekorde frisch je Aufruf aus `REC_COL` (`api/community.py`), Cache 5 min — **eine Reanalyse wirkt
  sofort**. Filter: is_pumpfoil, nicht needs_classification, Sportart, Status; Pumpfoil-Rekorde nur `detection == model`.
- `record_events`/`record_snapshots` täglich 03:15: Verbesserungen erzeugen Events (Push nur bei Sessions ≤ 3 Tage),
  sinkende Rekorde werden still nachgezogen.

## Vorher/Nachher und Regression

- Vorschau per URL gibt es nur für die Brett-Regeln (`?brett=neu`, Admin, praktisch tot seit alle Brett-Sessions
  `metrics.brett_regel` tragen). Für Modelle fehlt sie [A Vorschlag: `?v3=<fassung>`, rein lesend in `get_session`].
- `scripts/v3/regression-kandidaten.py` nutzt die Live-Funktionen, vergleicht heute/neu je Session, inkl. Abgleich
  gegen die Brett-Paare; Modelltausch muss eingebaut werden. `scripts/v3/regression.py` ist veraltet (Modellpfad, ohne
  Empfindlichkeit/Zepp). `scripts/v3/werkbank.py` misst mit Fahrer-heraus-Teilmodellen.

## Trainingsdaten (Stand 23.10.)

- r4 sah effektiv **5 Brett-Paare von 2 Fahrern** (u2, u13; `brett_training.GUTE`), das Brett-Pickle von damals
  fehlt. Datensatz `data/ml/v3/ds/` vom 29.09. (2491 Sessions).
- `paare_ausrichten.py --liste` heute: 22 Paare + 7 Brett-Sessions ohne Uhr, 8 Fahrer; **Uhr-Wahrheit von 5 Fahrern**
  (u2 14, u574 6, u683 2, u13 1, u244 1). Ausrichtung > 400 ms bei allen u574-Paaren und einigen von u2/u13.
- Neubau: Paare neu ausrichten, Phase 0 + Datensatz für Sessions ab 29.09., p_r3 + Haltung, Brett-Labels aus
  `paare.json` statt `GUTE`, Training unter neuem Namen, Werkbank + Regression mit Modelltausch; live nur mit Jans OK
  (Sicherung, `VERSION` hochzählen, Reanalyse).

## Abweichungen in anderen Dokus

- `DATA-PIPELINE.md` §6.1 nennt 15 Hz, der Code 8 Hz. `DETECTION-V3.md` nennt `data/ml/v3/live/` als Modellort,
  der Code liest `server/app/analysis/v3/modelle/`.
