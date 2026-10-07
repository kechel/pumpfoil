# HUAWEI-Uhren als Recorder — Recherche-Stand

Stand 07.10.2026. Anlass: Nutzeranfrage aus Polen („Huawei is very popular in Poland").
Reine Recherche, noch nichts gebaut, kein Geraet getestet. Kennzeichnung:
**[DOK]** offizielle Huawei-/OpenHarmony-Doku · **[FORUM]** GitHub/Foren/Blogs · **[UNKLAR]** nichts Belastbares.
Huawei-Doku ist fast nur per JavaScript lesbar; Zahlen vor einer Entscheidung im Original nachlesen.

## Zwei Welten

| | **Watch GT 3/4/5/6, Fit, D2** („Lite Wearable") | **Watch 3/4/5** (volles HarmonyOS, s. „Drei Linien") |
|---|---|---|
| App-Technik | Lite-JS (HML/CSS, JerryScript ES5.1, Heap 64-512 KB) | ArkTS/ArkUI (Stage-Modell, HAP) |
| Beschleunigung | `@system.sensor.subscribeAccelerometer`, roh x/y/z, `game` = 20 ms (~50 Hz), `ui` = 60 ms (~16,7 Hz) [DOK]; **keine Zeitstempel**; GT 6 liefert laut Forum gar nichts [FORUM] | `@ohos.sensor`, Intervall in ns [DOK]; erreichbare Rate auf der Uhr [UNKLAR] |
| GPS | `@system.geolocation.subscribe`, eigenes GNSS, **kein Speed-Feld, kein Intervall** [DOK] | `geoLocationManager` [DOK], Speed/1 Hz plausibel [UNKLAR] |
| Display aus | `setKeepScreenOn` verhindert nur den Inaktivitaets-Timeout, nicht Handgelenk senken [DOK]; keine Hintergrund-API fuer Lite [UNKLAR, vermutlich keine] | Continuous Task (`startBackgroundRunning`, Modus `location`) [DOK]; ein Team fand keinen passenden Typ fuer Dauer-Sensoraufnahme [FORUM] |
| Netz | kein HTTP; nur Wear Engine P2P zum Handy, Uhr-App muss dabei **im Vordergrund** sein (Fehler 206) [DOK] | WLAN/eSIM vorhanden, ob Fremd-Apps direkt HTTPS duerfen [UNKLAR]; Praxis: P2P [FORUM] |
| Codebasis | eigene | eigene (zweite) |

**Hauptrisiko auf BEIDEN:** 30-120 min Aufnahme bei dunklem Display ist nirgends belegt — genau die Stelle,
die uns auf Wear OS Wochen gekostet hat. Erst ein langer Test auf echter Hardware entscheidet.

## Drei Linien, nicht zwei (Recherche 07.10.2026)

Belegt durch ein offenes Projekt mit Gerätetest (Home Assistant fuer Huawei-Uhren, `docs/platform-
constraints.md` dort: signierte ArkTS-App auf GT 6, Firmware 6.0.0.188, scheitert mit „Failed to
decompress", die Lite-JS-App laeuft) [FORUM, mit Geraetebeleg]:

| Linie | Geraete | App-Modell | bei uns |
|---|---|---|---|
| Lite | Watch GT 3/4/5/6, Fit, D2 — auch mit „HarmonyOS 6" im Namen bleibt das LiteOS | FA, Lite-JS (ES5.1, JerryScript), `liteWearable` | `lite/` ✅ gebaut |
| Wearable alt | Watch 3, Watch 4 / 4 Pro (global noch HarmonyOS 4.3, Sept. 2025) | FA, JS (`wearable`) | `wearable/` ✅ gebaut |
| Wearable neu | **Watch 5** (global HarmonyOS 6.x), kuenftig jede Watch nach dem Update | **nur Stage/ArkTS** (API 20/21, `module.json5`) | `arkts/` gebaut 07.10. (nie auf Hardware) |

- Dass HarmonyOS 5/6 auf der Watch 5 KEINE FA-/JS-Apps mehr installiert, ist [UNKLAR, sehr wahrscheinlich]:
  HarmonyOS NEXT fuehrt das FA-Modell als abgekuendigt, und das genannte Projekt baut fuer Watch 4/5/
  Ultimate ausschliesslich ArkTS. Ein Test mit unserer `wearable/`-App auf einer Watch 5 klaert es.
- Bekommt die Watch 4 ihr Update auf 5/6, faellt sie vermutlich von `wearable/` auf die ArkTS-Linie.
- **Watch Ultimate [UNKLAR]:** Huaweis eigener Forenartikel „Wearable Device Types" fuehrt sie unter Lite,
  das Home-Assistant-Projekt unter ArkTS. Erst ein Geraet entscheidet; bis dahin in keiner Liste versprechen.
- **ArkTS-Seite (Recorder.ets):** Erfolgscode `P2pResultCode.COMMUNICATION_SUCCESS = 207` [DOK, SDK-Typen API 24].
  Ungeprueft: ob die Continuous Task (Modus location) bei dunklem
  Display auch den Beschleunigungssensor weiterlaufen laesst (`messweg.bg` im /complete sagt, ob sie lief).
  Fingerabdruck-Form fuer die Handy-App: Huaweis Forum nennt `<Paketname>_<Base64-Public-Key>`.
- Wear Engine gibt es auch auf der ArkTS-Seite (`@kit.WearEngine`, P2P-Nachrichten) — unser Uebertragungs-
  format (PF1-Teile) und die Handy-Bruecken bleiben gleich. Neu waeren nur Seite + Geraete-Schicht.
- Ob ArkTS unseren ES5-Kern (`common/kern.js`) direkt importieren kann, ist [UNKLAR]; notfalls 1:1 nach
  ArkTS portieren, die Node-Tests bleiben die Referenz.
- Lite-Grenzen laut demselben Projekt: HAP ≤ 10 MB, Seite ≤ 48 KB, ~1 MB RAM, kein Hintergrund, Bilder
  werden als Roh-RGBA abgelegt (Icons klein halten), Logs/Installation ueber die Handy-App „DevEco Assistant".

## Handy-Seite: Wear Engine
- Android-SDK, Paketname + SHA-256 bei Huawei hinterlegt; **Antrag „Apply for Wear Engine" noetig** (Firmen
  ~2 Wochen, Excel-Formulare zu Daten/Einwilligung) [FORUM]. Ohne Freigabe „Scope unauthorized" [DOK].
- Auf Fremd-Handys: **Huawei Health + HMS Core** noetig [DOK]. Huawei Health ist seit 04/2023 nicht mehr bei
  Google Play (AppGallery/Galaxy Store). Aber: wer eine Huawei-Uhr hat, hat Health ohnehin — sonst laesst sich
  die Uhr gar nicht koppeln.
- Grenzen [DOK, Suchausschnitt]: Nachricht ≤ 1 KB, Datei Uhr→Handy **< 4 MB**, eine Datei gleichzeitig.
  Unsere Chunks passen.
- **Speicher auf der Uhr [UNKLAR, Risiko]:** eine Stunde sind ~720 Accel-Dateien zu 2–3 KB plus GPS,
  grob **2–2,5 MB**. Unterwegs gehen die Chunks laufend raus und werden geloescht — erreicht die Uhr das
  Handy aber nicht (Handy ausser Reichweite, App zu, Fehler 206), sammelt sich alles auf der Uhr. Wie viel
  Speicher eine Fremd-App auf einer Lite-Uhr bekommt, steht nirgends; ein `freeStorage` gibt es (wie bei
  Connect IQ) nicht. Pruefen in der Beta: lange Aufnahme OHNE Handy in Reichweite, dann ob/wann
  `file.writeText` scheitert (wird auf der Uhr gezaehlt und angezeigt). Gegenstueck: docs/WATCH-STORAGE.md.
- **iOS [DOK-nah, Huawei-Forenartikel „Single and Dual Frame WearEngine"]:** „Huawei Health on iOS phones does
  not have an app store, so apps cannot be installed on the sports watch. Currently, only pre-installed apps
  can use iOS Wear Engine for sports watches." Heisst: wer seine Huawei-Uhr mit einem iPhone koppelt, bekommt
  unsere Uhren-App gar nicht erst auf die Uhr — die iOS-Bruecke (`HuaweiBruecke.swift`) haette heute keine
  Nutzer. Sie bleibt im Code (baut ohne Framework unveraendert), wird aber nicht beworben, bis sich das aendert.
- iOS: ein `WESP2PClient` existiert in der Referenz [DOK], ob er mit Lite-Uhren Daten austauscht [UNKLAR].
  iPhone-gekoppelte Watch 3/4/5 teilen das Handy-Netz NICHT per Bluetooth [DOK, Huawei-Support].

## Import-Alternative: Health Kit (Cloud)
`healthkit/v2/activityRecords` + Ortspunkte nur im Trainingskontext [DOK]; **keine Rohbeschleunigung**.
Zugang: oeffentliche AppGallery-App noetig, Firmenpruefung, sensible Typen von Hand geprueft, in China
Mindestkapital-Grenzen [DOK, Geltung in der EU UNKLAR]. Hoechstens „nur GPS" — nachrangig.

## Werkzeuge
- **DevEco Studio** nur Windows/macOS [DOK]; Linux nur Command Line Tools (hvigor/ohpm/hdc).
  Lite-JS baut auch mit 6.0.x (GT 6, API 18) [FORUM]; fuer GT 4/5 (API 8) wird teils 4.1 aus dem Archiv
  empfohlen [FORUM].
- Lite-Wearable-Simulator im Device Manager, zeigt kein Sensorverhalten [FORUM]. Ernsthaft testen nur auf
  echter Uhr: Entwicklermodus (7× Build-Nummer), HDC, UDID in AppGallery Connect, Debug-Zertifikat + Profil.
- Veroeffentlichen ueber AppGallery Connect (Laender beim Einreichen waehlbar [FORUM]).
- Typische Fallen [FORUM]: Heap 64 KB, JS-Bundle > 48 KB → „34 internal error", Sensorausfaelle je Modell,
  Installationsfehler 31/40 (API-Level/Signatur), P2P-Start auf der ersten Seite friert die Uhr ein.

## Quellen (Auswahl)
- Lite-Sensor-API: https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-sensor-service-kit/js-apis-system-sensor.md
- Lite-GPS-API: https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-location-kit/js-apis-system-location.md
- KeepScreenOn: https://github.com/openharmony/docs/blob/master/en/application-dev/reference/apis-basic-services-kit/js-apis-system-brightness.md
- Wear Engine FAQ: https://developer.huawei.com/consumer/en/doc/connectivity-guides/faq-0000001050818031
- Wear Engine Nachrichten/Dateien: https://developer.huawei.com/consumer/en/doc/connectivity-guides/send-message-0000001052460491
- Lite-SDK: https://developer.huawei.com/consumer/en/doc/connectivity-Library/litewearable-sdk-cn-0000001705004353
- Beispiel Lite ↔ Handy: https://github.com/Explore-In-HMOS-Wearable/wear-engine-lite-wearable-to-mobile
- Zwei Codebasen / kein Netz: https://github.com/gentslava/Home-Assistant-HarmonyOS-Next
- GT-Sensorausfaelle: https://bbs.itying.com/topic/69cfe44ac504c50058fd690a
- Display-Verhalten GT 4: https://github.com/shuhuang-1/gt4-ebook-reader
- Hintergrund Watch: https://github.com/presivelab/huawei
- Health Kit Datentypen: https://developer.huawei.com/consumer/en/doc/development/HMS-Plugin-Guides-V1/read-sport-health-datatype-0000001073827835-V1
- DevEco: https://developer.huawei.com/consumer/en/deveco-studio/ · Archiv: https://developer.huawei.com/consumer/cn/deveco-studio/archive/
