# Pumpfoil — Zepp OS (Amazfit) Recorder

Dünner Recorder für Amazfit-Uhren (Zepp OS 3.0), analog zu Garmin/Apple/Wear: nimmt auf,
puffert, lädt über die Zepp-Handy-App zu **pumpfoil.org** hoch. Server macht die Analyse.

**Pairing (reverse, wie alle Uhren):** die Uhr-App zeigt beim ersten Start einen Code →
auf pumpfoil.org → Konto → „Uhr verbinden" eintragen → die Uhr pollt und wird verbunden.

**Stand: v0 — GPS + Puls (untested draft).** Roher 25-Hz-Accel (für Pump/Gleit) ist bei Zepp OS
für Dritt-Apps nicht gesichert verfügbar → vorerst GPS-only ⇒ Server `detection = gps_only`
(Distanz/Speed/Läufe, **noch keine Pumps**). Accel nachrüsten, sobald die API bestätigt ist.

## Ablauf (wie Garmin: Aufnahme primär, Verbindung/Upload im Hintergrund)
- **GPS läuft ab dem Ruhe-Screen** (durchgehender 1-Hz-Sampler) → Status „GPS suche… / GPS ●" vor
  dem Start; Puls parallel.
- **Auto-Start** (wenn `autoStart` in der Config): ab ~7 km/h über einige Samples startet die
  Aufnahme selbst. Manuell per START jederzeit.
- **Pairing im Hintergrund** (reverse): PAIR_INIT holt einen Code, Poll läuft nebenher; die Aufnahme
  ist **nie blockiert** — auch unverbunden aufnehmbar. Code wird im Ruhe-Screen angezeigt.
- **Nach Stopp**: Session wird **persistent gepuffert** (`@zos/storage`, Queue-Key `pending`), dann
  Upload **falls verbunden**; sonst „Upload später" + **automatischer Nachhol-Upload** beim nächsten
  App-Start/Verbindung (`flushPending`). Requests via `this.request` mit Retry (`call()`), der
  verschluckte Antworten (Worker nach Spawn noch nicht bereit) erneut sendet.

## Aufbau (auf dem „Fetch Api"-Template, `@zeppos/zml`)
- `page/index.js` — State-Machine (Ruhe/Aufnahme), **Lauf-Erkennung** (on-foil/off-foil, s. u.),
  Rendering der **konfigurierten Datenfelder** und der **eigenen Layouts** (Feld-IDs wie
  web/`fields.ts`/Garmin), Sampling, Auto-Start, Offline-Queue. Titel antippen: in Aufnahme =
  Seite wechseln, in Ruhe = neuer Code (unverbunden) bzw. jetzt nachschicken (verbunden).
- `page/index.[r|s].layout.js` — Widget-Geometrie rund/eckig.
- `app-side/index.js` — App-Side-Service (Handy): `onRequest` → `fetch`. **Reverse-Pairing** wie
  bei allen Uhren: `PAIR_INIT` (`POST /api/devices/pair-init` → `{code, claim_token}`), `PAIR_POLL`
  (`GET /api/devices/pair-poll?claim_token=…` → `device_token`, sobald der Nutzer den Code im Web
  eingelöst hat), dann Ingest-Upload (start/chunk/complete) mit `X-Device-Token`.
