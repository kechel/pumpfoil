# Testplan Zepp-OS-Emulator — 1.0.12 vor der Einreichung

Geschrieben am 23.09.2026 fuer die Fassung **1.0.12**, die vier Dinge aendert: Bildschirm bleibt
waehrend der Aufnahme wach · Absturz-Waechter · Speichermessung · GPS ueber `onChange` statt
Sekundentakt. Drei davon sind **Diagnose**, die nur dann etwas wert ist, wenn sie auch im
Fehlerfall ankommt — und genau der Fehlerfall laesst sich auf einer echten Uhr nicht auf Zuruf
herstellen. Dafuer ist der Emulator da.

---

## 0. Was hier eigentlich abgeschossen wird

Der Aufbau hat **fuenf Schichten**, und „abschiessen" heisst auf jeder etwas anderes. Das ist der
Kern dieses Plans: jede Schicht bildet ein anderes echtes Ereignis nach.

| # | Schicht | Was es auf dem Rechner ist | Was es auf der echten Uhr waere |
|---|---|---|---|
| 1 | **Mini-App** | unser Code im Gast-System | Nutzer wischt zurueck / Zifferblatt kommt |
| 2 | **Zepp OS (Gast)** | das Uhrensystem in der VM | System raeumt die App weg (Speicher, Bildschirm aus) |
| 3 | **QEMU-VM** | der Prozess, der das Uhr-Display-Fenster zeigt (`mps2-an521`) | **Uhr startet neu / Strom weg** |
| 4 | **Zepp Simulator** | die Konfiguration drumherum, startet die VM, laedt das System je Uhrenmodell | — (gibt es real nicht) |
| 5 | **Bridge / App-Side-Worker** | der Teil, der `fetch` nach pumpfoil.org macht | **das gekoppelte Handy** (Zepp-App, BLE) |

Daraus folgt die wichtigste Regel dieses Plans: **Schicht 3 abschiessen ist der Uhren-Neustart,
Schicht 5 abschiessen ist das Handy.** Wer Schicht 5 killt und sich ueber einen fehlenden
Absturz-Eintrag wundert, hat den falschen Prozess erwischt.

### Was der Emulator entscheiden kann — und was nicht

Ehrlich vorweg, damit ein gruener Durchlauf nicht mehr behauptet, als er zeigt:

| Frage | entscheidet der Emulator? |
|---|---|
| Ueberlebt der Absturz-Waechter einen harten Abbruch? | **ja** (nach Test 0) |
| Meldet die App die richtige Phase? | **ja** |
| Faengt ein abgebrochener Upload dort an, wo er aufhoerte? | **ja** |
| Kommt der Speicherwert an, und ist er plausibel? | **ja** |
| Ueberlebt eine laufende Aufnahme den Abbruch? | **ja** |
| Bleibt der Bildschirm im Feld wirklich wach? | **nein** — die VM hat keine echte Bildschirmverwaltung |
| Bringt der GPS-`onChange`-Umbau die Dichte hoch? | **nein** — der Simulator hat keinen echten Funkempfang |
| Verhaelt sich die System-Tastensperre wie auf der Uhr? | **nein** |

Die drei „nein" bleiben Feldtest. Sie stehen trotzdem weiter unten mit drin, weil man im Emulator
wenigstens pruefen kann, dass der Code **laeuft und nicht wirft** — ein `setPageBrightTime`, das
im Katch-Block verschwindet, faellt sonst nie auf.

---

## 0b. Welche Uhren — und welcher Block auf welcher

Der Simulator laedt **je Modell ein eigenes System**. Das heisst aber nicht, dass alles auf jeder
Uhr laufen muss: **Bloecke 3, 4 und 5 pruefen Plattform-Verhalten, nicht Modell-Verhalten.** Die
laufen **einmal**, auf der Uhr mit den meisten echten Nutzern. Nur die Bloecke 6 und 7 haengen am
Modell. Sonst waeren es vier mal 75 Minuten statt einmal.

Die Auswahl kommt aus unseren eigenen Zahlen (Zepp-Uhren im Feld, Stand 23.09.2026), nicht aus
einer Modellliste:

| Uhr | im Feld | warum genau die |
|---|---|---|
| **Active 2 (Round)** | 3 Uhren, **10 Sessions** — meistgenutzt | **Césars Modell.** Seine Uhr startete waehrend eines Uploads **dreimal** neu — der Fall, fuer den der Waechter gebaut wurde. |
| **GTR 4** | 1 Uhr, 2 Sessions, schon auf 1.0.11 | **Klettermax' Modell.** „Nach circa 4,5 Minuten kommt dann das Ziffernblatt" — genau das Symptom, das 1.0.12 beheben soll. |
| **Balance 2** | 2 Uhren | Neuestes System → hier **muss** der Speicherwert ankommen. Ist ausserdem das Standardmodell des Simulators. |
| **T-Rex 3** | 9 Uhren (drei Schreibweisen, s. u.) | Die **Gegenprobe**: diese Uhr lief 94,8 Minuten am Stueck durch. Wenn hier etwas bricht, liegt es nicht am Modell. |

