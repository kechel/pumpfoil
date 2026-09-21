# Ground Truth für Pump- und Gleit-Erkennung

**Wozu dieses Dokument.** Jan am 21.09.2026: „all die Ideen zu dem Thema bitte ordentlich
notieren, damit wir später nicht nochmal von vorn anfangen." Hier steht, worauf unsere Erkennung
heute wirklich steht (gemessen, nicht geschätzt), warum das Handy am Brett die Wahrheit für die
Uhr ist, wieviel Daten es braucht — und was **vor** dem Sammeln festgehalten werden muss, weil es
sich nachträglich nicht rekonstruieren lässt.

Alle Zahlen hier sind am 21.09.2026 gegen die Produktions-DB gemessen. Wer sie wiederverwendet,
prüft sie bitte neu — sie wachsen.

---

## 1. Worauf die Erkennung heute steht

| | Umfang | Quelle |
|---|---|---|
| **On-Foil-Modell** (`foil_rf.pkl`) | 103 Sessions, 58.189 On-Foil-Sekunden (≈ 16 h) | **14 Nutzer** |
| **Pump-Zählung** (Heuristik) | 456 Marken in 3 Sessions | **422 davon (93 %) Nutzer 2**, 34 Nutzer 5 |
| **Gleit-Erkennung** | — | **gibt es nicht** |

Das On-Foil-Modell steht auf einer brauchbaren Basis: 14 verschiedene Fahrer, 16 Stunden, über die
`foil_status`-Wahrheit der Label-App gelabelt (Sekundentakt, liegt als `foil_status.json` je
Session in `server/data/`).

