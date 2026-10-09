# Pumpfoil-Recorder fuer HUAWEI-Uhren

Stand 07.10.2026: gebaut auf der VM ohne Uhr, **noch nie auf echter Hardware gelaufen**.
Recherche, Risiken und Quellen: [`docs/HUAWEI.md`](../docs/HUAWEI.md).

## Aufbau

```
common/      Quelle fuer beide Projekte (in Node getestet: node --test test/)
  kern.js      Chunks, Binaerformat, Pausen-Zeitachse, Sendeplan, Warteschlange — ohne Geraete-APIs
  recorder.js  Sensoren, GPS, Dateien, Wear Engine (@system.* — auf beiden SDK-Linien vorhanden)
  konfig.js    Paketname + Fingerabdruck der Android-App, App-Version
lite/        DevEco-Projekt fuer Lite Wearables: Watch GT 3/4/5/6 (+Pro), Fit 3/4, D2
wearable/    DevEco-Projekt fuer Watch 3/4 (HarmonyOS 2-4, JS-FA) — Seite/Texte kommen per sync aus lite/
arkts/       DevEco-Projekt fuer Watch 5 und jede Uhr mit HarmonyOS 5+ (ArkTS, Stage-Modell, API 20/21)
               common/Kern.ets     derselbe Kern in ArkTS — test/arkts-kern.test.mjs prueft ihn BYTEGLEICH
                                   gegen common/kern.js (tsc aus web/node_modules). Aenderung am Kern =
                                   beide Dateien aendern, der Test faellt sonst.
               common/Recorder.ets Geraete-Schicht (Kits: Sensor, Location, fileIo, WearEngine,
                                   BackgroundTasks); liefert anders als Lite ein GPS-Tempo
               pages/Index.ets     dieselbe Seite wie lite/ (Texte in resources/, 4 Sprachen wie lite/)
test/        Node-Tests (kern.test.mjs = JS-Kern, arkts-kern.test.mjs = ArkTS-Kern gegen JS-Kern)
sync-common.sh  kopiert common/ in die Projekte — nach JEDER Aenderung an common/ ausfuehren
```

Weg der Daten: Uhr nimmt auf → schreibt Chunk-Dateien im normalen Upload-Format
(docs/ingest-contract.md) → schickt sie per Wear Engine ans Handy → die Pumpfoil-App (Android
`HuaweiBruecke.kt`, iOS `HuaweiBruecke.swift`) laedt sie hoch. Die Uhr hat fuer Fremd-Apps kein
eigenes Netz (docs/HUAWEI.md).

**Uebertragung als Nachrichten in Teilen, nicht als Dateien** (`PF1|<datei>|<nr>|<anzahl>|<rest>|<inhalt>`,
≤ 800 Zeichen ASCII, `common/kern.js teile`): Huaweis iOS-Guide sagt woertlich, das iOS-SDK koenne
„only … message communications … not file transfers". So ist es fuer Android und iOS derselbe Weg.
Die Uhr kennt beide Handy-Apps (`konfig.js GEGENSTELLEN`) und wechselt nach drei Fehlschlaegen in
Folge; was zuletzt angenommen hat, bleibt gemerkt (`gegenstelle.json`).