**Zuteilung:**

| Block | Uhr | Dauer |
|---|---|---|
| 0, 3, 4, 5 (Waechter, Negativtests, Upload) | **Active 2 (Round)** | ~45 min |
| 6 (Bildschirm, 10 min am Stueck) | **GTR 4** | ~15 min |
| 7.1 + 7.3 (Speicher, Spitze unter Last) | **Balance 2** | ~25 min |
| 7.2 (faellt sauber aus) | **GTR 4** — aeltestes Modell der vier | 5 min |
| 8 (GPS-Pfad) | egal, **Active 2** reicht | 10 min |
| optional: 3.3 + 6.1 wiederholen | **T-Rex 3** als Gegenprobe | ~15 min |

Gibt der Simulator ein Modell nicht her, ist das kein Beinbruch — dann rutscht der Block auf die
naechste Uhr in der Liste. **Nicht** verzichtbar ist die Trennung „neues System / aelteres System"
in Block 7: sie ist der einzige Test dafuer, dass `getPerformance` da fehlt, wo es fehlen darf.

> **Nebenbefund beim Zusammenstellen:** dasselbe Modell steht bei uns unter drei Namen in der
> Datenbank — `Amazfit%20T-Rex%203%20(8716545)`, `Amazfit T-Rex 3 (8716545)` und
> `T-Rex 3 (8716545)`. Eine Uhr, drei Zeilen; jede Modell-Statistik ist dadurch falsch. Steht in
> der TODO-Inbox, gehoert nicht in diesen Testlauf.

---

## 1. Vorbereitung

### 1.1 Sauber starten

Reihenfolge nicht vertauschen, sonst endlos `shake timeout` (Abend vom 13.09. verloren):

1. Code holen bei **ausgeschaltetem** Simulator, dann Cache weg.
2. **Zepp-Simulator** starten (lauscht auf 7650 + 7833, laedt das Uhr-System in die QEMU-VM).
3. `zeus dev` — verbindet sich nur, startet die VM **nicht** selbst. **Welcher Modus, ist
   nicht egal:**

   ```
   npm run dev
   ```

   setzt `DEV_FAKE_GPS = true` und ueberspringt den echten Ortungs-Zweig **komplett** — samt dem
   `onChange`-Zwischenspeicher aus 1.0.12. Fuer alle Bloecke ausser 8 ist das richtig und
   bequem (der Simulator speist kein GPS ein, ohne Fake-Spur kaeme keine Aufnahme zustande).
   **Fuer Block 8 dagegen:**

   ```
   npm run dev-echt
   ```

   Gleicher Simulator, aber `DEV_FAKE_GPS = false` — die Uhr liest die echte Ortung. Liefert der
   Simulator keine, bleibt die Anzeige auf „GPS suche…", und genau das ist dann der Befund.
4. **Bridge** einschalten, **5–10 s warten**, bis das Bridge-Log auf `status:opened` steht.
5. Erst jetzt die App in der VM starten.

```
rm -rf dist .zeus build
```

```
lsof -i :7650
```

Erfolgssignal im Bridge-Log: `status:opened` → `createWorker` → `[pumpfoil] app-side onInit`.
Vorher antwortet der Worker nicht — jeder Request der Uhr laeuft in `shake timeout`.

### 1.2 Eine eigene Test-Uhr koppeln

**Nicht** die echte Uhr eines Kontos verwenden, an dem spaeter Zahlen abgelesen werden:
`mem_peak_kb` ist der **hoechste je gemeldete** Wert und sinkt nie wieder, und `crash_count`
zaehlt hoch. Ein Emulator-Lauf wuerde die Feldzahlen dauerhaft verfaelschen. Also: im Emulator
neu koppeln, und die `device_tokens.id` notieren — die braucht jeder Pruefschritt.

### 1.3 Version gegenpruefen

Beide muessen `1.0.12` sagen, sonst testet man die alte Fassung:

```
grep -n 'APP_VERSION = ' page/index.js
```

```
python3 -c "import json;print(json.load(open('app.json'))['app']['version'])"
```

### 1.4 Das Pruefkommando

Nach **jedem** Schritt dieselbe Frage: was hat der Server gesehen? Auf dem Uhrenbildschirm ist das
nicht zu beantworten — nach einem Kill laeuft die App ja gerade nicht mehr. Auf der Server-VM,
**aus `watch-zepp/`** (das Skript sucht `server/.env` selbst, kein `cd` noetig):

```
../server/.venv/bin/python ../scripts/zepp-testlauf-stand.py --dev <ID>
```

Rein lesend. Zeigt Absturz-Phase, Speicher, und je Session die Bloecke, Luecken und die GPS-Dichte.

**Eine Falle, die sonst Stunden kostet:** der Absturz-Zaehler ist auf **60 Sekunden entprellt**
(`SF_DEBOUNCE_S`). Zwei Kills kurz hintereinander zaehlen als **einer**. `crash_phase` und
`crash_at` werden trotzdem jedes Mal frisch gesetzt — also darauf schauen, nicht auf den Zaehler,
oder zwischen zwei Kills eine Minute warten.