Die **Pump-Zählung steht auf einem Fahrer, einem Handgelenk, einer Stance.** `pump_truth` enthält
456 Marken; 422 kommen aus zwei Sessions von Nutzer 2 (#295 und #354, Juni 2026), 34 aus einer
Session von Nutzer 5. Die `labels`-Tabelle (31 Zeilen, Abschnitts-Labels) ändert daran nichts.

**Daraus folgt der wichtigste Satz dieses Dokuments:** wir wissen nicht, wie gut die
Pump-Erkennung arbeitet. Nicht „ungefähr" — **gar nicht**, für alle außer einem Fahrer. Jede
Aussage über Trefferquoten ist bis dahin eine Vermutung.

**Gleiten ist keine Messung.** `longest_glide_s` ist die längste Lücke zwischen zwei *erkannten*
Pumps. Es erbt damit jeden Fehler der Pump-Erkennung, und weil die strukturell unter-erkennt
(~2× laut Label-App-Wahrheit), heißt ein hoher Gleitwert meistens „Pumps nicht gefunden". Das ist
kein Fehler in der Berechnung, sondern in der Erwartung: die Zahl war nie etwas anderes.

### Der Störfaktor, den niemand erfasst hat

Jan trägt die Uhr **an der hinteren Hand**. Bei einem Goofy-Fahrer ist die hintere Hand die
andere. Beim Foilen wedeln die Arme zum Balancieren, und genau das überlagert das Pump-Signal des
Bretts — der dokumentierte Haupt-Fehlermodus („arm-confound", s. `app/ml/pumps.py`). Welches
Handgelenk und welche Stance jemand hat, wissen wir heute von **keinem** Nutzer.

93 % der Wahrheit kommen von einem Handgelenk. Ob die Heuristik bei einem Fahrer mit der Uhr an
der vorderen Hand halb so gut oder doppelt so gut arbeitet, ist eine offene Frage, die sich ohne
dieses Feld auch später nicht beantworten lässt — man kann die Daten dann nicht schichten.

---

## 2. Warum das Handy am Brett die Wahrheit ist

Pumpen ist im Kern eine **Nickschwingung des Bretts**, also eine Drehung um die Querachse. Der
Kreisel im Handy misst genau die, unmittelbar und ohne Zwischenschritt. Dazwischen liegt kein
Arm, keine Balancebewegung, keine Interpretation.

Belegt an Jans Aufnahmen vom 21.09.2026 (#9528 und #9535, Handy am Brett, fenix am Arm parallel):

- **Der Takt stimmt geräteübergreifend.** Nicken 1,39 / 1,36 / 1,47 Hz gegen die 1,325 Hz, die
  der Pump-Zähler der fenix aus derselben Fahrt meldet.
- **Die Läufe deckten sich auf 1–2 Sekunden**, unabhängig gefunden von zwei Geräten
  (18:13:41 / 18:13:39 und 18:20:37 / 18:20:36).
- **Das Signal ist groß und eindeutig.** Nickamplitude 5,8–6,5°; das Rollen bei derselben
  Frequenz nur 0,25–0,34°, also 7–12 %. Die Schwingung liegt praktisch vollständig auf einer
  Achse.
- **Die Achse findet sich von selbst** (`lage.montage_achse_aus_kreisel`, Klarheit 14–21), egal
  wie das Handy klebt — längs, quer oder diagonal.

Zwei Sorten Labels sind daraus ableitbar:

1. **Pump-Ereignisse** — je Minimum des Hubs ein Pumpstoß („tiefster Punkt", s. Abschnitt 5),
   mit Zeitstempel. ~810 Ereignisse je 10 Minuten bei 1,35 Hz.
2. **Sekundentakt Pumpen/Gleiten** — aus der Bandamplitude des Nickens je Sekunde. **Das ist es,
   was der Gleit-Erkennung bis heute fehlt:** eine echte Aussage darüber, wann gerade nicht
   gepumpt wird, unabhängig davon, ob ein Pump-Zähler etwas gefunden hat.

Der Größenvergleich macht deutlich, was das wert ist: **eine einzige Paar-Aufnahme von 10 Minuten
liefert mehr Pump-Marken (~810) als alles, was bisher von Hand getippt wurde (456).**

---

## 3. Wieviel Daten es braucht

Drei verschiedene Fragen mit drei verschiedenen Antworten. Die Verwechslung dieser drei ist der
Grund, warum „genügend Daten" sonst nie ein Zeitpunkt wird.

### 3a. Messen, wie gut die heutige Pump-Erkennung ist

Für eine Trefferquote auf ±3 Prozentpunkte braucht es bei p ≈ 0,85 rund 140 Pump-Ereignisse, also
etwa 95 s Pumpen. Ereignisse innerhalb eines Laufs hängen zusammen (Design-Effekt ~2–3), real also
**4–5 min pro Nutzer.**

Die eigentliche Unbekannte ist die Streuung **zwischen** Fahrern — dafür zählen Köpfe, nicht
Minuten. Um zu sehen, ob die Trefferquote um mehr als ~5 Prozentpunkte zwischen Fahrern schwankt,
braucht es **8–10 Nutzer × 5 min, zusammen unter einer Stunde.**

Das ist der billigste und wertvollste erste Schritt — und er braucht **kein** Modell und **keine**
Änderung an der Pipeline, nur die Daten und eine Auswertung.

### 3b. Eine persönliche Schicht anpassen

4–8 Zahlen (Kadenzband, Verstärkung, Entscheidungsschwelle, Handgelenk-Güte). Bei 20–50
Ereignissen je Parameter: **2–5 min pro Nutzer.** Zehn Minuten reichen mit Reserve für einen
Rückhalt zum Prüfen.

**Verteilt sammeln ist besser als in einem Stück.** Die Varianz, die abgedeckt werden soll, sitzt
zwischen den Bedingungen — Kabbelwasser, Tempo, Müdigkeit, anderes Foil —, nicht innerhalb eines
Laufs. Zehnmal eine Minute an verschiedenen Tagen ist wertvoller als eine Zehn-Minuten-Session.

### 3c. Ein Gleit-Modell trainieren

Hier zählen Sekunden, und Gleiten ist die Minderheitsklasse: 10 min ergeben 600 Sekunden, davon
grob 120 Gleit-Sekunden je Nutzer. Für ein kompaktes Modell (20–40 Eingänge) reichen rechnerisch
5 Nutzer — **nötig sind 10–15**, weil nur damit „ein Nutzer raus, auf dem prüfen"
(leave-one-user-out) möglich ist. Mit drei Nutzern misst man, wie gut das Modell auswendig lernt,
nicht wie gut es erkennt.

**Zielmarke: 10–15 Nutzer × 10 min, also 2 bis 2,5 Stunden.** Zehn Leute, nicht hundert.

---

## 4. Was VOR dem Sammeln festgehalten werden muss

Diese Felder lassen sich nachträglich nicht rekonstruieren. Fehlen sie, sind die gesammelten
Daten nicht schichtbar und die Frage „arbeitet es bei anderen genauso gut?" bleibt offen,
obwohl die Daten da sind.

| Feld | Warum | Stand |
|---|---|---|
| **Handgelenk** (links/rechts) | Haupt-Störfaktor; 93 % der Wahrheit kommt von einem | fehlt |
| **Stance** (regular/goofy) | entscheidet, ob das Handgelenk die vordere oder hintere Hand ist | fehlt |
| **Uhrmodell** | Rate 25 gegen 50 Hz, anderer Sensor | vorhanden (`device_model`, `watch_model_flags`) |
| **Foil / Brett / Mast** | Signatur hängt daran | vorhanden (Setup + Katalog) |
| **Montageort am Brett** (Nase/Mitte/Heck) | Hebelarm; bestimmt Hub und wie stark das Nicken als Vertikalbewegung erscheint | fehlt |

Handgelenk und Stance gehören ins Profil, nicht an die Session — sie ändern sich praktisch nie.
Der Montageort gehört an die Session, denn er ändert sich jedes Mal (Jan hat das Handy an zwei
Nachmittagen dreimal verschieden angeklebt: längs, quer, diagonal).

---

## 5. Was „ein Pumpstoß" ist — die Definition, nicht die Messung

Hier stand zuerst, der Label-Generator müsse „einmal von Hand belegt" werden. Das war falsch
formuliert und hat Jan zu Recht die Frage abgenötigt, ob ich dem Kreisel am Brett nicht traue.
Tue ich — die Sensoren waren nie das Problem. Offen war der ÜBERSETZUNGSSCHRITT, und der besteht
aus zwei Definitionsfragen:

1. **Welcher Punkt im Zyklus ist der Pumpstoß?** Maximum des Nickens, Nulldurchgang, Extremum der
   Nickrate — das sind bis zu einer Viertelperiode (~180 ms bei 1,39 Hz) auseinander.
2. **Ist ein Zyklus ein Pump oder zwei?** Das Rollen hat bei der HALBEN Pumpfrequenz doppelt so
   viel Amplitude wie bei der ganzen (0,53–0,65° gegen 0,25–0,34°) — das abwechselnde Belasten.
   Ein Zyklus könnte also als „ein Pump" oder als „ein Bein" gezählt werden.

**Beides ist entschieden (Jan, 21.09.2026): „ich würde immer den tiefsten Punkt als Marker
benutzen eines Pumps."** Der tiefste Punkt ist das Minimum des Hubs (`lage.hub_berechnen`), einer
je Zyklus. Damit ist die Definition gesetzt und unmittelbar rechenbar.

**Nachgemessen ergibt diese Definition:**

| | Marken aus dem Brett | Pump-Zähler Handy | Pump-Zähler fenix (parallel) |
|---|---|---|---|
| #9535 | 104 (1,35 Hz) | 103 (1,34 Hz) | 106 in 80 s (1,32 Hz) |
| #9528 | 66 (1,44 Hz) | — | 77 in 53 s (1,45 Hz) |

Eine Marke Abweichung bei #9535, 1 % bei #9528 — gegen zwei unabhängige Handgelenk-Zähler. Und die
Phase ist stabil: beim tiefsten Punkt liegt das Nicken im Median bei −2,6° / −3,5° / −5,0°, also
leicht nasenab, in allen drei Läufen gleich.

**Damit entfällt das Handtippen.** Was bleibt, ist die unabhängige Gegenprobe — und die zieht nur
um: **in jeder Paar-Aufnahme liegt eine Uhr-Aufnahme daneben, deren eigener Pump-Zähler eine
unabhängige Schätzung ist.** Genau damit sind die Zahlen oben geprüft. Die Kontrolle steckt also
künftig in der Datenerhebung selbst, dauerhaft und für jeden Nutzer, statt in einer Oberfläche,
die jemand bedienen muss.

**Folge: der Label-Editor kann weg**, sobald der Ableiter steht und Daten kommen (Jans
Entscheidung, 21.09.2026). Betroffen wären `/sessions/:id/label` (`Labeling.tsx`), die
`labels`-Endpunkte, die `pump-truth`-Endpunkte samt `compare` und `app/pumptruth.py`. Die
bestehenden 456 getippten Marken bleiben als historischer Vergleichspunkt erhalten — sie
überlappen mit keiner Brett-Aufnahme (#295/#354 vom Juni sind uhr-only), taugen also nicht zur
Gegenprobe, wohl aber als Beleg, wie die Eichung entstanden ist.

### Wann ein Zyklus als Pumpstoß zählt

Auch das ist entschieden, und zwar physikalisch (Jan, 21.09.2026): „ein Pump ist es nur wenn mind.
5 cm oder so Hub gemessen wurden innerhalb einer sehr kurzen Zeit, es muss ja Energie übertragen
werden, und das ist Weg mal Kraft, und die Kraft ist nur groß bei ‚schnellem' Pumpen; 5 cm über
3 Sekunden ist dann eher schon ein Glide."

**Gemessen je Pumpzyklus** (Tiefpunkt zum folgenden Hochpunkt):

| | #9535 | #9528 |
|---|---|---|
| Hub aufwärts (Median) | 18,6 cm | 19,5 cm |
| **Dauer dafür** | **0,36 s** | **0,36 s** |
| Aufwärts-Tempo | 53 cm/s | 53 cm/s |
| Zyklusdauer | 0,73 s | 0,68 s |
| Anteil unter 5 cm Hub | 2 % | 2 % |
| 5. Perzentil Hub / Tempo | 8,8 cm / 13 cm/s | 6,4 cm / 26 cm/s |

Beide Aufnahmen liefern dieselben Zahlen, obwohl das Handy völlig verschieden klebte (134° gegen
268°) — das ist ein weiterer Beleg, dass die Kette trägt. Die „sehr kurze Zeit" ist demnach
**0,36 s**, und die 5 cm sind ein bequemer Boden, der 2 % der Zyklen abschneidet.

Das Energie-Argument trägt quantitativ: 5 cm über 3 s sind 1,7 cm/s gegen die gemessenen 53 cm/s,
also **Faktor 31 im Tempo und rund Faktor 250 in der Energie** (Weg × Kraft ∝ A²f²).

**Als EINE Größe formulieren, nicht als zwei Schwellen.** „Mindestens 5 cm UND schnell" ist genau
das Aufwärts-Tempo Δh/Δt — dieselbe Physik in einer Zahl, ohne Kombinationen, in denen sich zwei
Schwellen widersprechen können. An den Daten stabil: Median 53 cm/s, 5. Perzentil 13–26 cm/s. Eine
Schwelle bei **10–15 cm/s** behält praktisch alles Echte und verwirft das Langsame. Der Wert ist
bewusst noch nicht festgeschrieben — er wird an den ersten Fremd-Aufnahmen nachgezogen (Jan: „auch
das finden wir dann mit mehr Daten besser raus").

**Grenze, die dabei bekannt sein muss: der Hub ist bandbegrenzt.** Das Fenster richtet sich am
Pumptakt aus (hier 1,39–1,53 s), was einem Hochpass bei rund 0,7 Hz entspricht. Eine Bewegung
„5 cm über 3 Sekunden" (0,33 Hz) ist damit **schon vor jeder Schwelle aus `hub_cm`
herausgefiltert.** Zwei Folgen:

- **Gut:** langsames Auf und Ab kann sich gar nicht als Pumpstoß einschleichen. Jans Kriterium ist
  zum Teil bereits durch die Bandgrenze erzwungen.
- **Preis:** langsamen Hub können wir überhaupt nicht messen. Zwischen „sehr langsam gepumpt" und
  „gleitet" lässt sich über den Hub deshalb nicht unterscheiden — dafür bleibt nur die
  Bandamplitude des Nickens. Das ist eine prinzipielle Grenze der doppelten Integration
  (s. Kopfkommentar in `lage.py`), keine Einstellung.

### Der Dropstart zählt mit — kein Sonderfall

Hier stand zuerst, der Absprung am Lauf-Anfang sei ein großer schneller Hub, der KEIN Pumpstoß ist
und ausgenommen werden müsse. Jan, 21.09.2026: „wenn der Dropstart selber auch als Pump gilt ist
das nicht verkehrt, da springe ich ja auch aufs Board drauf, das ist sogar oft der stärkste aller
Pumps." Physikalisch richtig — der Absprung überträgt Energie ins Foil wie ein Pumpstoß, nur mehr.

**Nachgemessen, stärkster Zyklus je Lauf (Aufwärts-Tempo):**

| | stärkster Zyklus | wo |
|---|---|---|
| #9484 Lauf 1 (Steg-Dropstart) | **70 cm/s** (80 cm in 1,14 s) | **beim Absprung**, t−2,3 s |
| #9484 Lauf 2 | 39 cm/s | beim Absprung, t−1,9 s |
| #9535 Lauf 1 | 63 cm/s | mitten im Lauf, t+28 s |
| #9535 Lauf 2 | 61 cm/s | mitten im Lauf, t+16 s |
| #9528 | 76 cm/s | mitten im Lauf, t+21 s |

Beim echten Dropstart vom Steg (#9484) ist der Absprung der stärkste Einzelstoß der Aufzeichnung,
mit Abstand. Bei #9535 und #9528 nicht — dort lag das Brett vorher **umgedreht im Wasser**
(Rollen bei −176°, der Dreh liegt bei t−7 s), es war also ein Wasserstart und kein Absprung; die
ersten Stöße liegen mit 48–56 cm/s im normalen Bereich des Laufs.

**Folge: kein Sonderfall im Ableiter.** Der Absprung übersteht jede Hub-Schwelle sowieso und soll
das auch. Die Unterscheidung Absprung/Wasserstart ist für das Labeln unerheblich — beides sind
Pumpstöße.

Eine Zahl mit Vorbehalt: die 80 cm des Absprungs dauern aufwärts 1,14 s und liegen damit dicht an
der unteren Bandgrenze (Fenster 1,39 s ≈ 0,7 Hz). Die Amplitude ist dort schon beschnitten —
„groß" stimmt, der exakte Wert nicht.

---

## 6. Gestalt der Personalisierung

### Die Prämisse trägt — gemessen

Pump-Kadenz über 92 Nutzer mit mindestens 5 Sessions:

| | |
|---|---|
| Streuung **zwischen** Nutzern | σ = 0,144 Hz (1,38 bis 1,87 Hz) |
| Streuung **innerhalb** eines Nutzers | σ ≈ 0,07 Hz (Spanne 0,042–0,119) |

Die Varianz zwischen den Fahrern ist rund **viermal** so groß wie die eines einzelnen. „Persönliche
Kadenz" ist damit eine echte, stabile Eigenschaft und keine Tagesform. Zum Vergleich: unser
globales Suchband ist `PUMP_CAD_BAND = (0.8, 2.0)` Hz, der Mindestabstand zweier Peaks deckelt bei
2,2 Hz — Nutzer 63 pumpt mit 1,87 Hz und fährt damit am oberen Rand der Eichung.

### Als dünne Schicht, nicht als eigenes Modell

| Variante | je Nutzer | 300 Nutzer |
|---|---|---|
| Schwellensatz wie heute (6 Zahlen) | 48 B | 14 KB |
| Kalibrier-Schicht (Kadenzband, Verstärkung, Schwelle, Handgelenk-Güte) | ~64 B | 19 KB |
| logistische Regression auf 14 Merkmale | 120 B | 36 KB |
| eigener Wald wie `foil_rf.pkl` | 17,8 MB | **5,3 GB** |

Der Speicher ist dabei nicht das eigentliche Argument. **600 gelabelte Sekunden gegen 154 Eingänge
heißt, ein Wald würde sie auswendig lernen.** Personalisierung gehört in wenige Zahlen.

Was die Pump-Zählung heute tatsächlich benutzt, sind **sechs Zahlen** (`find_pumps_cadence`):
Filterband 0,3–3,0 Hz, Kadenzfenster 4,0 s, plausible Kadenz 0,8–2,0 Hz, RMS-Gate 0,008 g. Als
`float64` sind das 48 Bytes. Das Verfahren steckt im Code (11 KB `app/ml/pumps.py`), nicht in
Parametern.

### Das billigste 80 % braucht kein Handy am Brett

Die persönliche Kadenz steht schon in den vorhandenen Daten: wer 5 Sessions gefahren ist, hat sie
auf ±0,07 Hz bestimmt. Damit ließe sich das Suchband von global 0,8–2,0 Hz auf persönlich ±0,3 Hz
um seinen Wert verengen — **viermal schmaler**, entsprechend weniger Platz für einen falsch
gepickten Peak. Gilt heute für 92 Nutzer, kostet 16 Bytes je Nutzer, braucht keine Paar-Aufnahme
und keine Ground Truth.

Der Kadenz-Schätzer ist dafür brauchbar, obwohl er aus demselben Detektor kommt: er ist ein
**Spektralgipfel** und bleibt richtig, auch wenn die Peak-Zählung darunter unter-erkennt. Die
Zirkularität ist also begrenzt — aber sie ist nicht null, und ein Gegencheck an der Brett-Wahrheit
wäre der saubere Beleg.

---

## 7. Datenmodell — was schon passt

- **`pump_truth`** (`session_id`, `t_ms`, `run_idx`, `take`, `created_at`) passt unverändert.
  Brett-abgeleitete Marken können mit eigenem `take` neben den getippten liegen und bleiben
  dadurch unterscheidbar. **Kein neues Schema nötig.**
- **Verknüpfung der Paar-Sessions:** Entwurf mit `paired_session_id` + Zeitversatz liegt vor
  (21.09.2026, noch nicht gebaut). Zeitsynchronisation ist einfach: die erkannten Läufe beider
  Geräte gemittelt übereinanderlegen, bzw. über die gesamte gleichzeitige Zeit aller GPS-Punkte —
  dafür müssen nicht einmal Läufe erkannt sein.
- **Der Ableiter fehlt:** aus der Nickschwingung eines `placement="board"`-Laufs die Pump-Marken
  und die Sekunden-Zustände erzeugen und in `pump_truth` schreiben. Das ist das einzige neue
  Stück Code, das zum Sammeln gebraucht wird.

---

## 8. Haken, die bekannt sein sollten

1. **Reichweite.** 13 von 298 Nutzern haben je Uhr *und* Handy-Recorder benutzt (nicht einmal
   zwingend gleichzeitig). Bei der On-Foil-Zeit sieht es gut aus — 152 Nutzer haben kumuliert über
   10 min, 103 hatten sie in einer einzigen Session, 22 % aller Sessions erreichen 10 min am Stück.
   **Der Flaschenhals ist das Handy am Brett, nicht die Zeit.**
2. **Der Anreiz ist verdreht.** 10 min On-Foil schaffen die Geübten. Die eine bessere Erkennung am
   dringendsten brauchen — Anfänger mit 20-Sekunden-Startversuchen — kommen an die Kalibrierung
   nicht heran. Für sie muss der globale Pfad gut sein; Personalisierung ist immer additiv, nie
   Ersatz (Cold Start).
3. **Nachkalibrieren.** Neues Foil, neues Brett, andere Uhr, anderes Handgelenk — die Signatur
   ändert sich. Es braucht mindestens eine Gültigkeitsprüfung, sonst verfällt eine Kalibrierung
   lautlos.
4. **Rückwirkende Zahlen.** Sobald ein Nutzer kalibriert wird, verschieben sich seine vergangenen
   Zahlen bei der nächsten Reanalyse; Rekorde und Bestenlisten ändern sich rückwirkend. Jans
   Einschätzung (21.09.): wird dadurch eher besser. Sollte trotzdem vorher bekannt sein und nicht
   als Überraschung kommen. Das Prinzip dahinter gibt es schon — die vom Besitzer gewählte
   Empfindlichkeit IST seine maßgebliche Analyse, überall gleich (s. `analysis/__init__.py`).
5. **Abhängigkeit von der Lage-Kette.** Alles hängt daran, dass die Brett-Aufnahme funktioniert:
   Montage-Drehung, Nullpunkt, Pumptakt. Das steht seit 21.09.2026, ist aber an **zwei** Aufnahmen
   belegt. Vor einer darauf gebauten Kalibrierung sollte es an fünf verschiedenen Klebestellen
   und von mehr als einem Fahrer gesehen worden sein.

---

## 9. Reihenfolge

1. **Handgelenk + Stance ins Profil, Montageort an die Session.** Kostet fast nichts, ist
   nachträglich unmöglich. **Muss vor dem Sammeln stehen.**
2. **Ableiter bauen** (Nickschwingung → `pump_truth` mit eigenem `take`) + Paar-Sessions
   verknüpfen.
3. **Marker-Definition umsetzen:** tiefster Punkt = Minimum des Hubs, einer je Zyklus, gültig ab
   einem Aufwärts-Tempo von ~10–15 cm/s (Abschnitt 5). Gegenprobe je Aufnahme gegen den
   Pump-Zähler der parallel laufenden Uhr — kein Handtippen nötig.
4. **Sammeln: 8–10 Nutzer × 5 min** → erste ehrliche Messung, wie gut die heutige Pump-Erkennung
   ist. Ergebnis ist eine Zahl, die es bisher nicht gibt.
5. **Persönliches Kadenzband** aus der vorhandenen Historie (kein Handy nötig, 92 Nutzer sofort).
6. **Gleit-Modell** bei 10–15 Nutzern × 10 min, Validierung leave-one-user-out.
7. **Persönliche Schicht** (4–8 Zahlen) für die, die paarweise aufgenommen haben; globaler Pfad
   bleibt der Rückfall.

Schritt 4 ist bewusst vor jedem Modell: solange niemand weiß, wie gut es *jetzt* läuft, ist jede
Verbesserung unbelegbar.

---

## 10. Beschaffung

Jan hat am 21.09.2026 ein Video aufgenommen, das die Lage-Ansicht neben der Fahrt zeigt — oben die
Animation, unten Nicken, Gieren, Rollen und die Kurven parallel. Jeder sieht darin unmittelbar,
wie gut das mit dem Handy am Brett funktioniert.

**Der Short wird veröffentlicht, sobald die Android-Version freigegeben ist, die das unterstützt.**
Danach werden ein paar Nutzer es nachmachen — das ist der Beschaffungsweg für die 10–15 Fahrer aus
Abschnitt 3c. Bis dahin ist die Vorarbeit aus Abschnitt 9 (Schritte 1–3) das, was den Unterschied
macht, ob die dann eintreffenden Daten verwertbar sind oder nicht.

---

## Verweise

- `docs/DATA-PIPELINE.md` — Datenweg, drei Zeitbegriffe, Achsenrekonstruktion (**vorher lesen**)
- `docs/detector-v2.md` — der aktive Detektor
- `server/app/analysis/lage.py` — Lage aus Beschleunigung + Drehrate, Montage-Automatik
- `server/app/ml/pumps.py` — die Pump-Heuristik und ihre sechs Zahlen
- `server/app/analysis/foil_model.py` — das On-Foil-Modell, 14 Merkmale × 11 s Kontext = 154 Eingänge
- Memories: `pump-groundtruth`, `pump-tap-labeling`, `board-imu-experiment`,
  `wrist-detector-improvements`, `onfoil-model-retrain`, `per-user-detection-sensitivity`
