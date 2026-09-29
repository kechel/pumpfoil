# Erkennung v3 — Laeufe und Sportart aus einem Modell (Plan, Stand 29.09.2026)

**Status: Phasen 0–4 durchgerechnet (29.09.2026), Ergebnis unten.** Nichts davon ist live. Die laufende Erkennung ist v2 (`analysis/detect_v2.py`,
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

## Ergebnis 29.09.2026 (Phasen 0–4, alles offline, nichts live)

**Wasser fuers Training:** Overpass war von der VM nicht erreichbar (TODO-Inbox) → JRC Global Surface
Water (30 m, Wasserhaeufigkeit 1984–2021). JRC uebersieht schmale Gewaesser (Kanaele, Fluesse,
Lagunen, ein Becken): „an Land" allein ist KEIN Label. 73 Sessions mit Laeufen auf JRC-Land per
Kartenbild gesichtet: 49 Land, 22 schmales Wasser, 2 unklar (Jan: #7160, #9455).

**Stufe A als eigene Maske: verworfen.** Sie fand 7668 zusaetzliche kurze Laeufe (Median 6 s); die
unabhaengige foil_status-Wahrheit bestaetigt davon 37 %, von den mit v2 gemeinsamen 98 %.

**Stufe A als Veto (`analysis/v3/veto.py`, Schwelle 0,4):** v2 findet die Laeufe wie heute, Stufe A
verwirft Laeufe mit mittlerer Wahrscheinlichkeit < 0,4. Gemessen mit Teilmodellen, die den Fahrer
NIE gesehen haben (sonst Auswendiglernen: am Abstimm-Satz sah es mit 3 statt 35 Land-Laeufen viel
besser aus), ganze Aufnahme, eigene Empfindlichkeit, 2648 Sessions:

| Kennzahl | v2 heute | v3-Veto |
|---|---|---|
| Laeufe ≤ 60 s an einer Autofahrt | 25 | 0 |
| Laeufe an Land (Sichtpruefung) noch da | 81/81 | 35/81 |
| Feste Pruefliste (u. a. #10478 Parkplatzrunde) | 4/7 | 7/7 |
| Laeufe auf schmalem Wasser behalten | 61/62 | 61/62 |
| foil_status Praezision / Trefferquote | 0,902 / 0,925 | 0,903 / 0,925 |
| Laeufe gesamt | 18339 | 18235 (−104) |

Von den 104 verworfenen: 51 klar an Land, 53 nahe Wasser. Stichprobe 8 der naechst-am-Wasser:
7 richtig (Uferstrassen), **1 falsch (#3045, Lauf mitten auf dem Zuideinderplas)**. Grenze: eine
Autofahrt NEBEN einem Kanal (#1232, B235) behaelt auch das Veto.

**Stufe B (Sportart, Fahrer herausgehalten, je Session):** Pumpfoil 62/62 · Wingfoil 20/24
(heute 0/21) · Wakethief 1/35 · Foildrive 3/11 · Efoil/Foil Scoot je 1 Fahrer = nicht pruefbar.

**Empfindlichkeit:** Schattenlauf „alle normal" liegt vor (schatten-v2/-v3-normal), der Vergleich,
ob v3 die Einstellung ersetzen kann, steht noch aus — als Maske taugt v3 dafuer nicht (s. oben).

**Offen vor jedem Live-Schritt:** Jans Blick auf die Liste der 104 (server/data/ml/verworfen-v3veto.json)
und die Bilder; #3045-Fall verstehen; die 2 unklaren Sessions; Stufe B nur als Vorschlag.

## Anforderung fuers Live-Schalten: Lauf-Status mit Herkunft (Jan, 29.09.2026)

„bei der 'lauf ausblenden' funktion … noch einen 3ten zustand 'gueltig / aussortiert / manuell oder
auto', und dann muss es bei 'manuell' nicht wieder ueberschrieben werden bei model-updates oder
reanalysen." Umsetzung (Entwurf, nicht gebaut):

- Je Lauf **Status** gueltig/aussortiert und **Herkunft** manuell/auto.
- **Manuell gewinnt immer** und wird nie ueberschrieben: aussortiert = `excluded_ranges`, gueltig =
  Zurueckhol-Liste (wie `fremdkraft_keep`, dann auch gegen das v3-Veto).
- **Auto** = v3-Veto mit Grund und Modellversion gespeichert; nach einem Modell-Update werden NUR
  diese Urteile neu gerechnet.
- In der Lauf-Tabelle sichtbar (z. B. „automatisch aussortiert — trotzdem zaehlen?").

## Kurze Laeufe am Ufer (Jan, 29.09.: #7160 Lauf 2, #9455 Lauf 1)

Innerhalb des Laufs unterscheiden sie sich klar (Pump-Energie 0,06-0,12 gegen 0,55, Rhythmus 0,1
gegen 0,4, dominante Frequenz 0,6-0,7 gegen 1,6 Hz, Stoss-Woelbung 9-15 gegen 3). Das Modell sieht
±5 s Kontext und das Veto mittelt ueber den Lauf — bei 4-11 s ueberwiegt das Pumpen daneben. Ein
Lauf-Klassifikator nur aus dem Lauf trennt aber NICHT sauber: ~60 der 1237 „echten" kurzen Laeufe
(nur „auf Wasser", nicht geprueft) sehen genauso ruhig aus. Naechster Schritt: diese ansehen — sind
es selbst Gehen/Tragen, ist die Regel richtig und das Label falsch.

## Beine pumpen, Arm ruht (#10266, Bartosz, 29.09.2026)

„Lange Startversuche" statt Laeufe: das alte Modell zaehlt ARMbewegung. Beispiel Versuch 6:21-6:43
(88 m): 8 s Arm-Pumpen 0,3-0,5, Modell bis 0,46 (Schwelle 0,5), danach 15 s Arm fast still
(0,04-0,14), das Tempo HAELT 9,6 km/h und STEIGT auf 13 km/h. Ohne Vortrieb faellt ein Foil in
Sekunden ab — Vermutung: mit den Beinen gepumpt (oder Welle/Wind), fuer das Handgelenk unsichtbar.
Kurzer gezaehlter Lauf 2:01-2:07 (23 m): Arm pumpt 0,5-1,8, Modell 0,64.
**Kandidat fuer v3:** Tempo gehalten oder steigend bei ruhigem Arm als Zeichen fuer Vortrieb —
nur gegen die Brett-Paare messen, nicht als Einzel-Fix. Jan: „aendern wir erstmal nichts".
Ohne On-Foil-Modell (gemessen): +43 % Laeufe, 25 % unter 8 s, neue Laeufe nur zu 13 % von
foil_status bestaetigt — das Modell bleibt.

## KORREKTUR zu Schritt 1 (29.09.2026, abends)

Der erste Versatz (+2,04 s, Kreuzkorrelation des NICKENS) war um ~3 Pump-Perioden falsch: der
Pumptakt (~0,7 s) ist mehrdeutig, und mit ±250 ms Toleranz passen Pumps auch um einen ganzen Takt
versetzt noch „zusammen". Aufgefallen an der Gegenprobe ueber die Garmin #10873, die mit beiden
Handys gepaart ist (−22 ms statt +2040). Richtig ausgerichtet ueber die UEBERGAENGE (Laeufe mit
8 s Rand, Betrag ohne Bandpass, `paare_ausrichten.ausrichten`): **Versatz −0,044 s (r 0,97/0,93),
86 gemeinsame Pumps von 87/86 (99-100 %), Median-Abstand 18 ms**, Zustand je Sekunde 97,0 %.
Die Erklaerung „Abweichungen an Anfahrt/Sturz" unten war FALSCH — das war der Versatz.
**Lehre:** einen Versatz nie aus einem periodischen Signal allein bestimmen; immer eine Gegenprobe.

## Schritt 2: Uhr und Brett ausgerichtet (scripts/v3/paare_ausrichten.py -> data/ml/v3/paare.json)

| Paar | Fahrer | Laeufe | fein je Lauf (ms) | Urteil |
|---|---|---|---|---|
| #10195/#10194 | u2 | 4 | 1680 · 1680 · 1680 · 1720 | sehr gut |
| #9535/#9534 | u2 | 2 | 2360 · 2280 | gut |
| #10248/#10250 | u13 | 4 | −320 · 2160 · 2120 · 2080 | gut (1 Ausreisser) |
| #10328/#10326 | u2 | 5 | 1560 · 2440 · 2400 · 2440 · 640 | brauchbar (3 von 5) |
| #10874/#10873 + #10875/#10873 | u2 | 2 | Gegenprobe: 22 ms auseinander | gut |
| #9650/#9649 | u2 | 1 | 1480 (r 0,57) | brauchbar |
| #9528/#9529, #9650/#9648 | u2 | je 1 | r 0,23 / 0,21 | zu schwach, raus |

## Schritt 1: taugt das Handy am Brett als Wahrheit? (29.09.2026, scripts/v3/brett_wahrheit.py — ZAHLEN UEBERHOLT, s. Korrektur oben)

Zwei Handys in DERSELBEN Tasche am Brett (#10874 iPhone SE 3, #10875 Pixel 7a), Pump-Gipfel aus
dem Nicken (0,8-2,5 Hz, >= 3°): Versatz 2,04 s, Nicken r = 0,77. **In Laeufen 77 gemeinsame Pumps
von 88/92 (84-88 %), Median-Abstand 70 ms**; die Abweichungen liegen ALLE an Uebergaengen (Anfahrt,
Ende von Lauf 1, Sturz am Ende von Lauf 2), dort um eine halbe Pump-Periode verschraenkt — im
gleichmaessigen Pumpen praktisch deckungsgleich. Die Schwelle (2-8°) aendert daran nichts.
Folgerung: Brett-Wahrheit fuer Pumps im Lauf brauchbar; an Anfahrt/Sturz nur auf ±eine halbe
Periode genau. Einschraenkung: EIN Brett, EIN Fahrer, 2 Laeufe.

## Neue Merkmale (29.09.2026, noch nicht trainiert)

Jan: „die 3 accel axen separat + gravitation sind doch super wichtig, insbesondere um glides zu
erkennen, da wackelt man viel mit der hand hin und her, aber eben nicht mehr vertikal". Der Betrag
der Beschleunigung (altes Modell UND Stufe A) wirft die Richtung weg — systematischer Fehler. Neu,
lageunabhaengig gegen die Schwerkraft: `vert_rms`, `hor_rms`, `vert_anteil`, `dreh_grad_s`,
`neigung_grad`, dazu `tempo_trend` (±5 s). An #10266: ruhige Phase des langen Versuchs vert_anteil
0,46 / Trend +0,11 / Neigung 30° gegen den gepumpten Lauf 0,81 / −0,07 / 78°. Trainiert wird erst
mit der Brett-Wahrheit (Schritt 3); alte Modelle nehmen weiter nur ihre eigenen Spalten.

## Schritt 3: Uhr gegen Brett-Wahrheit (29.09.2026, scripts/v3/brett_training.py)

6 Paare (u2: 5, u13: 1), 9525 s, davon **947 s pumpen und nur 33 s gleiten** — beide Fahrer pumpen
auf dem Foil fast durchgehend. Die Frage „ruhiger Arm beim Gleiten" laesst sich mit diesen Daten
NICHT messen.

| auf dem Foil je Sekunde | Praezision | Trefferquote | Pump-Sek. |
|---|---|---|---|
| bisheriges On-Foil-Modell | 0,940 | 0,935 | 95 % |
| Stufe A (Fahrer nie gesehen) | 0,837 | 0,957 | 97 % |
| Modell auf Brett-Wahrheit (je Fahrt heraus) | 0,926 | 0,921 | 94 % |

Folgerung: das bisherige Modell ist fuer u2/u13 gegen das Brett schon gut; ein Brett-Modell aus
~16 min Pump-Wahrheit ist nicht besser. Fuer die Gleit-/Beine-pumpen-Frage braucht es Brett-Paare
von Fahrern, die wirklich gleiten (Bartosz-Stil). Bis dahin: altes Modell bleiben lassen.

**Pump-Zaehler gegen das Brett (Nebenbefund, wichtig):** u2 19 Laeufe, Uhr/Brett Median 1,10
(0,67-2,00); u13 4 Laeufe, 1,08 (1,03-1,16). Der Zaehler ueberzaehlt ~8-10 % — die alte Aussage
„unter-erkennt ~2×" betrifft den Zaehler VOR find_pumps_cadence. Ausreisser: kurze u2-Laeufe
(11-14 s) mit genau doppelt so vielen Uhr-Pumps (6->12, 8->16) — Verdacht Doppelzaehlung
(Ab- und Aufbewegung) in kurzen Laeufen.

## Training r2/r3 + Werkbank (29./30.09.2026, nachts — alles offline, nichts live)

Jan: „mache das model-training, und dann vergleiche / verifiziere mit allem was wir wissen … ueberlege
fuer uns die beste loesung, models, zusaetzliche dinge vorher / hinterher / puffer / rahmen".

**Daten:** Datensatz neu mit 33 Merkmalen (2491 Sessions, 258 Fahrer). Neu als Quellen: Jans
Garmin-FIT ohne Pumpfoil (Ostrach, Gehen + Auto, 7257 s, `fit_neg`), Guillaumes langsames
Weiterpumpen (790 s nahe Wasser, `fortsetzung`), die Brett-Wahrheit der 6 Paare (`brett`).
Guillaumes Fortsetzungen sehen im Arm aus wie seine Laeufe (Pump-Staerke 0,64 gegen 0,67, 1,62 Hz,
97 % vertikal), nur bei 6,4 statt 11,5 km/h — auch #9525, das ist Pumpen, kein Paddeln.

**Modelle (Stufe A, je Sekunde, Fahrer herausgehalten):**

| | r1 | r2 (33 Merkmale) | r2 nur 14 alte | r3 |
|---|---|---|---|---|
| Laeufe an Land (Sicht) als „nein" | 0,606 | 0,648 | 0,480 | **0,728** |
| foil_status auf / neben dem Foil | 0,961 / – | 0,957 / 0,984 | 0,957 / 0,982 | **0,961 / 0,994** |
| Guillaumes Fortsetzung | – | 0,26 | 0,40 | 0,27 |

r3 = r2 + die heutigen Lauf-GRENZEN (±3 s) als unsicher fuer die geschaetzten Quellen (sonst lernt
das Modell die v2-Tempo-Schwellen nach) + unabhaengige Wahrheiten staerker gewichtet (fremd ×3,
brett/fortsetzung/sicht ×5, fit_neg ×2). Guillaumes Stil kann ein Modell, das ihn NIE gesehen hat,
nicht lernen — das ist die ehrliche Zahl fuer „der naechste Fahrer wie er".

**Werkbank (`scripts/v3/werkbank.py`):** p je Session einmal (Teilmodell ohne den Fahrer), dann
Nachbearbeitung auf den Ausgangs-Laeufen v2 oder `tief` (fast ohne Tempo-Grenzen):
veto (ganzer Lauf weg bei mittlerem p < τ), schnitt (Raender mit p < θ ab), teil (Lauf in die Stuecke
mit p >= θ zerlegen), dehn, naht, kurz (Stuecke < 8 s brauchen p >= 0,8), empf (Schwellen je
Profil-Empfindlichkeit). Gemessen mit detektor-v3-messen.py + direkt gegen Brett und Guillaume.

| r3 | v2 heute | tief+empf | beide+empfteilkurz |
|---|---|---|---|
| foil_status Praez. / Treffer | 0,902 / 0,925 | **0,942 / 0,940** | **0,943 / 0,940** |
| Laeufe an Land noch da | 81/82 | **15/82** | 21/82 |
| an Autofahrt | 25 | **0** | 1 |
| in Nutzer-Aussortiertem | 73 | 30 | **26** |
| schmales Wasser behalten | 61/62 | 61/62 | 60/62 |
| Pruefliste | – | 11/12 | 11/12 |
| Brett Praez. / Treffer | 0,872 / 0,948 | 0,915 / 0,938 | 0,918 / 0,935 |
| Guillaume gesamt (heute 22 min) | 22 | **26** | 25 |
| klare v2-Laeufe (p >= 0,8) verloren | 0 | 165 | **63** |
| Laeufe < 8 s | 1059 | 1078 | **141** |

- `tief+empf`: tief-Laeufe, Veto dann Schnitt, Schwellen je Empfindlichkeit (normal 0,5/0,4, light
  0,4/0,3, attempts 0,3/0,25) — die Einstellung stellt dann die MODELL-Schwellen statt der Tempo-
  Grenzen. Schwaeche: tief verschmilzt Gehen und Fahren zu einem Abschnitt, das Veto wirft den
  echten Lauf mit weg (#8490 312 s -> 0, #1341 239 s -> 5 s; p dort 0,98-0,99).
- `beide+empfteilkurz`: Vereinigung v2 ∪ tief, in Stuecke mit hohem p zerlegen, Veto je Stueck,
  kurze Stuecke nur bei p >= 0,8. Verliert kaum klare Laeufe, aber kurze Laeufe fast alle (141
  statt 1059) — die Trefferquote gegen foil_status bleibt gleich, die Frage ist, ob Nutzer mit
  „attempts" die kurzen sehen wollen.
- Reihenfolge zaehlt: erst schneiden, dann Veto liess aus langen Nicht-Foil-Abschnitten kurze
  Stuecke mit hohem p stehen (2554 neue Laeufe < 8 s). Naht aendert nichts (v2 verbindet schon).
- Offen: #9580 (u186, am Steg) bekommt viele gruene Stuecke im GPS-Gewimmel am Ufer — Jans Blick.
  Pumps je Lauf muessen fuer neue Grenzen neu gezaehlt werden (die Werkbank zaehlt keine).
  Gleiten: weiter nur 31 Brett-Sekunden, nicht messbar.
- Bilder: `server/data/ml/bilder/vergleich/` (blau gemeinsam, rot faellt weg, gruen kommt dazu).

**Nachtrag 30.09. (Lernkurve, Modellgroesse, Restfaelle):**
- Lernkurve (r3-Einstellungen, 150 Baeume): 4 Fahrer 0,982/0,984 · 16 Fahrer 0,989/0,949 ·
  64 Fahrer 0,993/0,992 · alle 258 gleich. Ab ~64 Fahrern flach — MEHR Sessions derselben Art helfen
  nicht mehr, bessere Labels schon (Brett-Paare, Gleiten, Fahrer wie Guillaume).
- r3gross (600 Baeume, 127 Blaetter): Land 0,732 statt 0,728, sonst gleich, Guillaume schlechter.
  Die Groesse ist nicht der Engpass -> r3 bleibt (kleiner, schneller).
- Die 21 Rest-„Land"-Laeufe sind teils GPS-Fehler: #541 GPS-Gezappel am Steg zieht aufs Land, der
  Arm pumpt (p 0,99); #2684 Gerade neben der Wosha mit duennen GPS-Punkten. L kann nicht 0 werden.
- #9455 (Pruefliste): 1 -> 28 km/h in 12 s und zurueck, Arm bewegt (p 0,9) — kein Pumpfoil, das
  Modell irrt. Eine Tempo-Regel dafuer waere Ueberanpassung an einen Fall (Wing/Efoil sind so
  schnell); bleibt als bekannter Fehler.
- Pumps: werden in `run_analysis` je Lauf gezaehlt, NACH der Erkennung — laeuft die Nachbearbeitung
  spaeter in `detect_v2` (vor der Fremdkraft), sind die Pumps automatisch auf den neuen Grenzen.

**Empfehlung (Stand 30.09., Jans Entscheidung offen):** Modell r3, Ausgang v2 ∪ tief, `teil`
(Stuecke mit p >= θ) + Veto je Stueck + kurze Stuecke nur bei klarem p, alle Schwellen je
Profil-Empfindlichkeit. Offen fuer Jan: wie streng bei kurzen Laeufen (141 bis 1290 unter 8 s,
foil_status-Trefferquote gleich) und #9580 (Steg-Gewimmel). Live erst nach Jans OK, mit
Lauf-Status manuell/auto und Sicherung des Bestands.