- `setting/index.js` — App-Settings: nur Verbindungsstatus + „Trennen". **Keine** Code-Eingabe —
  der Code wird auf der Uhr angezeigt und im Web eingetragen (es gibt keine Web-„Code-erzeugen"-UI).
- `app.json` — target `common` (rund 480 / eckig 390), Permissions GPS + Puls + local_storage.

Ingest-Vertrag: `docs/ingest-contract.md` (Path A: start → chunks[gps json] → complete).

## Bauen / Testen (auf Jans Rechner — hier nicht baubar)
```bash
cd watch-zepp
rm -rf dist .zeus build   # ZUERST: der Zeus-Cache mischt sonst alten und neuen Code
zeus dev            # Simulator (Balance 2), Live-Reload
# Der Simulator speist KEIN GPS ein. page/index.js hat dafür DEV_FAKE_GPS (steht auf FALSE):
# zum Testen von Aufnahme+Upload im Simulator kurz auf true setzen — und vor Uhr/Release
# wieder auf false. (Stand hier früher falsch als "=true" beschrieben.)
zeus preview        # QR für echte Uhr (Zepp-App)
zeus build          # Store-Paket für die Zepp-Konsole
# WICHTIG (Simulator): nach jedem Code-Change/`git pull` den Simulator KOMPLETT neu starten
# (zeus dev beenden + Fenster schließen + neu). Hot-Reload spawnt den App-Side-Worker NICHT neu
# -> sonst 'shake timeout' bei allen Requests. Worker lebt, sobald im JS-Log `[pumpfoil] app-side
# onInit` steht. (Auf echter Uhr/echtem Handy kein Thema — dort spawnt der Worker beim App-Start.)
```

**Syntax-Vorprüfung ohne Mac — `node --check` REICHT NICHT.** Es hat am 26.08. eine doppelt
deklarierte Top-Level-Konstante durchgelassen (`MAX_PLAUSIBLE_MPS`, einmal 30 m/s als
Sprung-Schwelle und einmal 32 km/h als Foil-Deckel); erst `zeus dev` auf Jans Rechner brach ab.
Das hier findet es (die Datei ist ein ES-Modul, deshalb kompiliert erst der Modul-Pfad richtig):

```bash
node --experimental-vm-modules -e "
const fs=require('fs'),vm=require('vm');
for (const f of ['page/index.js','app-side/index.js','setting/index.js'])
  new vm.SourceTextModule(fs.readFileSync(f,'utf8'),{identifier:f});
console.log('ok')"
```

## Noch im Simulator zu verifizieren (blind portiert)
1. `@zos/sensor` **Geolocation** (`getStatus`/`getLatitude`/`getLongitude`/`getSpeed`) + **HeartRate**
   (`getCurrent`) — Methodennamen/Verhalten auf Balance 2.
2. `@zos/storage` **LocalStorage** auf der Uhr (Token/Claim persistieren) — App-Side ist stateless
   und bekommt Token/Claim pro Request mitgeschickt (`@zos/settings` ist im App-Side NICHT auflösbar).
3. `fetch`-Response-Shape (`response.status`, `response.body` String vs. JSON).
4. Pairing-Flow: Code auf der Uhr sichtbar → auf pumpfoil.org/Konto eintragen → Uhr pollt → „verbunden ✓".

## Lauf-Erkennung auf der Uhr (on-foil / off-foil)

Die App kannte lange nur `screen: idle|recording|summary` — kein „ich foile gerade". Damit fehlten
Lauf-Zähler, „letzter Lauf" und zustandsabhängige Seiten. Jetzt läuft derselbe Automat wie auf
Garmin (`watch/source/SessionRecorder.mc:_updateRun`) und Wear (`Recorder.kt:updateFoilingRun`),
**mit den dort abgestimmten Parametern** (nicht neu erfunden):

| | Wert |
|---|---|
| rein | Speed ≥ **2,8 m/s** (~10 km/h), **4 s** anhaltend |
| raus | Speed < **2,5 m/s** (~9 km/h), **3 s** anhaltend |
| Re-Arm-Sperre nach Lauf-Ende | **25 s** (Zurückschwimmen/Waten soll keinen Phantom-Lauf starten) |
| Start/Ende | auf den Dwell-Beginn **zurückdatiert** |

Entschieden wird auf einem **gleitenden 3-s-Median** der Geschwindigkeit, nicht auf `s.cur`: Zepp
liefert nur den Momentanwert, ein einzelner Doppler-Ausreißer würde sonst einen Lauf starten. Fenster
und Verfahren wie beim Server (`SMOOTH_WINDOW_S = 3` + `_running_median` in
`server/app/analysis/gps.py`) und wie Garmins `speed3sMed`. Fällt der GPS-Fix aus, altert das Fenster
binnen 3 s leer → ein laufender Lauf endet regulär statt am letzten Speed zu kleben.

Damit füllen sich die Feld-IDs, die es dafür längst gibt: **14/15** aktueller Lauf (Zeit/Distanz,
Label wechselt auf „Lauf läuft"), **16–19** letzter Lauf (Zeit/Distanz/Ø/Max), **20** Lauf-Zähler.
Bis dahin zeigten 14/15 die Gesamt-Session und 16–19 die letzte **Session** statt des letzten Laufs.
Nebenbei getrennt: **Feld 1** = 3-s-Median („km/h (3s)"), **Feld 5** = Momentanwert — vorher beides
derselbe Rohwert.

**Seiten-Ring je Zustand** (portiert von `RecordView.mc:_state/_setFor/_ring`): der Server liefert
`pages` (on-foil), `offFoilPages` und `browseAll`. Geblättert wird im Satz des aktuellen Zustands;
steht `browseAll`, hängen im Off-Foil-Zustand die On-Foil-Seiten hinten dran. Zustandswechsel setzt
den Ring auf die erste Seite und vibriert kurz. **`pausePages` bleibt ungenutzt** — die Zepp-App hat
kein manuelles Pausieren (Taste halten = Stopp), der Zustand kann nie eintreten.

## Eigene Layouts zeichnen (Web-Editor → Uhr)

Wie Garmin/Wear/Apple Watch. Der Server schickt Seiten **immer als getaggte Liste inline** — es gibt
keine Layout-IDs und kein `layouts`-Wörterbuch (`server/app/api/devices.py:_layouts_for_watch`):
`[0,a,b,c]` = klassische 3-Feld-Seite, `[1,bg,[elemente]]` = eigenes Layout. Element =
`[typ,x,y,size,color,flags,extra…]`, Koordinaten in **Promille** der Display-Breite/-Höhe.

- **Größenstufen** aus der Simulator-Messung (`web/src/lib/watchLayout.ts`): Schriftgröße =
  Tintenbreite / 1,973 / 280 × Displaybreite. Ergebnis sind echte Pixel → **kein `px()`** darauf
  (das skaliert von der 480er-Designbasis und würde doppelt umrechnen).
- **Palette** exakt aus `server/app/api/layouts.py PALETTE`; „auto" = Werte `#ffffff`, Labels
  `#d0d0d0`, Linien `#808080`. Farbe-nach-Wert in **vier Stufen** (12/16/20 km/h), kein Verlauf.
- **Randlos** über das ganze Display; **REC = Punkt und „REC"-Text**; Seiten-Punkte bringt das
  Layout selbst mit (typ 6), die App zeichnet auf Layout-Seiten keinen eigenen Indikator.
- Zepp ist **widget-basiert**: Widgets werden pro Seite erzeugt, in einer Liste gehalten und beim
  Seitenwechsel gelöscht (`_renderLayoutPage`/`_clearLayout`, Muster wie `showBar`/`hideBar`). Pro
  Sekunde werden **nur die Wert-Elemente** per `setProperty` nachgezogen, nicht alles neu erzeugt.
- Bekannte Grenzen: **schräge Linien** werden auf die dominante Achse gelegt (Zepp kann nur
  Rechtecke; Editor-Linien sind praktisch immer Trenner). Die Breite des „REC"-Textes ist geschätzt
  (nur die Gruppen-Ausrichtung hängt daran). **typ 7 („Pausiert") wird nie gezeichnet** — ohne
  Pause-Funktion wäre der Hinweis immer falsch (Wear macht es genauso).
- Scheitert das Zeichnen (unbekannte Widget-Property o. ä.), räumt die App die Widgets weg, schaltet
  Layouts **für diese Sitzung** ab und zeichnet klassisch weiter — die Aufnahme läuft durch.
  Sinngleich mit Garmins Canary, aber ohne dessen Speicher-Maschinerie (die gehört zu den 96-KB-Uhren).

## Sprachen (i18n)

Die Uhr-UI war komplett hartcodiert **deutsch**, obwohl der Server die Profil-Sprache längst
mitschickt (`GET /api/devices/config` → `language`, im `app-side` durchgelassen) — sie wurde in
`page/index.js` nur nie ausgewertet. Seit 1.0.4 gibt es dort ein **Wörterbuch im Code**
(`LANGS`/`S`/`t()`), gespeist aus genau dieser Profil-Sprache und in `@zos/storage` gecacht
(Key `lang`), damit der nächste App-Start auch offline/ungepairt richtig lokalisiert ist.

- **Spalten:** `de gsw de-AT en fr it es pt id ru nl fi cs ja zh` (15). Fallback pro String:
  Sprache → **en** → de. Reine Einheiten (`km/h`, `bpm`, `m`) bleiben unlokalisiert.
- **Wortlaut ist nicht neu erfunden**, sondern 1:1 aus den anderen Uhr-Apps übernommen:
  `watch/source/Strings.mc` (Hauptquelle, 13 Sprachen), `android/wear/…/I18n.kt` (ja/zh + Keys,
  die Garmin nicht hat), `web/src/i18n/locales/*.ts` (`f.dist`=`field.4`, `f.dur`=`sd.duration`,
  `rec.noData`=`watchStats.none`). Wo keine belegte Übersetzung existierte, ist die Spalte leer
  → Englisch (statt geraten).
- **Bewusst KEIN `@zos/i18n`/`.po`:** `getText()` lokalisiert nach **Geräte**-Sprache, wir wollen
  wie alle anderen Uhren die **Profil**-Sprache. Und ein fehlschlagender Modul-Import nimmt beim
  Laden die ganze App mit (derselbe Grund, warum im `app-side` kein `@zos/settings` steht) — ein
  Objekt-Literal kann nicht fehlschlagen. Die Beispiel-`.po`-Dateien unter `page/i18n/` bzw.
  `app-side/i18n/` sind **unbenutztes Template-Gerüst**.
- **Default ist Englisch**, nicht Deutsch: die App liegt international im Store, und die
  Geräte-Systemsprache ist ohne zusätzlichen `@zos`-Import nicht lesbar (Garmin/Wear weichen an
  dieser Stelle auf die Systemsprache aus, Zepp kann das nicht). Gepairte Uhren bekommen die
  Profil-Sprache beim ersten `CONFIG` und behalten sie.
- Offen: `setting/index.js` (Einstellungs-Seite **in der Zepp-Handy-App**) ist weiter deutsch —
  dort gibt es keine belegbare Sprachquelle (stateless, kein `@zos/settings`, kein Profil-Abruf).

## Echte Zepp-Aktivität aufzeichnen — geprüft, **nicht möglich** (Stand Zepp OS 3.x)

Wunsch (Nutzer-Anfrage): parallel zu unserer Rohdaten-Aufnahme eine **echte Zepp-Aktivität**
anlegen, damit die Session in der Zepp-App landet und von dort z. B. nach Strava fließt — so wie
es die Garmin-App macht (`watch/source/SessionRecorder.mc:800-830` legt eine FIT-Session
„Pumpfoil" an). Recherche in der offiziellen Doku (kein SDK auf der Build-VM):

| Kandidat | Befund |
|---|---|
| `@zos/sensor` **`Workout`** (API 3.0, Permission `data:user.hd.workout`) | **read-only**: `getStatus()`, `getHistory()`, `getUserHrZoneSettings()`, `getWorkoutTrackNavInfo()`. Kein Anlegen/Starten. |
| `app.json` **`appType`** | nur `"app"` (Mini Program) und `"watchface"`. Es gibt **keinen** Sport-/Workout-App-Typ, den man beantragen könnte. |
| **Workout Extension** (`data-widget`, Zepp OS **3.5+**) | Plug-in **innerhalb** der System-Workout-App: der Nutzer startet dort die Aktivität, die System-App besitzt den Datensatz — die Extension liefert nur zusätzliche Screens/Datenfelder. Eigene App-ID + eigenes Review, und nur auf T-Rex 3, Cheetah Pro, Cheetah (Round), Cheetah Square, T-Rex Ultra, Falcon (**Balance 2 nicht dabei**). |
| `@zos/app-access` **`getSportData()`** (API **3.6**) | *liest* Live-Werte der System-Sport-App, schreibt nichts. |
| `@zos/router` **`launchApp({ appId: SYSTEM_APP_SPORT, native: true })`** (API 3.0) | kann die System-Workout-App **starten** — dann ist unsere App aber nicht mehr im Vordergrund, unser 1-Hz-Sampler läuft nicht weiter. |

→ **Kein Code dafür geschrieben** (API-Namen zu erfinden wäre in einer Store-App das falsche
Risiko). Wenn es kommen soll, ist der einzige belegbare Weg eine **Architektur-Änderung**:
System-Workout-App im Vordergrund (sie erzeugt die echte Aktivität) + unser Recorder als
`app-service` (Background Service) für die Rohdaten — ungeprüft, ob ein Background Service
dauerhaft GPS halten darf. Zweite Option: **Workout Extension** als separate App (setzt 3.5+ und
die 6 Geräte oben voraus, Balance 2 müsste Amazfit erst nachziehen).

## TODO
- GPS und Metadaten der Offline-Queue liegen weiterhin in `@zos/storage` (JSON). Für sehr lange
  Sessions sollte auch dieser Teil auf `@zos/fs` umgestellt werden — LocalStorage-Größe ist begrenzt.
- Diagnose-`console.log`/`logger.log` (PAIR_INIT/POST-Status/Upload) vor Release ausdünnen.

## Raw acceleration recording (1.0.5)

The Zepp recorder now uses the official API 3.0 `Accelerometer` in high-frequency mode while a
session is active. The callback values (cm/s²) are converted to signed little-endian int16 triples
using the common Pumpfoil scale of 2048 units per g. The actual callback rate is measured for every
session instead of assuming that Zepp's named frequency mode is exactly 25 Hz.

Acceleration is never retained as one large JavaScript array or LocalStorage JSON value. Blocks of
128 samples are appended directly to a binary file in the app's `/data` directory. Upload reads and
base64-encodes one block at a time, sends it as `kind: accel` with its real `t0_ms`, and deletes the
file only after the server confirms session completion. Active-session metadata references the file,
so complete blocks survive an app or watch restart and remain available for retry.

## Feldtest-Fixes (fuer 1.0.4, 2026-08-01 — auf Hardware ungetestet)

Anlass: erster echter Feldtest (T-Rex 3, Nutzer-Meldung per DM, 01.08.). Drei Aenderungen:

1. **Pairing-Code direkt auf dem Start-Screen.** Der Code entstand erst beim Wischen auf Seite 2/4
   — der Tester fand ihn nicht. Jetzt: ungepairt wird der Code beim App-Start erzeugt und in der
   Statuszeile von Seite 1 angezeigt (`CODE → pumpfoil.org`); der Poll laeuft auf Seite 1+2.
2. **Bildschirm-Aus ueberleben:** `setWakeUpRelaunch({relaunch:true})` bei Aufnahme-Start (aus bei
   `done()`). Der Tester kam zum Steg zurueck und die Uhr zeigte das Zifferblatt — Zepp beendet
   Mini-Apps beim Display-Aus, und wir hatten den Gegen-Mechanismus nie aktiviert. Mit Relaunch
   oeffnet das Aufwachen wieder unsere App; `recoverActive()` sichert die Aufnahme in die Queue.
   ACHTUNG: ob der Langzeit-GPS-Betrieb damit durchlaeuft, kann nur Hardware zeigen (Balance 2).
3. **Vordergrund-Upload sichtbar gemacht:** Der Upload-Status sagt jetzt „… · App offen lassen!"
   (Schluessel `up.keepOpen`), und auf dem Start-Screen steht dauerhaft `· N offen`, solange
   Aufnahmen auf die Uebertragung warten — dieselbe Produktluecke wie bei Garmin/Apple (drei
   Support-Faelle: Session „fehlt", lag aber nur auf der Uhr).

## Tastenbedienung (1.0.5)

Anlass: Nutzer-Meldung per Instagram — „Stoppen geht leider nur über wischen und nicht über eine taste. Das
funktioniert nicht wenn das display nass ist mit nassen Fingern." Beim Pumpfoilen ist nass der
Normalzustand, ein Touch-only-Recorder ist dort also unbenutzbar.

Die vier Tasten werden getrennt behandelt (`onKey` aus `@zos/interaction`):

| Zustand | UP | DOWN | SELECT | Lange Taste |
|---|---|---|---|---|
| Aufnahme | vorige Seite | nächste Seite | zeigt Schloss | UP/DOWN: Touch 10 s frei; SELECT: **stoppen & speichern** |
| Start-Screen | vorige Seite | nächste Seite | **Start recording**, GPS fix required | same |
| Zusammenfassung | — | — | fertig | fertig |

Touch is locked automatically while recording. Water taps are absorbed by a transparent modal
layer and briefly display a lock. A long UP or DOWN press unlocks touch for ten seconds, after which
it locks again automatically. Short physical key presses still work and also display the lock.
`KEY_BACK` is consumed while recording, preventing accidental exit; outside recording it remains
handled by the system. Zepp allows only one `onKey` registration, so every key uses one callback.

**Auf Hardware ungetestet, bewusst so released (2026-07-27):** der Zepp-**Simulator hat keine
Hardware-Tasten**, der Tasten-Pfad ist dort also nicht prüfbar. Jan gibt 1.0.3 trotzdem in den Store;
**Der Melder testet nach der Freigabe** — er hat es angefragt und hat das Gerät. Deshalb ist der ganze
Callback in `try/catch` gekapselt: geht dort etwas schief, tut die Taste nichts, statt die laufende
Aufnahme mitzunehmen. Falls der Langdruck auf echter Hardware nicht als `KEY_EVENT_LONG_PRESS`
ankommt, ist der Umbau klein (Doppelklick oder `KEY_EVENT_PRESS`/`RELEASE` mit eigener Zeitmessung) —
dafür genügt, was im Log der Uhr ankommt.
Wer die Tasten VOR einem Release prüfen will: `zeus preview` läuft auf der echten Uhr, dort gibt es
sie.
