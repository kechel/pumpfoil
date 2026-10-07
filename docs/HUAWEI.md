# HUAWEI-Uhren als Recorder — Recherche-Stand

Stand 07.10.2026. Anlass: Nutzeranfrage aus Polen („Huawei is very popular in Poland").
Reine Recherche, noch nichts gebaut, kein Geraet getestet. Kennzeichnung:
**[DOK]** offizielle Huawei-/OpenHarmony-Doku · **[FORUM]** GitHub/Foren/Blogs · **[UNKLAR]** nichts Belastbares.
Huawei-Doku ist fast nur per JavaScript lesbar; Zahlen vor einer Entscheidung im Original nachlesen.

## Zwei Welten

| | **Watch GT 3/4/5/6, Fit, D2, Ultimate** („Lite Wearable") | **Watch 4 / 5** (volles HarmonyOS) |
|---|---|---|
| App-Technik | Lite-JS (HML/CSS, JerryScript ES5.1, Heap 64-512 KB) | ArkTS/ArkUI (Stage-Modell, HAP) |
| Beschleunigung | `@system.sensor.subscribeAccelerometer`, roh x/y/z, `game` = 20 ms (~50 Hz), `ui` = 60 ms (~16,7 Hz) [DOK]; **keine Zeitstempel**; GT 6 liefert laut Forum gar nichts [FORUM] | `@ohos.sensor`, Intervall in ns [DOK]; erreichbare Rate auf der Uhr [UNKLAR] |
| GPS | `@system.geolocation.subscribe`, eigenes GNSS, **kein Speed-Feld, kein Intervall** [DOK] | `geoLocationManager` [DOK], Speed/1 Hz plausibel [UNKLAR] |
| Display aus | `setKeepScreenOn` verhindert nur den Inaktivitaets-Timeout, nicht Handgelenk senken [DOK]; keine Hintergrund-API fuer Lite [UNKLAR, vermutlich keine] | Continuous Task (`startBackgroundRunning`, Modus `location`) [DOK]; ein Team fand keinen passenden Typ fuer Dauer-Sensoraufnahme [FORUM] |
| Netz | kein HTTP; nur Wear Engine P2P zum Handy, Uhr-App muss dabei **im Vordergrund** sein (Fehler 206) [DOK] | WLAN/eSIM vorhanden, ob Fremd-Apps direkt HTTPS duerfen [UNKLAR]; Praxis: P2P [FORUM] |
| Codebasis | eigene | eigene (zweite) |

**Hauptrisiko auf BEIDEN:** 30-120 min Aufnahme bei dunklem Display ist nirgends belegt — genau die Stelle,
die uns auf Wear OS Wochen gekostet hat. Erst ein langer Test auf echter Hardware entscheidet.

## Handy-Seite: Wear Engine
- Android-SDK, Paketname + SHA-256 bei Huawei hinterlegt; **Antrag „Apply for Wear Engine" noetig** (Firmen
  ~2 Wochen, Excel-Formulare zu Daten/Einwilligung) [FORUM]. Ohne Freigabe „Scope unauthorized" [DOK].
- Auf Fremd-Handys: **Huawei Health + HMS Core** noetig [DOK]. Huawei Health ist seit 04/2023 nicht mehr bei
  Google Play (AppGallery/Galaxy Store). Aber: wer eine Huawei-Uhr hat, hat Health ohnehin — sonst laesst sich
  die Uhr gar nicht koppeln.
- Grenzen [DOK, Suchausschnitt]: Nachricht ≤ 1 KB, Datei Uhr→Handy **< 4 MB**, eine Datei gleichzeitig.
  Unsere Chunks passen.
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
