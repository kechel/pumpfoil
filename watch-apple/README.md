# Pumpfoil — Apple Watch Recorder (watchOS)

Dünner Recorder: GPS (1 Hz) + rohe Beschleunigung (25 Hz) + HR → lädt in Chunks
auf den Pumpfoil-Server (Raw-Ingest-Contract, siehe `../docs/ingest-contract.md`).
Analyse passiert serverseitig.

## Voraussetzungen
- **Mac mit Xcode** (watchOS 9+)
- Apple Developer Account (für Build auf echter Uhr)
- [XcodeGen](https://github.com/yonyz/XcodeGen): `brew install xcodegen`

## Projekt öffnen
```bash
cd watch-apple
xcodegen generate        # erzeugt Pumpfoil.xcodeproj aus project.yml
open Pumpfoil.xcodeproj
```
In Xcode unter **Signing & Capabilities** dein **Team** wählen (Bundle-ID
`org.pumpfoil.watchapp` ggf. anpassen). HealthKit-Capability ist über die
Entitlements bereits gesetzt.

## Auf die Uhr bringen
1. Schema **PumpfoilWatch** + deine Apple Watch als Ziel wählen → Run.
2. In der Web-App unter **Account** einen **Pairing-Code** erzeugen.
3. In der Watch-App den Code eingeben → „Verbinden" (Token wird gespeichert).
4. **Start** → foilen → **Stop**. Upload läuft automatisch (alle 10 s + am Ende).

## Lokal gegen Test-Server
Standard-Endpoint ist `https://pumpfoil.org`. Zum Testen gegen einen anderen
Server vor dem Build setzen (z. B. im Simulator-Container) — der Key ist
`baseURL` in `UserDefaults`. Schnellster Weg: in `Api.swift` den Default
temporär ändern.

## Status
v1 (Erstwurf, blind geschrieben — auf Linux nicht kompilierbar). Beim ersten
`xcodegen`/Build in Xcode kann es Anpassungen geben (API-Verfügbarkeit,
Signing, Background-Modes). Build-Fehler einfach zurückmelden, dann nachziehen.

Bekannte Punkte für die erste Iteration:
- Hintergrund-Location auf der Uhr braucht ggf. `allowsBackgroundLocationUpdates`
  + aktive `HKWorkoutSession` (ist gesetzt) — am Gerät verifizieren.
- Für höhere Accel-Raten/Batching gibt es ab watchOS 9 `CMBatchedSensorManager`
  (aktuell `CMMotionManager` @ 25 Hz, ausreichend für Pump-Erkennung).
