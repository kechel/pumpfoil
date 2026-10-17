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
| Ausgaenge | hoechstens 25 `out`; davon hoechstens **5 mit `log:true`**, einmal je Sekunde ins Workout geschrieben, in der Suunto-App als Kurve [DOK]. Dazu hoechstens 8 (praktisch 4–5) Werte in der Zusammenfassung [DOK]. |
| Anzeige | HTML-Vorlagen mit `<eval>` (Formatierer `script`, `keyValue`), `setText`, eingeschraenktes `<canvas>` (Linien, Boegen, `fillText`), hoechstens 2 PNG [DOK]. Mehrere Seiten ueber `getUserInterface` + `unload("_cm")` [DOK]. |
| Tasten | `<userInput><pushButton name="up|down" onClick="$.put('/Zapp/{zapp_index}/Event', n…)"/>` → `onEvent` [DOK]. Vibration/Ton: `playIndication` [DOK]. |
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
| `0x83` KONFIG | schluessel u8, wert … (Seiten, Alarme, Sprache — Teilstuecke wie bei Huawei `KONFIG_SCHLUESSEL`) |

Die Uhr haelt unquittierte Bloecke in einem Ringpuffer und schickt nach dem Wiederverbinden ab
Quittung+1 nach. Durchsatz bei 50 Hz: ~18 Pakete/s, bei 25 Hz ~10 Pakete/s — **[UNKLAR], ob die
Uhr das schafft**; die Rate ist deshalb eine Einstellung (Standard 25 Hz wie Garmin, 50 Hz
waehlbar), und die Uhr meldet den gemessenen Rueckstand im HALLO/Status.

## Die 5 Log-Kanaele (Weg 1)

| Name | Inhalt | warum |
|---|---|---|
| `pf_foil` | Laufnummer, solange die Uhr einen Lauf erkennt, sonst 0 | Lauf-Grenzen ohne Rohdaten |
| `pf_pumps` | Pumps in dieser Sekunde | Pump-Zahl, Positionen auf 1 s genau |
| `pf_kad` | Pump-Kadenz (/min, gleitend 4 s) | Kadenz-Kurve |
| `pf_int` | Bewegungsstaerke: Std. von |a| in der Sekunde (mg) | Pumpen vs. Gleiten vs. Paddeln |
| `pf_peak` | groesste Abweichung von 1 g in der Sekunde (mg) | Stuerze, Aufsetzen, Wasserstart |

Ob diese Kanaele in der FIT-Datei stehen, die wir ueber `/v2/workout/exportFit` holen, ist
**[UNKLAR]** — erst am ersten echten Workout pruefen.

## Pump-Zaehler auf der Uhr

Streaming-Fassung von `server/app/ml/pumps.py:find_pumps_cadence`: Schwerkraft je Achse per
Tiefpass (0,25 Hz), dynamische Beschleunigung auf die Schwerkraft projiziert (wie
`vertical_against_gravity`), Bandpass 0,3–3 Hz, RMS-Gate 0,008 g ueber 4 s, Kadenz per
Autokorrelation auf 10 Hz im Band 0,8–2 Hz, je Periode ein Peak. In Node gegen den Server-Zaehler
auf echten Garmin-Laeufen geprueft (`watch-suunto/test/`).

## Code

- `watch-suunto/quelle/` — main.js-Bausteine (ES5), `lauf.js` + `seiten.js` kommen aus
  `watch-huawei/common/` (gleiche Lauf-Regeln, Alarme und Seiten wie alle Uhren).
- `watch-suunto/bau.mjs` setzt daraus das App-Verzeichnis `watch-suunto/app/` zusammen
  (manifest.json, main.js, ext*.js, Vorlagen n/o/q, data.json). Das Verzeichnis ist im Repo, damit
  Jan es direkt im SuuntoPlus Editor oeffnen kann; ein Test prueft, dass es zum Quellstand passt.
- `watch-suunto/test/` — Node-Harness: laedt die echte main.js mit nachgebauten Firmware-Objekten
  (`appConn`, `evalFile`, `localStorage`, `playIndication`) und spielt Aufnahmen durch, inkl.
  vieler Verbindungsabbrueche.
- Handy: `SuuntoBruecke.kt` (Android, `BluetoothGattServer` + Vordergrund-Dienst),
  `SuuntoBruecke.swift` (iOS, `CBPeripheralManager`). **iOS-Grenze [DOK Apple]:** im Hintergrund
  wirbt iOS Service-UUIDs nur im „Overflow"-Bereich, den eine Suunto-Uhr nicht sieht → die
  Verbindung muss bei geoeffneter App zustande kommen; einmal verbunden, haelt sie im Hintergrund
  (`bluetooth-peripheral`).

## Was nur auf echter Hardware geklaert wird

1. Kommen Beschleunigungswerte, in welcher Einheit, ueber welchen Aufruf, mit 25 oder 50 Werten?
2. Nimmt die Firmware `type:"device"` mit sofort gesetztem `con` hin, ohne dass ein Geraet da ist?
3. Wie viele 20-Byte-Schreibvorgaenge je Sekunde schafft die Uhr dauerhaft (30–60 min)?
4. Wie viel Speicher bleibt fuer den Ringpuffer (`/Ui/Script/MemoryPool/Peak` im Editor-Log)?
5. Stehen die Log-Kanaele in der FIT-Datei der Cloud-API?
6. Laeuft die App bei dunklem Display weiter (bei Suunto ueblich, da Teil der Aktivitaet)?
