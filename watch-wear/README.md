# Pumpfoil — Wear OS Recorder

Dünner Recorder: GPS (1 Hz) + rohe Beschleunigung (25 Hz) + HR → Chunk-Upload auf den
Pumpfoil-Server (Raw-Ingest-Contract, `../docs/ingest-contract.md`). Analyse serverseitig.

## Voraussetzungen
- **Android Studio** (gratis, Win/macOS/Linux) inkl. Wear-OS-SDK + Emulator
- Wear OS 3+ (minSdk 30)

## Öffnen & bauen
```bash
# in Android Studio: "Open" -> Ordner watch-wear/ wählen
# Gradle-Sync läuft automatisch (lädt AGP/Kotlin/Deps).
```
Falls der Gradle-Sync wegen Versionskonflikten klemmt: in Android Studio die
vorgeschlagenen AGP/Gradle-Updates annehmen — die Quellen (`app/src/main/java/...`)
und das Manifest bleiben gleich. Notfalls ein frisches **„Wear OS → Empty Activity"**-
Projekt (Package `org.pumpfoil.watch`) anlegen und die `Sources` + Manifest-Einträge +
Dependencies aus `app/build.gradle.kts` übernehmen.

## Auf Emulator/Uhr
1. Wear-OS-Emulator (oder echte Uhr im Dev-Modus) als Ziel → Run.
2. In der Web-App unter **Account** einen **Pairing-Code** erzeugen.
3. In der App eingeben → „Verbinden" (Token wird in SharedPreferences gespeichert).
4. **Start** → bewegen → **Stop**. Upload läuft automatisch (alle 10 s + am Ende).

## Lokal gegen Test-Server
Default-Endpoint `https://pumpfoil.org`. Zum Testen `Api.baseUrl` in `Api.kt`
temporär ändern (oder einen `baseUrl`-Eintrag in SharedPreferences setzen).

## Status
v1 (Erstwurf, blind geschrieben — auf Linux nicht kompilierbar). Erwartbar sind beim
ersten Sync/Build kleinere Anpassungen (Dependency-Versionen, Health-Services statt
`TYPE_HEART_RATE`, Foreground-Service-Permissions auf neueren APIs). Build-Fehler
zurückmelden, dann ziehe ich nach.

Bekannte Punkte für die erste Iteration:
- HR via `SensorManager.TYPE_HEART_RATE` (einfach) — alternativ **Health Services**
  (`androidx.health:health-services-client`) für robustere Messung.
- Hintergrund-GPS braucht ggf. `ACCESS_BACKGROUND_LOCATION` zusätzlich, je nach API-Level.
