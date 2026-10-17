# Suunto-Uhren als Recorder (SuuntoPlus-App)

Stand 17.10.2026. Auftrag (Jan): „eine richtige Suunto-App bauen, inkl. allem: eigene Datenseiten,
5 zusaetzliche Felder _und_ Synchronisieren mit dem Handy fuer Rohdaten (abschaltbar in den
Einstellungen der Uhr), Positionsmeldungen, Uploads waehrenddessen, in der Pause, danach."

Kennzeichnung wie in `HUAWEI.md`: **[DOK]** SuuntoPlus-Referenz (Editor 1.42.0,
`~/suuntoplus-editor/entpackt/extension/developer-doc/reference.html`, nicht im Repo) ·
**[FORUM]** forum.suunto.com · **[SIM]** im Simulator-Code des Editors nachgelesen ·
**[UNKLAR]** erst eine echte Uhr entscheidet.

Heute kommt von Suunto nur der Cloud-Import (`server/app/api/suunto.py`): GPS + Puls aus der
FIT-Datei, keine Beschleunigung. Die App kommt **dazu**, sie ersetzt den Import nicht.

## Was eine SuuntoPlus-App kann

| Thema | Befund |
|---|---|
| Uhren | UI2: 9 Peak Pro (n, 240²), Vertical (o, 280²), Race/Race S/Race 2/Vertical 2/Ocean/Ocean Lite (q, 466²) [DOK]. UI1 (Suunto 3/5/9) wird nicht mehr gepflegt [DOK] — wir bauen nur n/o/q. |
| Sprache | ES5 (Duktape), kein `Date`, Typed Arrays nur Int8/Uint8/Float32 [DOK]. Globale `function` sind fuer die Firmware reserviert, eigene Funktionen als `var f = function…` [DOK]. |
| Lebenszyklus | `onLoad` → `evaluate` jede Sekunde (auch VOR dem Start) → `onExerciseStart/Pause/Continue/End`, `getUserInterface`, `getSummaryOutputs` [DOK]. Die App laeuft nur waehrend einer Aktivitaet. |
| Beschleunigung | Quelle `Fusion/Zapp/Accelerometer`, 50 Hz, x/y/z je 25 Werte alle ~0,5 s, `time` des ersten Werts [DOK]. Laut Forum kommt `onAccelerometer` auf echten Uhren NICHT, die Werte stehen stattdessen in `input` beim `evaluate` [FORUM, brechtvb]. Einheit nicht dokumentiert; der Simulator wuerfelt Werte um 6/7/8 (|a|≈12) und `time` in ms [SIM] → vermutlich m/s². **Die App nimmt beide Wege und erkennt die Einheit selbst** (Median von |a| im Stand ≈ 9,8 → m/s², ≈ 1 → g, ≈ 1000 → mg). |
| Eingaenge | hoechstens 10 `in`-Quellen; eine nicht existierende Quelle laesst die App gar nicht laden [DOK] → nur dokumentierte Pfade. |
| Ausgaenge | hoechstens 25 `out` laut Referenz, der Editor erlaubt nur **20**; davon hoechstens **5 mit `log:true`**, einmal je Sekunde ins Workout geschrieben, in der Suunto-App als Kurve [DOK]. Dazu hoechstens 8 (praktisch 4–5) Werte in der Zusammenfassung [DOK]. |
| Anzeige | HTML-Vorlagen mit `<eval>` (Formatierer `script`, `keyValue`), `setText`, eingeschraenktes `<canvas>` (Linien, Boegen, `fillText`), hoechstens 2 PNG [DOK]. Mehrere Seiten ueber `getUserInterface` + `unload("_cm")` [DOK]. |
| Tasten | `<userInput><pushButton name="up|down" onClick="$.put('/Zapp/{zapp_index}/Event', n…)"/>` → `onEvent` [DOK]. **Nur `down` belegen** (blaettert im Kreis, wie Suuntos Beispiel MultiView): `up` ist Start/Pause/Stopp — mit `up` belegt liess sich die Aufnahme im Simulator nicht anhalten (17.10.). Vibration/Ton: `playIndication` [DOK]. |
| Einstellungen | `data.json` + `settings` im Manifest, bearbeitet in der **Suunto-Handy-App** [DOK]. Dazu `localStorage` (Strings + Objekte) auf der Uhr [DOK]. |
| Netz | **keins**. Kein HTTP, kein WLAN fuer Apps [DOK + FORUM]. |
| Bluetooth | `type:"device"`: die Uhr ist **Central**, verbindet sich zu einem Geraet, das eine Service-UUID bewirbt; `writeChar` hoechstens **20 Bytes**, Notifications vom Geraet, 2 Verbindungen auf UI2-Uhren, automatisches Wiederverbinden [DOK]. Ein „Suche"-Fenster bleibt offen, bis `output.con != 0` [DOK] — wir setzen `con` sofort, damit die App auch ohne Handy startet [UNKLAR, ob die Firmware das so hinnimmt]. |
| Speicher | sehr knapp, Code fuer selten Gebrauchtes in `ext*.js` per `evalFile` [DOK]. Messbar ueber `/Ui/Script/MemoryPool/*` [SIM, nicht dokumentiert → nicht als `in` benutzen]. |
| Verteilung | Editor (VS Code, nur Windows/macOS) → „Deploy to watch" per USB/BLE; Veroeffentlichung ueber das Suunto-Partnerprofil in den SuuntoPlus Store mit Pruefung. |

