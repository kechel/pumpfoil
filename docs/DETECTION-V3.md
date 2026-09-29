# Erkennung v3 — Laeufe und Sportart aus einem Modell (Plan, Stand 29.09.2026)

**Status: Phase 0.** Nichts davon ist live. Die laufende Erkennung ist v2 (`analysis/detect_v2.py`,
`DETECTOR_V2=1`), siehe [`GROUND-TRUTH.md`](GROUND-TRUTH.md) fuer die Grundlagen der Pump-Erkennung.

## Ziel

1. **Stufe A, je Zeitfenster (~5 s):** eigene Kraft auf dem Foil (pumpen/gleiten) · Fremdkraft auf
   dem Foil (Motor, Schlepp, Wind) · im Wasser ohne Foil · Transport an Land (Auto, Rad, Gehen) ·
   Stillstand. **Ein Lauf ist nur, was Stufe A „eigene Kraft auf dem Foil" nennt** — Autofahrten
   fallen damit von selbst heraus, ohne eigene Regel (Anlass: 42 Laeufe in 120 Tagen lagen direkt
   an einer Autofahrt, s. unten).
2. **Stufe B, je Lauf → je Session:** welche Sportart. Mehrklassig mit „unsicher"; die Session
   nimmt die Mehrheit ihrer Laeufe. Nur Vorschlag — was Nutzer/Admin setzen, gewinnt immer.
3. **Die Profileinstellung Empfindlichkeit** (`users.foil_sensitivity`: 572 normal, 94 attempts,
   45 light) wird im Vergleich mitgefuehrt. Wunsch: v3 findet deren Laeufe auch ohne die
   Einstellung, dann kann sie weg. Bis das belegt ist, wird sie beachtet.

**Ein Modell statt einer Kette je Sportart:** bei „das erste, das etwas erkennt, gewinnt" entscheidet
die Reihenfolge, die Konfidenzen sind nicht vergleichbar, und jede neue Sportart verschiebt die
anderen. Technik wie das bestehende On-Foil-Modell (Gradient Boosting / Random Forest auf
berechneten Merkmalen): erklaerbar, mit wenig Daten trainierbar, schnell.

## Entscheidungen (Jan, 29.09.2026)

- **OSM-Wasserflaechen: NUR fuers Training**, nicht zur Laufzeit. Wo unsicher ist, ob ein Lauf im
  Wasser liegt (Pegel und Uferlinie wechseln zwischen Aufnahmen), bekommt Jan das Kartenbild.
- **Kein Aufruf** nach Handy-am-Brett-Aufnahmen — die kommen von allein (Werbevideo ist raus).
- **Reihenfolge:** zuerst „Pumpfoil gegen alles andere" und saubere Laeufe, danach die Sportarten.
  **Ein Schritt nach dem anderen, jeder erst verifiziert.** Nicht live schalten: erst der
  Regressionsvergleich, dann einzelne Sessions ansehen, was herausfiele oder dazukaeme.

## Datenbestand (gezaehlt 29.09.2026, rein lesend)

Nur Sessions mit brauchbarer Beschleunigung (>= 15 Hz, nicht `gps_only`): **2653 von 8411.**

| Sportart | von Menschen gesetzt | Fahrer | Std | Laeufe | zusaetzlich per Profil-Standard |
|---|---|---|---|---|---|
| Pumpfoil | 77 | 57 | 90 | 543 | 2427 (277 Fahrer, verrauscht) |
| Wingfoil | 21 | 4 | 28,6 | 369 | 8 |
| Foil Scoot | 27 | **1** | 44,1 | 364 | – |
| Wakethief | 13 | 5 | 15,6 | 81 | 24 |
| Foildrive | 13 | 2 | 7,0 | 88 | – |
| Efoil | 10 | 1 | 3,8 | 29 | 30 |

**Folgerung:** „Pumpfoil gegen alles andere" ist trainierbar. Eine Klasse je Sportart noch nicht —
bei einem bis vier Fahrern je Sportart lernt ein Modell den Fahrer, nicht die Sportart.

**Wahrheit auf Lauf-/Pump-Ebene:**
- Handy am Brett + Uhr gleichzeitig: **9 Paare, ~4,2 h, 3 Fahrer** (u2, u5, u13); dazu 7
  Brett-Aufnahmen ohne Uhr. Kreisel in 76 Sessions, Kompass in 11.
- ~200 weitere Ueberschneidungen sind **Gruppenfahrten** (verschiedene Fahrer, eigene Uhren).
- Von Nutzern aussortierte Zeitbereiche `excluded_ranges`: 83 Sessions, 23 Fahrer (Negativ-Labels).
- Zurueckgeholte Fremdkraft-Laeufe `fremdkraft_keep`: 32 Sessions, 12 Fahrer (Positiv-Labels).
- `labels` (31 Bereiche pump/glide, 12 Sessions), `pump_truth` (456 Tipps, 3 Sessions),
  `data/ground-truth/runs.json` (11 Urteile).
- Kandidaten Autofahrt-Schulter: 42 Laeufe in 26 Sessions (maschinell, nicht bestaetigt).

## Phasen

0. **Ausgangsstand einfrieren** (rein lesend): Schnappschuss der heutigen Ergebnisse aller Sessions
   + Label-Satz aus allen menschlichen Quellen, mit Vertrauensstufe. Liegt lokal unter
   `server/data/ml/` (gitignored, im Backup) — keine Nutzerdaten im oeffentlichen Repo.
1. **Messwerkzeug:** Lauf-Trefferquote (Start/Ende ueber Zeit-Ueberlappung), Pump-Fehler je Lauf
   gegen das Brett, alles je Fahrer und je Geraet. Validierung immer **mit herausgehaltenen
   Fahrern**. Damit zuerst die HEUTIGE Erkennung vermessen.
2. Merkmale je Fenster, Datensatz (Geraete angleichen: Rate, Accel-Vorzeichen).
3. Stufe A trainieren, verifizieren. Danach Stufe B.
4. Schattenlauf gegen den Bestand, Diff-Liste an Jan, einzelne Sessions ansehen.
5. Nur mit Jans OK: hinter Schalter, Bestand vorher sichern, Neuauswertung, Zahlen gegen Phase 0.

Regressionstests in der CI bleiben synthetisch (oeffentliches Repo). Der Vergleich gegen echte Daten
laeuft lokal und rein lesend.