---

## 2. Test 0 — misst das Instrument ueberhaupt?

**Das ist der erste Test, und wenn er scheitert, sind die Tests 3.x im Emulator wertlos.**

Der Waechter liegt in `LocalStorage` des Gast-Systems. Ob die QEMU-VM diesen Schreibvorgang bei
einem `kill -9` schon auf die Platte des Rechners gebracht hat, weiss niemand vorher. Fehlt der
Eintrag danach, heisst das **nicht**, dass die App kaputt ist — es heisst, dass der Emulator diese
Frage nicht beantworten kann und sie an die echte Uhr geht.

1. App starten, bis der Startbildschirm steht (Phase 2 ist dann geschrieben).
2. 10 Sekunden warten.
3. QEMU-Prozess finden und **per PID** killen:

```
pgrep -fl mps2-an521
```

```
kill -9 <PID>
```

> `pkill -f "…"` trifft die eigene Befehlszeile mit — deshalb erst `pgrep`, dann `kill` per PID.

4. Simulator neu starten, App starten, warten bis CONFIG durch ist (Startbildschirm + Version).
5. Pruefen.

**Erwartet:** `ABSTURZ: 1x gezaehlt · zuletzt Phase 2 (Leerlauf)`.
**Wenn nichts kommt:** oben in der Tabelle „entscheidet der Emulator" alle Waechter-Zeilen auf
„nein" setzen und Block 3 auf der echten Uhr wiederholen (Uhr waehrend Aufnahme neu starten).
**Wenn Phase 1 statt 2 kommt:** die App hat den Startbildschirm nie erreicht — zu frueh gekillt.

---

## 3. Absturz-Waechter je Phase

Vier Phasen, vier Tests. Zwischen den Tests **eine Minute warten** (Entprellung) oder nur
`crash_phase` lesen. Nach jedem Test steht der Waechter wieder auf dem naechsten Lauf — er wird
beim Lesen geloescht, jeder Test faengt also sauber an.

### 3.1 Phase 1 — App-Start (`PHASE_BOOT`)

Das gefaehrlichste Fenster: Verbinden, Config holen, unbeendete Aufnahme wiederaufnehmen.