## Aufbau: drei Wege, wie Daten zu uns kommen

```
            ┌──────────── Uhr (SuuntoPlus-App) ────────────┐
            │ Lauf-Erkennung + Datenseiten + Alarme (lauf.js)│
            │ Pump-Zaehler auf der Uhr (50 Hz)               │
            └──────┬───────────────────────┬────────────────┘
     (1) immer     │ 5 Log-Kanaele/s       │ (2) wenn eingeschaltet + Handy in Reichweite
                   ▼                       ▼ BLE, Uhr schreibt 20-Byte-Pakete
         Suunto-Cloud (Workout)      unsere Handy-App (GATT-Server, wirbt die Service-UUID)
                   │ Webhook               │ Chunks wie bei der Huawei-Bruecke
                   ▼                       ▼
            server/app/api/suunto.py   /api/ingest/session … (Rohdaten, Plattform „suunto")
                   └────────► eine Session (Zusammenfuehren, s. unten) ◄──┘
```

1. **Ohne Handy:** GPS + Puls kommen wie heute ueber die Cloud, dazu die 5 Log-Kanaele. Keine
   Rohdaten, aber Pump-Zahl, Kadenz und „auf dem Foil" von der Uhr selbst.
2. **Mit Handy (Einstellung „Rohdaten ans Handy", Standard an):** die Uhr streamt Beschleunigung
   (int16, 2048 = 1 g wie alle Uhren) + GPS/Puls je Sekunde an unsere Handy-App. Die laedt wie die
   Huawei-Bruecke hoch — waehrend der Aufnahme, in der Pause (`/analyze`, Session bleibt „live")
   und am Ende (`/complete`). Faellt die Verbindung aus, puffert die Uhr, was in den Speicher passt,
   und schickt es beim Wiederverbinden nach; was verloren geht, fehlt als Luecke (Zeitachse aus
   `t0_ms` je Chunk, also kein Versatz).
3. **Positionsmeldung + Live-Status:** erster GPS-Fix → Handy → `POST /api/devices/position`
   (wie alle Uhren). Ohne Handy gibt es keine Meldung; „gerade am Pumpen"
   faellt dann auf den Spot aus dem Upload zurueck.

**Zusammenfuehren:** Kommt fuer dasselbe Zeitfenster eine Bruecken-Session (Rohdaten) und spaeter
das Cloud-Workout, gewinnt die Bruecken-Session; der Cloud-Import legt dann KEINE zweite Session
an, sondern merkt sich nur den Workout-Schluessel (und fuellt GPS-Luecken, falls die Bruecke
welche hat — zweiter Schritt). Ohne Bruecken-Session laeuft der Import wie heute und liest
zusaetzlich die Log-Kanaele.

## Funkprotokoll Uhr ↔ Handy (Version 1)

Service-UUID `0022c44b-105d-4fba-842c-f2c3c143eb6b`, zwei Characteristics (gleiche Basis, letztes
Byte der ersten Gruppe gezaehlt):

| UUID | Richtung | Art |
|---|---|---|
| `0022c44c-105d-4fba-842c-f2c3c143eb6b` | Uhr → Handy | Write (mit Antwort) |
| `0022c44d-105d-4fba-842c-f2c3c143eb6b` | Handy → Uhr | Notify |

Alle Zahlen little-endian. Byte 0 = Pakettyp.

**Uhr → Handy** (je hoechstens 20 Bytes):

| Typ | Inhalt |
|---|---|
| `0x01` HALLO | ver u8, hz u8, display u8 (`n`/`o`/`q` als ASCII), appVer u16 (×100), uhrId u32 (Zufall, einmal in `localStorage`), sitzung u32 (Startzeit, Unix-s; 0 = noch keine Aufnahme), flags u8 (bit0 Aufnahme laeuft, bit1 Pause), einheit u8 (0 m/s², 1 g, 2 mg) |
| `0x02` ACCEL-Kopf | block u16, t_ms u32 (aktive Zeit seit Start), n u8 (Werte im Block), dann bis zu 12 Bytes Nutzdaten |
| `0x03` ACCEL-Teil | block u8 (unteres Byte), teil u8, 18 Bytes Nutzdaten |
| `0x04` GPS | sek u16 (aktive Sekunde), lat i32, lon i32 (Grad·1e7), speed u16 (cm/s, 0xFFFF = unbekannt), hr u8 (0 = keiner), acc u8 (m, 255 = unbekannt), alt i16 (m), nr u16 (laufende Nummer, die quittiert wird), frei u8 — 20 Bytes |
| `0x05` EREIGNIS | nr u8 (laufend, umlaufend), art u8 (1 Start, 2 Pause, 3 Weiter, 4 Ende, 5 Verwerfen), t_ms u32, sek u16 |
| `0x06` POSITION | lat i32, lon i32 — erster Fix im Startzustand, einmal je App-Start |

Ein Block = die Werte eines Beschleunigungs-Aufrufs (50 Hz: 25 Werte = 150 Bytes = Kopf + 8 Teile;
25 Hz: 13 Werte = 78 Bytes = Kopf + 4 Teile). Werte int16 x,y,z verschachtelt, 2048 = 1 g.

**Handy → Uhr** (Notify):

| Typ | Inhalt |
|---|---|
| `0x81` QUITTUNG | block u16 (Accel bis einschliesslich angekommen), nr u16 (GPS bis einschliesslich, laufende Nummer), ereignis u8 (Nummer des letzten Ereignisses), flags u8 (bit0/1/2: block/sek/ereignis gueltig) |
| `0x82` STATUS | flags u8 (bit0 Konto verbunden, bit1 Server erreichbar, bit2 laedt hoch), offen u16 (Chunks, die noch zum Server muessen) |
| `0x83` KONFIG | nr u16, anzahl u16, bis zu 15 Bytes ASCII-JSON (Teile in beliebiger Reihenfolge): Seiten (klassisch UND freie Layouts), Zonen, Foils, Alarme, `spr` = Sprachspalte — aus `/api/devices/config?p=suunto`, gekuerzt von `SuuntoKonfig` (Kotlin/Swift); einmal je Verbindung, die Uhr speichert sie (`localStorage` „konfig") |

Die Uhr haelt unquittierte Bloecke in einem Ringpuffer und schickt nach dem Wiederverbinden ab
Quittung+1 nach. Durchsatz bei 50 Hz: ~18 Pakete/s, bei 25 Hz ~10 Pakete/s — **[UNKLAR], ob die
Uhr das schafft**; die Rate ist deshalb eine Einstellung (Standard 25 Hz wie Garmin, 50 Hz
waehlbar), und die Uhr meldet den gemessenen Rueckstand im HALLO/Status.

## Die 5 Log-Kanaele (Weg 1)

**Datentyp (17.10. aus der Referenz, „Technical details"):** jeder Kanal ist eine Zahl, gespeichert als
Probe `{ChannelId, Value}` mit eigenem Zeitstempel (ms), einmal je `evaluate` und **nur wenn sich der
Wert aendert**. Die Beispielwerte der Referenz sind float32 (`1.7058346271514893`, `156.39999389648438`)
-> 24 Bit Mantisse: Ganzzahlen exakt bis 16.777.216, bei 5000 bleibt ~0,0005 Aufloesung. `format`
(z. B. `Count_Fivedigits`) betrifft nur Anzeige/Graph in der Suunto-App, nicht den gespeicherten Wert
[Vermutung, an einer echten FIT pruefen]. Zwei Werte in einem Kanal gehen also nur bis 24 Bit zusammen
(z. B. 2 x 12 Bit = je 0…4095). Daneben: `getSummaryOutputs` (Werte am Ende, im Kopf der Aufzeichnung,
praktisch 4–5) und stille Runden.

**Runden:** an Anfang und Ende jedes Laufs eine stille Runde (`$.put("/Activity/Trigger", 23)`, keine
Anzeige, keine Vibration; nur wo `{{ HAS_SILENT_LAP }}` = 1, also UI2-Uhren). Laeufe und Pausen erscheinen
in der Suunto-App als Runden und in der FIT als Lap-Grenzen, um die Erkennungs-Verzoegerung spaeter
(~4 s Start, ~3 s Ende).

**Versionierung (Jan, 17.10.):** der Kanal-NAME traegt die Bedeutung samt Version. Aendert sich ein
Format, kommt ein neuer Name (`pf_e1` -> `pf_e2`); der Server erkennt Kanaele am `VariableId` im Kopf der
Aufzeichnung und liest, was da ist — aeltere Uhren schicken eben weniger, nichts wird falsch gedeutet.
Mehrere Werte je Kanal als Dezimalstellen, immer ganzzahlig <= 999.999 (exakt in float32, passt in
`Count_Sixdigits`, falls die Uhr auf die Formatgrenze kappt). Ein Kanal ist frei.

| Name | Stellen | Inhalt | warum |
|---|---|---|---|
| `pf_e1` | `L Z AA BB` | L = Lauf (0 dazwischen, sonst Laufnummer mod 9 + 1) · Z = alle Pumps mod 10 · AA = neuester Pump der Sekunde, BB = der davor: 01–99 = 0,01–0,99 s vor dem Datenpunkt minus 1 s Erkennungsverzoegerung, 00 = keiner | Laufgrenzen und jeder Pump mit Zeitpunkt (~0,04 s am Server). Z aendert sich bei jedem Pump — sonst fehlten zwei Sekunden mit gleichem Versatz (geloggt wird nur bei Aenderung), und verlorene dritte Pumps je Sekunde sind zaehlbar |
| `pf_b1` | `XX YY ZZ` | Bewegungsstaerke je Uhr-Achse (Streuung in der Sekunde), je 2·√mg: mg = W²/4 (10 = 25 mg, 20 = 100 mg, 99 = 2,45 g) | Pumpen vs. Gleiten vs. Paddeln, Richtung der Bewegung |
| `pf_s1` | `PPP SSS` | PPP = groesste Abweichung von 1 g (10 mg), SSS = staerkster Pump der Sekunde (Ausschlag am Maximum, mg) | Aufsetzen/Stuerze/Wasserstart; Pump-Kraft und Ermuedung |
| `pf_l1` | `NNN RRR` | Armhaltung aus der mittleren Schwerkraft: NNN = Neigung + 90 (0–180°), RRR = Drehung um die Laengsachse (0–359°), Achsen wie die Uhr sie liefert | Uhr am Arm oder am Brett, Haltung im Lauf |

Referenz-Dekoder: `watch-suunto/test/aufnahme.test.mjs` („Pump-Marker im Workout-Log (pf_e1)"). Gegen die
vorige Fassung (getrennte Kanaele, 0,001 s) gleich genau: 84/100 Server-Pumps innerhalb 0,25 s.

**Zeitzuordnung:** jede Probe hat laut Referenz einen eigenen Zeitstempel (`TimeISO8601` mit ms, UTC),
Suunto ordnet also selbst zu — wir schicken keine Zeit mit. Die Pump-Versaetze beziehen sich auf diesen
Datenpunkt. OFFEN: ob die FIT der Cloud-API die ms behaelt oder auf Sekunden rundet. Rundet sie, verschiebt
sich jeder Pump um denselben Bruchteil (Phase von `evaluate` zur vollen Sekunde) — Abstaende zwischen Pumps
und die Kadenz bleiben richtig, die absolute Lage um < 1 s unsicher [Vermutung, an der ersten echten FIT
pruefen].

Pump-Marker (Jans Idee, 17.10.2026): die Uhr erkennt einen Pump erst bis zu ~1 s spaeter (Periode +
Filter), darum ist jeder Marker um genau 1 s verzoegert, der Bruchteil liegt immer in [0, 1). Die
Nummer aendert sich bei jedem Pump — die Uhr speichert einen Log-Wert nur, wenn er sich aendert
[DOK], so geht keiner verloren, und ein dritter Pump in einer Sekunde faellt als fehlende Nummer auf.
Werte sind Gleitkomma [DOK, „Value": 1.7058…]; bei ~5000 Pumps bleibt ~1/2000 s Aufloesung.
Was die Uhr als Pump erkennt, laesst sich nachtraeglich NICHT verbessern — nur mit Rohdaten (Weg 2).

Ob diese Kanaele in der FIT-Datei stehen, die wir ueber `/v2/workout/exportFit` holen, ist
**[UNKLAR]** — erst am ersten echten Workout pruefen.

## Pump-Zaehler auf der Uhr

Streaming-Fassung von `server/app/ml/pumps.py:find_pumps_cadence`: Schwerkraft je Achse per
Tiefpass (0,25 Hz), dynamische Beschleunigung auf die Schwerkraft projiziert (wie
`vertical_against_gravity`), Bandpass 0,3–3 Hz, RMS-Gate 0,008 g ueber 4 s, Kadenz per
DFT (Hann, 4 s, Bins wie der Server) auf 10 Hz im Band 0,8–2 Hz, je Periode ein Pump; dessen
Zeitpunkt ist das Signal-Maximum der Periode (Parabel, Filterverzoegerung abgezogen). In Node gegen den Server-Zaehler
auf echten Garmin-Laeufen geprueft (`watch-suunto/test/`).

**Gegen die Brett-Wahrheit anderer Fahrer** (`scripts/suunto-pumpen-paare.py`, rein lesend, 17.10.2026):
10 Paare Brett-Handy + Uhr mit Ausrichtung <= 400 ms (u2, u244, u683 mit Apple Watch Series 10 u. a.),
36 Laeufe: Brett 2346, Server-Zaehler auf der Uhr 2353, **Suunto-Zaehler auf der Uhr 2365 (+0,8 %)**;
Zeitpunkte je Brett-Pump zum naechsten Suunto-Pump median 0,067 s, p90 0,215 s, 92 % unter 0,25 s
(inkl. Ausrichtungsfehler). **Foil Scoot** (u267, Brett #16729 + Uhr #16719, 8 Laeufe, 49 min): Brett
4389, Server-auf-Uhr 4368, Suunto 4457 (+1,5 %) — dort nur die Anzahl, die Feinausrichtung scheitert
(Brett und Arm bewegen sich beim Scooter anders). Einschraenkung: auch die „Brett-Wahrheit" zaehlt mit
demselben Kadenz-Verfahren; der Vergleich zeigt, dass die Uhr den Server trifft, nicht mehr
(Grenzen des Verfahrens: `docs/GROUND-TRUTH.md`).

## Code

- `watch-suunto/quelle/` — main.js-Bausteine (ES5), `lauf.js` + `seiten.js` kommen aus
  `watch-huawei/common/` (gleiche Lauf-Regeln, Alarme und Seiten wie alle Uhren).
- `watch-suunto/bau.mjs` setzt daraus das App-Verzeichnis `watch-suunto/app/` zusammen
  (manifest.json, main.js, ext*.js, Vorlagen n/o/q, data.json). Das Verzeichnis ist im Repo, damit
  Jan es direkt im SuuntoPlus Editor oeffnen kann; ein Test prueft, dass es zum Quellstand passt.
- `watch-suunto/test/` — Node-Harness: laedt die echte main.js mit nachgebauten Firmware-Objekten
  (`appConn`, `evalFile`, `localStorage`, `playIndication`) und spielt Aufnahmen durch, inkl.
  vieler Verbindungsabbrueche.
- **Suunto-eigener Pruefer und Build laufen auch auf der VM** (17.10.): die Erweiterung bringt
  `@suunto-internal/suuntoplus-tools` mit Linux-Binaries mit. `test/bau.test.mjs` ruft deren
  `validateFile`/`validateProject` auf (Test wird uebersprungen, wenn `~/suuntoplus-editor` fehlt, z. B.
  in CI). Voller Build zu `.dev`-Paketen je Display: `node ~/suuntoplus-editor/entpackt/extension/node_modules/@suunto-internal/suuntoplus-tools/bin/build-app.js --appID zzpf0001 --input watch-suunto/app --output <ziel>`.
  Regeln, die der Pruefer durchsetzt und die Referenz nicht nennt: hoechstens **20** Ausgaben, keine
  verschachtelten `function`-Deklarationen (nur `var f = function …`), globale `function` nur fuer
  Firmware-Callbacks.
- iPhone: `SuuntoProtokoll.swift` (rein, auf Linux gegen dieselben Testvektoren UND die Dateien der
  Android-Ablage geprueft: `watch-suunto/test/swift/pruefen.sh`) und `SuuntoBruecke.swift`
  (`CBPeripheralManager`, Hintergrundmodus `bluetooth-peripheral`, Karte im Uhren-Bereich).
- Handy: `SuuntoProtokoll.kt` (Android, rein: Empfang, Chunks, Ablage — Unit-Tests gegen die Pakete
  der echten Uhr-App aus `watch-suunto/test/golden.mjs`) und `SuuntoBruecke.kt` (`BluetoothGattServer`
  + Vordergrund-Dienst `connectedDevice`, Upload laufend/Pause/Ende, Positionsmeldung, Karte im
  Uhren-Bereich, nur sichtbar mit verknuepftem Suunto-Konto),
  `SuuntoBruecke.swift` (iOS, `CBPeripheralManager`). **iOS-Grenze [DOK Apple]:** im Hintergrund
  wirbt iOS Service-UUIDs nur im „Overflow"-Bereich, den eine Suunto-Uhr nicht sieht → die
  Verbindung muss bei geoeffneter App zustande kommen; einmal verbunden, haelt sie im Hintergrund
  (`bluetooth-peripheral`).

## Speicher der Uhr: wie gross ist die Konfiguration? (17.10.2026, gemessen)

`localStorage`/`data.json` fasst laut Google-KI ~2 KB [UNKLAR]. Gemessen ueber alle 733 Nutzer (je das
zuletzt benutzte Geraet), was das Handy schicken wuerde:
- ungekuerzt mit freien Layouts: median 2.283 B (303 von 325 Nutzern haben exakt die **Standard-Layouts**
  des Servers, 1.647 B), nur klassisch: median 629 B.
- **Kompaktes Format** (`GET /api/devices/config-kompakt?p=suunto&std=<Pruefsumme>`,
  `server/app/kompakt_config.py`): kurze Codes, ohne Standardwerte, Seiten als Text mit Zahlen zur Basis 36,
  nur das Standard-Foil. Das Handy leitet den Text nur weiter; die Uhr liest ihn (`quelle/kompakt.js`) und
  speichert ihn so, wie er kam. Gemessen: median 133 B, p99 805 B. Andere Uhren koennen den Endpunkt
  genauso nutzen.
- **Speicher-Budget auf der Uhr:** eine Abfrage des belegten Platzes gibt es nicht (nur set/getItem,
  set/getObject). Die App zaehlt ihre eigenen Schluessel (`speicherBelegt`) und speichert die Konfiguration
  nur, wenn sie in 2.000 − 200 Bytes passt — sonst gekuerzt: Pausen-Seiten, Zwischen-Seiten, Foils, freie
  Layouts -> klassisch, zuletzt ohne Seiten. Scheitert `setItem`, stuerzt nichts ab; die volle
  Konfiguration gilt bis zum Neustart der App.
- **Dazu:** die Standard-Layouts bringt die App fest mit (`app/ext2.js` im Flash, aus
  `server/app/data/standard_layouts.json`, Pruefsumme im HALLO wie `standard_layouts.pruefsumme()`); der
  Server sagt fuer `p=suunto`, welche Saetze Standard sind (`standardSeiten`, `standardHash`), das Handy
  schickt dafuer nur `"std"` — bei anderer Pruefsumme (Standard spaeter geaendert) alles vollstaendig.
  Werte, die der Uhr-Standard ohnehin sind, laesst das Handy weg.
- **Ergebnis:** median 164 B, p90 291 B, p99 1.152 B; ueber 2 KB nur noch 1 Nutzer (7,4 KB, sehr viele
  Foils), ueber 1,5 KB 3. Passt es nicht, gilt die volle Konfiguration bis zum App-Neustart und
  gespeichert wird sie ohne Layouts.

## Abgleich mit den anderen Uhren (17.10.2026)

Grundlage: Feature-Inventar aus `docs/PARITY-AUDIT.md` und den Quellen von Garmin, Wear, Apple, Zepp, Huawei.

| Funktion | andere Uhren | Suunto |
|---|---|---|
| Datenseiten aus dem Profil | klassisch [a,b,c] + freie Layouts je Zustand | ✅ beides, mit demselben Zeichner wie Huawei (`seiten.js zeichne`): Texte als Elemente mit `setText`/`setStyle` (Position, Farbe, Schriftklasse), Linien/Balken/Rand-Boegen/Seitenpunkte auf dem `<canvas>` der Vorlage (`quelle/anzeige.js` packt, `quelle/vorlage.js` zeichnet). Grenzen: 62 Texte (je Schriftklasse fest verteilt, `ANZ_JE` in anzeige.js, bei Engpass naechstliegende Klasse; Elemente 100 % breit mit festem text-align, left/top per setStyle in reinen Prozent — calc(… %e) verwirft der Simulator), 13 Grafik-Befehle je Seite (der Editor erlaubt nur 20 Ausgaben statt der 25 aus der Referenz; die Seiten brauchen bisher hoechstens 8), Schrift in 8 Stufen statt frei |
| Seiten je Zustand (auf dem Foil / dazwischen / Pause), „alle Seiten" | ✅ | ✅ (`ring` aus seiten.js), Blaettern mit hoch/runter |
| Lauf-Erkennung live, Vibration bei Start/Ende, Sprung auf Seite 1 | ✅ | ✅ (lauf.js, `playIndication`) |
| Tempo-/Puls-Alarm, Strecken-/Zeitmarken | ✅ | ✅ aus dem Profil; Muster auf Suunto-Toene abgebildet |
| Foil-Auswahl auf der Uhr | Garmin/Zepp/Huawei | ❌ keine Einstellungsseite: es gilt das Profil (Standard-Foil, Alarm-Grenzen) |
| Werte nach Zone einfaerben | `colorByValue` | ✅ per `setStyle(…, 'color', …)` |
| Sprache | Profil, sonst Geraet | ✅ Profil (ueber das Handy), sonst Einstellung in der Suunto-App |
| Positionsmeldung „gerade am Pumpen" | ✅ | ✅ ueber das Handy (erster Fix im Startzustand) |
| App verlassen ohne Aufnahme (`/app-closed`) | Garmin/Wear/Apple | ✅ das Handy meldet es, wenn die Uhr im Startzustand die Verbindung verliert |
| „Handy nimmt auf"-Hinweis | ✅ | ✅ ueber STATUS (auch im Startzustand) |
| Upload waehrend / in der Pause (`/analyze`) / danach | ✅ | ✅ durch die Handy-Bruecke |
| Puffer-Anzeige, Warnung vor Verlust | Garmin (Speicher) | ✅ Rueckstand und verlorene Sekunden in der Statuszeile (RAM-Ring ~80 s) |
| Update-Hinweis | `latestVersion` | ✅ die ersten 15 s der Aufnahme oben (einen Startbildschirm zeigt Suunto nicht: die App-Seite kommt laut Referenz erst nach dem Start, im Simulator bestaetigt) — braucht einen `suunto`-Eintrag in `appmeta._APP_META`, **erst bei der Store-Freigabe** |
| Pause, Ende, Zusammenfassung | eigene Bildschirme | Suunto-eigene Bedienung; Zusammenfassung mit Laeufen, Pumps, laengstem Lauf |
| Verwerfen | loescht lokal | ❌ die App erfaehrt nicht, ob der Nutzer speichert oder verwirft — die Bruecken-Session bleibt; der Nutzer loescht sie bei uns |
| Auto-Start, Touch-Sperre, Stopp-Modus | eigene Einstellungen | Sache der Suunto-Firmware |
| Pump-Zahl/-Zeitpunkte ohne Rohdaten | nein (nur Server) | ✅ Pump-Marker in den Log-Kanaelen (Uhr-Erkennung) |

## Was nur auf echter Hardware geklaert wird

1. Kommen Beschleunigungswerte, in welcher Einheit, ueber welchen Aufruf, mit 25 oder 50 Werten?
2. Nimmt die Firmware `type:"device"` mit sofort gesetztem `con` hin, ohne dass ein Geraet da ist?
3. Wie viele 20-Byte-Schreibvorgaenge je Sekunde schafft die Uhr dauerhaft (30–60 min)?
4. Wie viel Speicher bleibt fuer den Ringpuffer (`/Ui/Script/MemoryPool/Peak` im Editor-Log)?
   `localStorage` taugt NICHT als Zwischenspeicher: laut einer Google-KI-Uebersicht (Jan, 17.10.)
   ist `data.json` auf < 2.100 Bytes begrenzt [UNKLAR, nicht in der Referenz, Quelle nicht
   nachgeprueft] — so oder so viel zu klein fuer Rohdaten (1 h bei 25 Hz ≈ 540 KB). Rohdaten gibt es
   also nur mit dem Handy in Bluetooth-Reichweite (am Koerper, wasserdichte Tasche); der RAM-Ring
   ueberbrueckt ~80 s.
5. Stehen die Log-Kanaele in der FIT-Datei der Cloud-API?
6. Laeuft die App bei dunklem Display weiter (bei Suunto ueblich, da Teil der Aktivitaet)?
7. Wie lange laeuft die App nach dem Ende noch (Zusammenfassung)? Im Simulator kommt bei Stop KEIN `onExerciseEnd`, nur `onExercisePause` + `getSummaryOutputs` (17.10.) — die App schliesst darum auch in `getSummaryOutputs` ab (`beenden`, einmalig). In der Pause ruft der Simulator kein `evaluate` mehr; die App zeichnet darum nach jedem Ereignis sofort neu. Die App lebt nur innerhalb einer
   Aufnahme: nach dem Ende wird sie entladen, ihr RAM-Ring ist weg. Was bis dahin nicht beim Handy ist,
   fehlt — ausser `evaluate` laeuft in der Zusammenfassung weiter und der Funk schickt den Rest. Im Log
   eines Testers nachsehen (Debug-Fassung: `pf: onExerciseEnd`, danach noch Ereignisse?).
