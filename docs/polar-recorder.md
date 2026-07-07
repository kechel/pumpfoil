# Polar-Recorder (BLE SDK) — Konzept & Vorbereitung

Status: **in Vorbereitung, NICHT live.** Hinter Beta-Flag (`profile.beta`, Allowlist
`BETA_USER_IDS`, Default Jans Konten 2+4) — aktuell nur für Jan sichtbar. Native BLE-Teile
brauchen echte Polar-Hardware zum Testen (auf der Server-VM nicht testbar).

## Warum überhaupt (zusätzlich zu AccessLink)

- **AccessLink-API** (schon live, `server/app/api/…` + „Verknüpfte Konten"): zieht nach dem Sync
  Trainings als Sessions — aber **ohne Roh-Accelerometer** → nur `gps_only` (keine Pump-/On-Foil-
  Erkennung), wie Strava/Suunto/COROS.
- **Polar BLE SDK**: liefert **Roh-Accelerometer + HR** per Bluetooth (25/50/100/200 Hz, 2/4/8 G) →
  **volle Pumpfoil-Analyse** (unser Modell braucht ≥ ~15 Hz; 50 Hz reichen locker, Pump-Signal ~1–2 Hz).

**Kein On-Device-App-Store bei Polar** (anders als Garmin Connect IQ / Wear OS / Apple / Zepp OS) →
keine App AUF der Uhr. Der Recorder läuft in **unserer bestehenden Handy-App** (Android/iOS) und
spricht die Polar-Uhr/den -Sensor per BLE an.

## Geräte / Datenraten (Stand SDK 2026)

- **Uhren mit SDK-Mode:** Vantage V3, Vantage M3, Grit X2, Grit X2 Pro — Accel **50 Hz / 8 G**.
- **Sensoren:** H10 (Brustgurt), Verity Sense, OH1 — Accel **bis 200 Hz**, dazu HR/ECG/PPG.
- Ältere Polar-Uhren (Vantage V2/Grit X/Pacer/Ignite) haben **keinen** SDK-Mode → nur AccessLink.

## Zwei Aufnahme-Modi

1. **Live-Streaming** (`PolarOnlineStreamingApi`): Handy in der Nähe (Weste/Boje). App streamt
   Accel+HR von Uhr/Sensor, **Handy liefert GPS**. Vorteil: sofort, kein Setup. Nachteil: Handy muss mit.
2. **Offline-Recording** (`PolarOfflineRecordingApi`, SDK-Mode): vorher „scharf schalten", die Uhr
   zeichnet Accel (+ eigene GPS-Route) auf, App **zieht nach der Session per BLE** die Aufzeichnung.
   Vorteil: kein Handy während der Fahrt. Nachteil: Setup-Schritt + Speicher-/Format-Limits prüfen.

## Ingest-Mapping (siehe docs/data-format.md, docs/ingest-contract.md)

- Bestehender Upload-Vertrag: GPS-Track + int16-Accel-Chunks. Der Polar-Recorder muss:
  - Accel-Samples (mG → unser int16/scale) + Rate mappen; `accel_scale`/`accel_hz` korrekt setzen.
  - GPS: bei Live vom Handy (Standort-API), bei Offline aus der Polar-Route.
  - HR optional mitliefern.
- Danach greift die **server-seitige Analyse unverändert** (On-Foil-Modell, Pump-Kadenz) → kein
  Extra-Analysecode nötig, nur ein weiterer Recorder-Client (wie im Ingest-Contract vorgesehen).

## Integrationspunkte (nativ, bei aktiver Entwicklung mit Hardware)

- **Android** (`android/app`): Dependency `com.google.android.play`… nein → Polar: `polar-ble-sdk`
  (Gradle: `com.github.polarofficial:polar-ble-sdk`), BLE-Permissions (`BLUETOOTH_SCAN`/`CONNECT`,
  Standort für BLE-Scan), Device-Scan/Connect-Flow, Streaming/Offline → Recorder-Upload.
- **iOS** (`watch-apple/Sources-iOS`): `PolarBleSdk` (SPM/CocoaPods), `NSBluetoothAlwaysUsageDescription`,
  gleicher Flow.
- **Gating:** Einstiegs-UI erst zeigen, wenn `profile.beta` (Web schon so; Apps analog per Beta-Flag).

## Vorbereitet (dieser Stand)

- Server: `BETA_USER_IDS` (config) + `profile.beta` (schemas/auth).
- Web (`LinkedAccounts.tsx`): versteckte Beta-Karte „Polar-Recorder", nur wenn `profile.beta`.
- Dieses Dokument.

## Offen (braucht Jan / Hardware)

- Native BLE-Implementierung Android + iOS (SDK, Permissions, Scan/Connect, Streaming/Offline, Upload).
- Test mit echter Polar-Uhr/-Sensor (BLE auf der VM nicht möglich).
- Entscheidung Live vs. Offline als Default; Datenraten-Feintuning; UX-Flow.
- Freischalten (Beta-Flag entfernen / erweitern) erst nach Test.