1. Simulator laeuft, Bridge steht.
2. App starten und **sofort** (< 2 s, noch waehrend „verbinde…") die QEMU-VM killen.
3. Neu starten, App starten, CONFIG abwarten.

**Erwartet:** Phase **1**.
**Wofuer:** wenn eine Uhr reproduzierbar hier stirbt, ist es der Wiederaufnahme-Pfad — dann ist
eine grosse liegengebliebene Aufnahme der Verdaechtige, nicht die Aufnahme selbst.

### 3.2 Phase 2 — Leerlauf (`PHASE_IDLE`)

Wie Test 0. Erwartet: Phase **2**.

### 3.3 Phase 3 — Aufnahme (`PHASE_RECORD`)

Der **teuerste** Fall: eine kaputte Aufnahme ist weg, ein kaputter Upload nicht.

1. Aufnahme starten, **mindestens 3 Minuten** laufen lassen.
   → Kuerzer nicht. Am 13.09. brach der GPS-Schreibpfad erst ab dem zweiten Block ab, und der
   braucht ueber zwei Minuten; jeder Zwanzig-Sekunden-Test haette das durchgewunken.
2. QEMU-VM killen (Strom weg mitten in der Aufnahme).
3. Neu starten, App starten.

**Erwartet:**
- Phase **3** beim naechsten CONFIG.
- **Die Aufnahme ist nicht weg.** `recoverActive()` findet den `active`-Eintrag, liest die
  Punktzahl aus der **Dateigroesse** (nicht aus den Kopfdaten, die nur alle zehn Punkte
  geschrieben werden) und legt sie in die Warteschlange. Der Startbildschirm zeigt einen offenen
  Upload.
- Nach dem Upload: Dauer der Session passt zur Aufnahmezeit ± wenige Sekunden — **nicht** neun
  Sekunden zu kurz. Genau dafuer liest `recoverActive` das Ende aus dem letzten Datensatz.
- Die GPS-Bloecke sind **lueckenlos** ab 0.

**Wenn die Aufnahme weg ist:** schwerster moeglicher Befund, Einreichung stoppen.

### 3.4 Phase 4 — Upload (`PHASE_UPLOAD`)

Césars Fall: die Uhr startete **waehrend eines Uploads** dreimal neu.

1. Eine lange Aufnahme erzeugen (siehe 3.3, gern 10+ Minuten — viele Bloecke).
2. Aufnahme beenden, Upload beginnt.
3. Mitten im Upload (Anzeige zeigt z. B. „40/150") die QEMU-VM killen.
4. Neu starten, App starten.

**Erwartet:** Phase **4**, und der Upload macht **dort weiter, wo er war** (s. 5.1).

---

## 4. Negativtests — der Waechter darf NICHT melden

Mindestens so wichtig. Ein Waechter, der bei jedem normalen Beenden anschlaegt, macht
`crash_count` zu Rauschen, und dann ist die Zahl fuer die Frage „hat 1.0.12 geholfen" wertlos.

### 4.1 Sauberes Verlassen

1. App starten, Startbildschirm abwarten.
2. Per Zurueck-Geste zum Zifferblatt (das ist `onDestroy` → `canaryClear()`).
3. App wieder starten.

**Erwartet:** **kein** Absturz gemeldet. `crash_count` unveraendert.

### 4.2 Sauber beenden nach Aufnahme + Upload

1. Kurze Aufnahme, beenden, Upload vollstaendig abwarten.
2. App verlassen, neu starten.

**Erwartet:** **kein** Absturz. (Der Waechter wird am Upload-Ende auf Leerlauf gesetzt und beim
Verlassen geloescht.)

### 4.3 Systemseitiges Wegraeumen im Leerlauf — Beobachtung, kein Urteil

Laesst man die App im Leerlauf lange offen, kann das System sie selbst beenden, ohne `onDestroy`.
Das meldet der Waechter als Phase 2. **Das ist kein Fehler der App**, aber es erklaert spaeter
Phase-2-Meldungen im Feld, die niemand als Absturz erlebt hat.

1. App im Leerlauf offen lassen, 15+ Minuten, nichts anfassen.
2. App wieder aufrufen, pruefen.

**Ergebnis nur notieren** — es gehoert in die Auswertung der Feldzahlen, nicht in ein Urteil ueber
die Fassung.

---

## 5. Upload-Unterbrechung und Wasserstand

Hier haengt der Fall aus GitHub #4 dran: Césars Upload starb reproduzierbar bei Block 108 von
2341, und **jeder** Versuch fing wieder bei 0 an. Seit 1.0.11 merkt sich die Uhr den Stand
getrennt nach Art (`sent:<uuid>` = `gps/accel`).

### 5.1 Uhr stirbt mitten im Upload (Schicht 3)

1. Lange Aufnahme (viele Bloecke), beenden, Upload laeuft.
2. Bei sichtbarem Fortschritt (z. B. 40/150) QEMU killen.
3. Neu starten, App starten, Upload weiterlaufen lassen.

**Erwartet:**
- Der Fortschritt beginnt sichtbar **nicht** bei 0.
- Am Ende: Bloecke **lueckenlos** 0..n, **keine** fehlenden Indizes.
- Doppelte kann es nicht geben (Unique-Constraint auf Session+Art+Index) — der Server
  ueberschreibt gleiche Bloecke, das ist gewollt.

### 5.2 Das Handy stirbt mitten im Upload (Schicht 5)

Der haeufigere Fall im Feld: Uhr laeuft, Handy nicht mehr.

1. Upload starten wie in 5.1.
2. Mitten drin die **Bridge / den App-Side-Worker** killen — **nicht** die VM.

```
pgrep -fl "side-service"
```

```
kill -9 <PID>
```

3. Auf der Uhr zuschauen.

**Erwartet:**
- Die App zeigt einen **Fehler** und bleibt bedienbar — sie darf nicht einfrieren und nicht
  aussehen, als sei sie fertig.
- **Kein** Absturz-Eintrag (die App ist ja nicht gestorben) — wichtig, damit Handy-Probleme nicht
  als Uhr-Abstuerze in der Statistik landen.
- Die Aufnahme bleibt in der Warteschlange, nichts wird verworfen.
4. Bridge wieder starten, 5–10 s warten, Upload erneut anstossen → laeuft ab dem Wasserstand
   weiter und wird vollstaendig.

### 5.3 Handy gar nicht verbunden

1. Bridge **aus** lassen.
2. Aufnahme starten, 3 Minuten, beenden.

**Erwartet:** Die Aufnahme laeuft und wird lokal gesichert; der Upload scheitert sichtbar
(`shake timeout`) und bleibt offen. **Kein** Datenverlust. Danach Bridge an → geht durch.

### 5.4 Zepp Simulator abschiessen (Schicht 4)

Die Konfigurationsschicht, die die VM startet. Ihr Tod nimmt in der Regel die VM mit — dann ist es
wirkungsgleich mit 5.1 und dient vor allem als Gegenprobe, dass beide Wege dieselbe Phase melden.

```
pgrep -fl zeus
```

**Erwartet:** dieselbe Phase wie beim direkten VM-Kill. Weicht sie ab, wurde in Wahrheit eine
andere Schicht getroffen als gedacht.

---

## 6. Bildschirm und Systemsperre

Der Hauptpunkt von 1.0.12 — und der, den der Emulator am wenigsten beweisen kann. Hier geht es
darum, dass der Code **laeuft**, nicht dass er im Feld wirkt.

### 6.1 Die Auffrischung laeuft waehrend der Aufnahme

Bis 1.0.11 stieg `heartbeat()` bei laufender Aufnahme in der ersten Zeile aus, die Bildschirmzeit
wurde also nie nachgefrischt — nach ~4,5 Minuten kam das Zifferblatt und zehn Sekunden spaeter war
die App weg (u352, GTR 4).

1. Aufnahme starten, **mindestens 10 Minuten** laufen lassen, Bildschirm nicht anfassen.
2. Im Uhr-Log (QEMU-Fenster, `LOG > pumpfoil > …`) mitlesen.

**Erwartet:** alle ~20 Sekunden eine Auffrischung, **keine** Ausnahme aus `setPageBrightTime`, die
App laeuft nach 10 Minuten noch. **Wenn die App weg ist:** Phase 3 muesste beim naechsten Start
gemeldet werden — und dann haben wir den Fehler von u352 im Emulator reproduziert, was gut ist.

### 6.2 Aufnahme ueberlebt Bildschirm-Aus

Soweit der Simulator ein Ausschalten des Bildschirms anbietet:

1. Aufnahme laeuft.
2. Bildschirm aus, 2 Minuten warten, wieder an.

**Erwartet:** die App ist noch da (`setWakeUpRelaunch(true)` oeffnet beim Aufwachen wieder **uns**
statt des Zifferblatts), die Aufnahme laeuft durch, kein Loch in den GPS-Bloecken.

### 6.3 System-Tastensperre

**Diese Zeile ist eine offene Frage, kein Test mit erwartetem Ergebnis.** Die Systemsperre schaltet
den Bildschirm selbst ab, und dagegen kommt eine Mini-App nicht an. Falls der Simulator sie
ueberhaupt kennt: einschalten, Aufnahme laufen lassen, beobachten, **notieren**. Was dabei
herauskommt, entscheidet, ob wir Nutzern die eigene Wassersperre empfehlen oder sie nur
informieren — das steht ohnehin noch zur Entscheidung an.

---

## 7. Speichermessung

`getPerformance` gibt es erst ab Zepp OS **API_LEVEL 4.0**. Der Simulator kann **je Uhrenmodell ein
anderes System laden** — genau dafuer ist dieser Block da.

### 7.1 Neues System: die Zahl kommt an

1. Ein aktuelles Uhrenmodell im Simulator laden (Balance 2 o. ae.).
2. Kurze Aufnahme + Upload, App verlassen, neu starten.

**Erwartet:** `SPEICHER: Spitze <n> KB von <m> KB`. Plausibel heisst: Spitze deutlich unter dem
Systemspeicher, und `mem_total_kb` passt zum Modell.
**Wenn 0 kommt:** entweder liefert die Uhr keine `app[]`-Zeile, oder `zosApp` ist gar nicht
geladen — im Uhr-Log nachsehen.

### 7.2 Aelteres System: es faellt sauber aus

1. Ein aelteres Uhrensystem laden (API_LEVEL < 4.0), soweit der Simulator eines anbietet.
2. Dasselbe durchspielen.

**Erwartet:** **keine** Ausnahme, keine sichtbare Aenderung, nur kein Speicherwert. Die Messung
darf niemals die App kosten, die sie misst.

### 7.3 Spitze unter Last

1. Sehr lange Aufnahme (20+ Minuten) mit Accel, dann Upload.
2. Speicherwert ablesen.

**Erwartet:** die Spitze liegt beim **Upload**, nicht bei der Aufnahme, und mit Abstand zum
Systemspeicher. Liegt sie nah am Limit, haben wir Césars dreifachen Neustart erklaert — dann ist
das der naechste Arbeitsauftrag und **nicht** die Einreichung.

---

## 8. GPS

Der Emulator kann die eigentliche Frage nicht beantworten: er hat keinen Funkempfang, und ein
simulierter Fix ist in der Regel dauerhaft gueltig. Genau der Zustand, in dem alter und neuer Code
**gleich** aussehen. Zwei Dinge lassen sich trotzdem pruefen:

**Erst `npm run dev-echt` starten** (s. 1.1). Unter `npm run dev` liegt der gesamte hier
gepruefte Code hinter `DEV_FAKE_GPS` und laeuft gar nicht — man saehe eine gruene Spur und haette
nichts getestet.

### 8.1 Der neue Pfad laeuft und wirft nicht

1. Aufnahme mit Ortung, 5 Minuten.
2. Uhr-Log lesen.

**Erwartet:** `onChange` wird registriert, keine Ausnahme, GPS-Bloecke wachsen gleichmaessig.
**Erwartet NICHT:** dass die Dichte hier etwas beweist.

### 8.2 Der Zwischenspeicher verfaellt

`GEO_CACHE_MS = 3000` — eine echte Funkluecke muss eine Luecke bleiben, es darf nichts erfunden
werden.

1. Soweit der Simulator die Ortung abschalten kann: waehrend laufender Aufnahme aus.
2. 30 Sekunden warten, wieder an.

**Erwartet:** in der Spur fehlen die 30 Sekunden — **nicht** 30 Sekunden derselben Position.
Stuenden dort 30 gleiche Punkte, waere die Dichte gerettet und die Daten falsch, und das ist der
schlechtere Tausch.

### 8.3 Die echte Frage — Feldtest, nicht Emulator

Nach der Freigabe von 1.0.12 dieselbe Messung wie am 22.09.: GPS-Dichte je Aufnahme ueber
5 Minuten. Der Stand vorher, an frischen Daten vom 22.09. nachgemessen: **0,17** und **0,12**
Punkte/s (Schnitt ueber neun Aufnahmen: 0,23). Zum Vergleich Garmin 0,84, Apple 0,86. Steigt die
Zahl nicht deutlich, ist der naechste Verdaechtige der Ortungsmodus der Uhr („Energiesparen").

---

## 9. Protokoll

Ausgefuellt ist das die Entscheidungsgrundlage fuer die Einreichung — nicht der Eindruck am Ende
des Abends.

| # | Test | Uhr | Erwartet | Beobachtet (23.09.2026) | OK? |
|---|---|---|---|---|---|
| 0 | Waechter ueberlebt harten Kill | Active 2 | Phase 2 | Phase 2, 07:56:07 | ✅ |
| 3.1 | Kill in Phase Start | Active 2 | Phase 1 | **nicht ansteuerbar** — s. u. | – |
| 3.2 | Kill im Leerlauf | Active 2 | Phase 2 | = Test 0 | ✅ |
| 3.3 | Kill in Aufnahme (16 min) | Active 2 | Phase 3 + Aufnahme gerettet | Aufnahme vollstaendig (651 s, 54+87 Bloecke lueckenlos); **Phase kam als 2 statt 3** | ✅ / ⚠️ |
| 3.4 | Kill im Upload | Active 2 | Phase 4 | Phase 4, 08:59:55 | ✅ |
| 4.1 | Sauber verlassen | Active 2 | **keine** Meldung | Zaehler blieb 1 | ✅ |
| 4.2 | Sauber nach Upload | Active 2 | **keine** Meldung | Zaehler blieb 3 | ✅ |
| 4.3 | Systemseitig weggeraeumt | Active 2 | nur notieren | offen | – |
| 5.1 | Upload nach VM-Kill | Active 2 | faengt nicht bei 0 an, lueckenlos | **zweimal** fortgesetzt, 0 doppelte Bloecke | ✅ |
| 5.2 | Bridge-Kill im Upload | Active 2 | Fehler sichtbar, kein Absturz, kein Verlust | offen (5.3 deckt den Kern) | – |
| 5.3 | Ohne Handy aufnehmen | Active 2 | nichts verloren | unfreiwillig eingetreten: „shake timeout", App bedienbar, nichts verworfen | ✅ |
| 5.4 | Simulator-Kill | Active 2 | gleiche Phase wie 5.1 | offen | – |
| 6.1 | 10 min Aufnahme am Stueck | **GTR 4** | App lebt, Bildschirm wach | offen | – |
| 6.2 | Bildschirm aus/an | **GTR 4** | Aufnahme laeuft durch | offen — aber: Aufnahme hat **2 h Laptop-Standby** ueberlebt und danach vollstaendig hochgeladen | (✅) |
| 6.3 | Tastensperre | **GTR 4** | nur notieren | offen | – |
| 7.1 | Speicher neues System | Active 2 (statt Balance 2) | plausible Zahl | **1288 von 3072 KB (42 %)** | ✅ |
| 7.2 | Speicher altes System | **GTR 4** | keine Ausnahme | offen | – |
| 7.3 | Spitze unter Last | Active 2 | Abstand zum Limit | 289 Bloecke: unveraendert 1288 KB · nach 2,5 h / 281 Bloecke: **1547 KB (50 %)** | ✅ |
| 8.1 | GPS-Pfad laeuft (`dev-echt`) | Active 2 | keine Ausnahme | laeuft, schreibt, **118 % der zum eigenen Takt erwarteten Punkte** | ✅ |
| 8.2 | Cache verfaellt (`dev-echt`) | Active 2 | Luecke bleibt Luecke | offen | – |

### Was der erste Durchlauf ergeben hat

**Der teuerste Test ist bestanden.** Eine 16-Minuten-Aufnahme hat einen `kill -9` mitten im Lauf
vollstaendig ueberlebt: 967 s, 798 GPS-Punkte, 12753 Accel-Werte, kein fehlender Block. Danach
wurde derselbe Upload **zweimal** abgeschossen und setzte beide Male exakt dort fort, wo er stand:

    gps:   0..48   08:54:37-08:54:48  |  49..79   08:56:07-08:56:13
    accel: 0..43   08:56:13-08:56:28  |  44..99   08:59:18-08:59:35

Kein Block ging doppelt raus. Césars Befund aus GitHub #4 („the transfer seemed to restart from
zero") ist damit **belegt behoben**, nicht nur behauptet. Nachweisbar ist das serverseitig an
`ingest_chunks.received_at`: ein erneut gesendeter Block traegt eine neue Ankunftszeit. Wer das
nachstellt, misst also nicht den Bildschirm, sondern die Zeitstempel.

**🔴 GEFUNDENER FEHLER — der Absturz-Waechter verliert seine Auskunft, wenn sie nicht ankommt.**
`canaryRead()` loescht den Merker SOFORT beim Lesen. Scheitert die Meldung danach (auf Zepp der
Normalfall: Handy weg, `shake timeout`), lebt die Phase nur noch im RAM — und der naechste
App-Start ueberschreibt sie mit der eigenen. Genau so beobachtet: Kill in der Aufnahme (3),
Neustart ohne Bridge, zweiter Neustart meldete **2**. Die Gegenprobe steht in 3.4: mit stehender
Bridge kam die richtige Phase (4) an. Der Waechter verliert seine Information also ausgerechnet
in der Lage, fuer die er gebaut wurde. **Fix:** erst nach erfolgreichem CONFIG loeschen, zwei
Schluessel statt einem (laufende Phase / noch nicht gemeldeter Absturz).

**3.1 laesst sich nicht von Hand treffen.** `PHASE_BOOT` → `PHASE_IDLE` laeuft synchron in
`build()` durch (Waechter setzen → Widgets → `recoverActive()` → Leerlauf). Das Fenster liegt im
Millisekundenbereich. Der Mechanismus ist durch 3.2 ohnehin belegt; die Phase faellt zufaellig
mit, wenn sie faellt.

**Die Speicher-Vermutung haelt NICHT.** Cesars dreifacher Neustart im Upload liess vermuten, die
App stehe am Limit. Auf der Active 2 blieb die Spitze ueber einen 289-Block-Upload hinweg
unveraendert bei 1288 von 3072 KB. 42 % im Leerlauf ist viel, aber der Upload treibt sie nicht.
Wer die Ursache sucht, sucht woanders weiter.

**Der neue GPS-Zweig verliert nichts — gemessen, nicht gehofft.** Bis hierher lief jeder Test mit
`npm run dev`, also mit `DEV_FAKE_GPS = true`, und damit wurde der gesamte echte Ortungszweig samt
dem `onChange`-Zwischenspeicher **kein einziges Mal ausgefuehrt**. Mit `npm run dev-echt` dann
doch, und das Ergebnis braucht eine Zwischenrechnung, weil die rohe Zahl in die Irre fuehrt:

| Session | Dauer | Accel gemessen | GPS-Dichte roh |
|---|---|---|---|
| #9642 (fake) | 651 s | 17 Hz | 0,83 |
| #9644 (fake) | 967 s | 13 Hz | 0,83 |
| #9671 (**echt**) | 9013 s, davon **7200 s Laptop zugeklappt** | 2 Hz (Artefakt) | 0,12 |

0,12 ist genau der Feldwert — und trotzdem kein Beleg fuer den Feldfehler. **Der Accel ist die
Uhr, an der alles andere zu messen ist:** rechnet man nur die aktive Zeit (≈1813 s), liegt er bei
12,2 Hz, praktisch identisch mit #9644. Die VM lief also normal, sie stand nur zwei Stunden still.
Bei diesem Takt (12,2/25 = 0,49) waeren 888 GPS-Punkte zu erwarten — angekommen sind **1050, also
118 %**. Derselbe Faktor wie im Fake-Lauf.

**Der Ortungspfad liefert damit auf praktisch jeden Abtast-Takt einen Punkt**, und das ist das
Gegenteil des Feldmusters (4 s an, 22 s aus — dort fehlte die Position, waehrend die App normal
weiterlief). Die ABSOLUTE Dichte bleibt Feldfrage, weil die Uhr des Emulators wandert.

**Merke fuer den naechsten Durchlauf:** `sessions.accel_hz` und die GPS-Dichte sind fuer jede
Session mit einer Pause **bedeutungslos** — beide werden ueber die Gesamtspanne gerechnet. Erst
die aktive Zeit herausrechnen, dann vergleichen.

**Beobachtung, ausdruecklich als Vermutung:** in die Dateien landet weniger, als die Takte
erwarten — 798 GPS-Punkte statt ~967 bei gefaelschtem GPS (das jede Sekunde einen Fix hat), Accel
13,2 Hz statt der angeforderten 25. Naheliegendste Erklaerung ist, dass QEMU die Timer nicht
haelt. Der Emulator kann das nicht entscheiden. **Nicht verwechseln** mit dem Fehler vom
13.09.2026: dort brach der Schreibpfad ab, hier fehlt kein Block — es sind nur weniger als
erwartet.

**Einreichen nur**, wenn 3.3 die Aufnahme rettet, 4.1 und 4.2 schweigen, 5.1 nicht bei 0 anfaengt
und 7.3 Abstand zum Limit zeigt. Alles andere ist Diagnose, die auch noch eine Runde spaeter
kommen darf — diese vier nicht.

---

## 10. Dauer

Die langen Laeufe (3.3, 3.4, 6.1, 7.3) sind der Grund, warum das nicht in zwanzig Minuten geht.
Zusammen etwa **60–75 Minuten reine Laufzeit**, plus Neustarts. Kuerzen laesst sich das nicht,
ohne genau die Fehler wieder durchzuwinken, die am 13.09. nur lange Laeufe gezeigt haben: der
GPS-Schreibpfad brach ab dem zweiten Block ab, der Accel-Pfad ebenso, und die Zeitachse kippte
erst bei 142 Bloecken.

---

## 10b. Eigenarten des Simulators, die Zeit kosten (gemessen am 23.09.2026)

Keine App-Fehler — aber jede davon hat an dem Abend eine Viertelstunde gekostet, weil sie wie
einer aussieht.

- **`zeus dev` baut NUR fuer das im Dialog gewaehlte Geraet.** Jede Uhr im Simulator traegt eine
  eigene Installation. Wer das Modell wechselt, ohne neu zu bauen, testet dort einen ALTEN Stand
  — und sieht die Aenderung von eben nicht. Am 23.09. zeigte die T-Rex 3 die neue Meldung
  korrekt, die GTR 4 nicht; Ursache war allein der Build von 40 Minuten vorher. **Nach jedem
  Modellwechsel `npm run dev` erneut laufen lassen** und im Log die Zeile
  `device sources: …` gegen die Modellnummer pruefen (GTR 4 = `7930113`, Active 2 = `10092803`).
- **🔴 Die GTR 4 laeuft im Simulator gar nicht** (Jan, 23.09.: „die gtr 4 ging nie bisher").
  Der Plan hatte sie fuer die Bloecke 6 und 7.2 vorgesehen, weil sie Klettermax' Modell ist —
  das geht so nicht. **Fuer 7.2 wird ein anderes Modell gebraucht, das `getPerformance` NICHT
  kann.** T-Rex 3 und Active 2 koennen es (sie melden 1707 bzw. 1292 KB), pruefen also den
  Schutz gar nicht. Durchprobieren, was der Simulator hergibt; meldet jedes Modell einen Wert,
  ist der Rueckfallpfad im Simulator NICHT pruefbar — dann bleibt als Absicherung nur, dass der
  Aufruf in zwei geschachtelten try/catch steckt, und das gehoert dann auch so notiert statt als
  „getestet".
- **Manche Modelle starten die App erst im zweiten Anlauf.** Jan, 23.09.: „ich habe mehrfach die
  gtr mit npm run dev gestartet, da passiert leider nichts, dann starte ich die gts 4 und danach
  die gtr 4 und dann oeffnet die app". Ein anderes Modell dazwischen zu laden hilft.
- **Die Bridge kann `status:opened` melden, ohne unseren Worker zu starten.** Das Erfolgssignal
  ist NICHT `status:opened`, sondern die Kette danach: `peerAppLaunched` → `createWorker` →
  `[pumpfoil] app-side onInit`. Fehlt die, steht die Bridge und antwortet trotzdem niemand —
  die Uhr schickt `shake send` ins Leere. Genau so am 23.09. ueber eine Stunde.

---

## 11. Wiederaufsetzpunkt (Stand 23.09.2026, 12:10)

**In welchem Zustand der Aufbau steht:**
- Simulator auf **Amazfit Active 2 (Round)**, gekoppelt als Geraet **#1125** an `jan@kechel.de`
  (bewusst nicht `emu-test` — Jan, 23.09.: „meine sessions sind oeffentlich, die loesche ich
  spaeter wieder, ich wechsel doch nicht staendig mein login").
- **⚠️ Zuletzt lief `npm run dev-echt`, also `DEV_FAKE_GPS = false`.** Fuer alle Bloecke ausser 8
  gehoert der Schalter wieder auf `npm run dev` — sonst kommt ohne Simulator-Ortung keine
  Aufnahme zustande.
- `crash_count` steht bei **4**, zuletzt Phase 2. Jeder weitere Test zaehlt darauf weiter.
- Speicher-Hoechststand **1547 KB** — der Wert SINKT NIE (`GREATEST` auf dem Server). Ein
  kleinerer Wert ist danach nicht mehr messbar, ohne neu zu koppeln.

**Testsessions zum Loeschen** (alle auf Geraet #1125, alle `is_pumpfoil=false`, keine im Feed):
`#9640` (23 s) · `#9642` (651 s) · `#9644` (967 s) · `#9671` (9013 s, **mit Zwei-Stunden-Loch** —
die gehoert auf jeden Fall weg, sonst steht sie irgendwann in einer Auswertung).

**Was noch offen ist**, nach Wert sortiert:

1. **🔴 Den Waechter-Fix einbauen** (Claude) und danach 3.3 einmal wiederholen. Ohne ihn ist die
   Feldmessung nach dem Release weniger wert — die Absturzphase IST das Messgeraet.
2. **7.2 — Speichermessung auf einem aelteren System** (GTR 4). 5 Minuten. Fehlt `getPerformance`
   und der Schutz greift nicht, stirbt die App beim Start auf allen aelteren Amazfits gleichzeitig.
   Kleines Risiko, grosser Schaden, Korrektur dauert Wochen.
3. **6.1 — zehn Minuten Aufnahme am Stueck** (GTR 4). Der Emulator kann das Wachbleiben nicht
   entscheiden, aber er kann zeigen, dass die Auffrischung laeuft und nicht wirft.
4. 8.2 (Cache verfaellt), 5.2 (Bridge-Kill im Upload), 5.4 (Simulator-Kill), 4.3 (systemseitig
   weggeraeumt) — Varianten dessen, was heute schon mehrfach lief. Nice to have.

**Nicht mehr noetig:** 3.1 (Fenster im Millisekundenbereich, nicht ansteuerbar) und 3.2
(= Test 0, schon gelaufen).