**Datenseiten (seit 07.10.2026, alle drei Linien).** Dieselben Seiten wie auf Garmin/Zepp: klassische
3-Feld-Seiten und freie Layouts aus dem Profil, je Zustand (auf dem Foil / zwischen den Laeufen / Pause),
„alle Seiten" haengt an. Logik in `common/seiten.js` (Lauf-Erkennung, Felder, Seiten-Ring, Layout ->
Zeichenbefehle; portiert von Zepp, in Node getestet) und `arkts/…/Seiten.ets` (bytegleich dazu getestet).
Die Uhr zeichnet die Befehle auf einer Canvas; **hoch/runter wischen blaettert** (rechts wischen beendet
bei Lite die App), Seite 0 = Pause/Weiter/Stopp. Weg der Konfiguration: Uhr schickt beim Start und
halbstuendlich ein Hallo (`h_hallo.json`: Modell + Version) -> Android holt mit dem Token DIESER Uhr
`/api/devices/config?p=huawei` und schickt die Seiten-Schluessel als `k_konfig.json` in Teilen zurueck ->
Uhr speichert `konfig.json`. Ohne Konfiguration: Standardseiten.
Bewusste Abweichungen: Lite kennt nur die Schriftgroessen 30/38 px (Watch 3/4 und ArkTS zeichnen die
echte Groesse); Alarme, Foil-Auswahl und Verwerfen-Seite gibt es auf Huawei (noch) nicht.
**Lite hat ZWEI Grenzen je Buendel (app.js, pages/index), beide gemessen am 08.10.2026:** die Datei
hoechstens 48 KB (Simulator: „app.js is bigger than 48 KB") UND hoechstens 48 KB Heap beim Uebersetzen
(JerryScript, `jerry --mem-stats`). Dazu kennt JerryScript keine Regex-Literale. Scheitert das
Uebersetzen, warnt hvigor nur („Failed to convert … to a snapshot") — die Seite bleibt SCHWARZ, ohne Log.
Aufteilung deshalb: Recorder (kern, recorder, lauf) im app.js-Buendel, die Seite holt ihn per
`getApp().R`; Seite, Zeichnen (seiten.js) und Wear Engine im Seiten-Buendel, die Seite reicht die Wear
Engine per `R.init(we)` an den Recorder. `build-all.sh` baut Release und Debug, erzeugt den Snapshot und
bricht ueber 46000 Byte Datei oder 44000 Byte Heap ab (Stand Debug: app 34,7 KB / 29,9 KB Heap,
Seite 42,3 KB / 33,8 KB Heap).
Ungeprueft auf Hardware: welche Canvas-Aufrufe Lite wirklich kann (Bogen, Linienbreite) und die
Grundlinie von `fillText` (mittig angenommen).

**Wer treibt, was wird angezeigt.** Die UHR treibt: solange die Uhren-App offen ist, schickt sie
alle 3 s die naechste Datei (auch waehrend der Aufnahme). Eine Datei ist ein Chunk von ~5 s
(2–3 KB, 3–4 Teile) und wird geloescht, sobald alle ihre Teile quittiert sind. Das Handy hoert nur
zu und laedt eine Session hoch, sobald ihr Abschluss (`e_…`) da ist.
- Uhr: Zeile „Zum Handy: 34/120" (Dateien, `Sendeplan.stand`), im Bereit-Zustand dazu ein Balken.
- Handy: zwei Balken, unabhaengig und auch gleichzeitig — „Von der Uhr: a von b" (aus `<rest>`,
  den jeder Teil mitbringt) und „Zum Server: a von b" (Chunks). Kommt mitten in einer Ladung 30 s
  nichts, steht dort „Pumpfoil auf der Uhr oeffnen". Knopf „Jetzt hochladen", wenn etwas wartet.
- Weitermachen: Uhr setzt beim fehlgeschlagenen Teil wieder an (Sendeplan auf Flash), das Handy
  nimmt doppelte Teile an; der Upload fragt `received_chunks` ab und schickt nur, was fehlt.

Was die Uhr NICHT liefert und wie damit umgegangen wird:
- **kein Zeitstempel je Sensorwert** → `t0_ms` je Block = Ankunft; der Server misst die Rate.
- **keine GPS-Geschwindigkeit** → `speed = -1`, der Server rechnet aus den Positionen.
- **Display aus nicht beeinflussbar** → `setKeepScreenOn` waehrend der Aufnahme; ob es dunkel
  weiterlaeuft, zeigt die Abdeckung je Session am Server (`scripts/messweg-pruefen.py`).

## Direkt zum Server ohne Handy (nur Watch 5 / ArkTS, ab 1.0.2)

Jan, 08.10.2026: „dann gehts ohne app und auch fuer leute mit iphone". Einstellungen → **pumpfoil.org**
→ die Uhr zeigt einen Code (`/api/devices/pair-init`, Plattform `huawei`), der Nutzer gibt ihn auf
pumpfoil.org unter Konto ein, die Uhr holt per `/pair-poll` ihr Geraete-Token (`direkt.json`).
Gekoppelt bleibt die Wear Engine still; die Uhr holt die Konfiguration selbst (`/api/devices/config`)
und laedt jede ABGESCHLOSSENE Session wie die Android-Bruecke hoch (Meta mit `expected_chunks`,
GPS-Chunks zuerst in Paketen zu 30, `/complete`, erst danach loeschen; Backoff 30 s … 5 min; 401 →
entkoppelt). Logik in `Kern.ets` (`direktBereit`, `direktUpload`, getestet in
`test/arkts-kern.test.mjs`), Netz in `Direkt.ets`, Server-Seite in `server/tests/test_huawei_e2e.py`.
**Watch 3/4 (JS-FA)** kann dasselbe ueber `@system.fetch`: `common/direkt.js` (gleicher Ablauf, gleiche
Pakete — Paritaetstest gegen Kern.ets), eingebunden NUR ueber `common/app-wearable.js` (sync-common.sh
kopiert sie als wearable-app.js). Die Wear Engine haelt direkt.js still, indem es `Sendeplan.naechste`
umhuellt — recorder.js bleibt unberuehrt. Zeile „pumpfoil.org" auf der Einstellungsseite nur, wo
`R.direkt` existiert. Tests: `test/direkt.test.mjs` (Koppeln, Konfiguration, Upload, Abbruch +
Wiederaufnahme ohne Doppelte, 401). UNGEPRUEFT: ob Watch 3/4 Dritt-Apps ins Netz laesst; keinen Simulator.
Lite (GT/Fit) hat kein Netz — dort bleibt nur die Wear Engine. **Lite-app.js hat KEINEN Platz mehr:** der
Snapshot-Bau (jerry-snapshot, rc 10) kippte am 08.10.2026 bei Release-Heap-Spitze 38864 und schon an
einer einzelnen Pruefzeile; jede Aenderung an recorder.js/kern.js/lauf.js zuerst mit `./build-all.sh`.
**UNGEPRUEFT auf echter Uhr:** ob eine Watch 5 ohne Android-Handy ins Netz kommt (WLAN, eSIM, oder
ueber die Health-App am iPhone).

DevEco-Emulator: dessen GPS-Emulation kam nie bei der App an (System kannte nur 0,0). Heisst das
Geraet „emulator", faehrt die App selbst eine Runde wie `common/sim-gps.js` (`Recorder.simAn`).

## Was Jan eintragen muss (Platzhalter `..._EINTRAGEN`)

**09.10.2026: Huawei-Developer-Mitgliedschaft freigegeben** (Identitaetspruefung durch, Apps hochladbar). Android-Fingerabdruck eingetragen: Play **App-Signaturschluessel** SHA-256 `50:A7:8D:3E:E9:62:7F:96:B6:3A:13:C7:E8:75:02:50:77:8E:99:6F:0C:D3:E4:8A:58:6F:38:CD:7A:45:0F:BB` (in Uhr-Konfig ohne Doppelpunkte; ArkTS-Form noch Vermutung). Uploadschluessel (nur selbst signierte Builds): `B1:D6:1D:8B:19:19:45:D1:77:6B:FC:15:37:41:45:E7:C5:29:A8:6E:CF:F8:FD:A0:32:36:E5:F4:70:C9:8C:1D`.

**Stand AppGallery Connect (08.10.2026):** Projekt `Pumpfoil` (Project ID `101653523865251079`); Debug-Zertifikat `pumpfoil-huawei-debug`
(Schluessel in Jans privatem Schluessel-Repo, nie hier); **App ID `6917618548983879423`** = HarmonyOS-App
`Pumpfoil`, Paket `org.pumpfoil.huawei` (Seite „Certificates, App IDs and Profiles" = HarmonyOS ab API 12,
also die Watch 5/ArkTS). Offen: ob Lite und Watch 3/4 dieselbe App ID nutzen; Debug-Profil (.p7b) erst mit
Geraete-UDID; `client_id` fuer `arkts/…/module.json5` (vermutlich die OAuth-Client-ID der App, nicht die App ID).

| Was | Wo |
|---|---|
| Bundle-Name der Uhren-App (Vorschlag `org.pumpfoil.huawei`) | `config.json` beider Projekte → `app.bundleName`, dazu `HUAWEI_WATCH_PKG` in `android/app/build.gradle.kts` |
| SHA-256 des Signierschluessels der Android-App (bei Play App Signing: Googles Schluessel) | `common/konfig.js` → `PHONE_FP` **und** `config.json` → `supportLists` (`org.pumpfoil.app:<fingerprint>`) |
| Signier-Konfiguration (Zertifikat, Profil `.p7b`) | DevEco → Project Structure → Signing Configs (landet in `build-profile.json5`, Dateien NICHT committen) |
| Wear-Engine-App-ID der Android-App | ✅ `appid=119274989` (HUAWEI-ID-Produkt „Pumpfoil", 09.10.2026) in `android/app/build.gradle.kts` → `huaweiAppId` |
| Signatur-Fingerabdruck der Uhren-App | `android/app/build.gradle.kts` → `HUAWEI_WATCH_FP` **und** `watch-apple/Sources-iOS/HuaweiBruecke.swift` → `uhrFp` |
| iOS: Client-ID, Client-Secret, Scheme-Secret (AppGallery Connect, HUAWEI-ID-Dienst + Wear-Engine-Antrag fuer die iOS-App `org.pumpfoil.coolwatch`) | `HuaweiBruecke.swift` → `clientId`, `clientSecret`, `schemeSecret`. **Secrets gehoeren nicht ins oeffentliche Repo** — vor dem Commit klaeren, ob sie als Build-Setting/xcconfig (gitignored) hineinkommen |
| iOS: Rueck-Scheme `pumpfoil://huawei/zurueck` beim Wear-Engine-Antrag als Callback eintragen | AppGallery Connect |

## iOS-App (`watch-apple/Sources-iOS/HuaweiBruecke.swift`)

Noch nie gebaut (kein Xcode/SDK auf der VM). Baut OHNE Framework unveraendert (`#if canImport
(WearEngineSDK)`), die Karte erscheint dann nicht. Einbau:
1. Wear Engine SDK fuer iOS (1.0.0.304, Huawei Health ≥ 15.0.10.315) herunterladen, `WearEngineSDK.
   framework` + `WearEngineSDK.bundle` nach `watch-apple/` legen (gitignored), in Xcode zum Target
   `Pumpfoil` als „Embed & Sign" plus die zwei Abhaengigkeiten aus Huaweis „Integrating the SDK".
2. `xcodegen generate` (neue Datei, LSApplicationQueriesSchemes).
3. Erster Build zeigt, ob `geraeteLaden` (Methodenname aus dem Android-SDK uebernommen) zur
   iOS-Signatur passt — EINZIGE als ungeprueft markierte Stelle. Doku-Seite: „Querying Available
   Wearable Devices" (check-availabla-dev-ios-0000001921237861).
4. Rueckweg aus Huawei Health: die Doku prueft im `onOpenURL` auf `wearenginesdk://`, nennt als
   Scheme-Parameter aber ein eigenes Schema — `urlEmpfangen` nimmt beides. Auf echtem iPhone pruefen.

## SDK holen (nicht im Repo)

Das Wear-Engine-SDK fuer die Uhr liegt **nicht** im Repo (die Wearable-Fassung ist „All rights
reserved", siehe `.gitignore`). Herunterladen von
https://developer.huawei.com/consumer/en/doc/connectivity-Library/litewearable-sdk-cn-0000001705004353
und ablegen als:

| Projekt | Datei | Pruefsumme |
|---|---|---|
| `lite/` | `lite/entry/src/main/js/MainAbility/wearengine/wearengine.js` (wearengine-litewearable 5.0.2.306) | `wearengine.js.sha256` daneben |
| `wearable/` | `wearable/entry/src/main/js/MainAbility/wearengine/wearengine.js` (wearengine-wearable 5.0.2.306) | `wearengine.js.sha256` daneben |

Pruefen: `sha256sum wearengine.js` muss zur `.sha256` passen.

iOS: `WearEngineSDK.framework`/`.bundle` ebenso nur lokal (`watch-apple/.gitignore`), s. unten.

## Bauen

**Auf der VM (seit 07.10.2026):** `./build-all.sh` — HarmonyOS Command Line Tools fuer Linux (6.1.1,
SDK API 24) unter `~/harmonyos/command-line-tools` (ausserhalb des Repos, NIE committen; Pfad per
`CLT_HOME`). Baut alle drei Linien unsigniert, vorher sync + Node-Tests. Die Lite-/JS-FA-Linien
brauchen das lokale Wear-Engine-SDK (`wearengine.js`, s. „SDK holen"). Signieren bleibt DevEco.

**Simulator (DevEco):** dort fehlt `@system.wearengine`, schon der Import scheitert und die Seite
bleibt schwarz. `./sim.sh an` laesst die Seite eine Attrappe laden (Senden scheitert sichtbar mit
Code -2), `./sim.sh aus` stellt die echte Wear Engine wieder her — NIE im Zustand „an" committen.
Ablauf-Logs: DevEco > Log, Filter `Pumpfoil`.

DevEco Studio 6.x (macOS/Windows) → `watch-huawei/lite` bzw. `watch-huawei/wearable` oeffnen → Build HAP(s).
Die Watch-3/4-Linie (HarmonyOS 2-4) ist aelter; bietet DevEco beim Oeffnen eine Migration an,
annehmen und nur `config.json`/Seiten behalten. Danach im
Build-Log auf „Failed to convert … to a snapshot" achten: dann ist ein Buendel zu gross oder nutzt
Syntax, die JerryScript nicht kennt (s. oben, `build-all.sh` prueft das).

## Herkunft

- Wear Engine SDK: nicht im Repo, siehe „SDK holen".
- Build-Dateien (`build-profile.json5`, `hvigor*`, `oh-package.json5`) nach dem Beispiel
  „sportwatch-wear-engine-lite-wearable-to-mobile" (Explore in HMOS Wearable, MIT).
