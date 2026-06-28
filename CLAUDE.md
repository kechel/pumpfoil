# PumpFoil — Projekt-Setup für Claude

Multi-Plattform-Pumpfoil-Tracker: dünne Recorder-Apps auf Sportuhren, Analyse server-seitig,
Web-PWA + native Mobile-Apps als Frontend. Repo öffentlich (AGPL).

## Stack

- **Server:** FastAPI, **PostgreSQL** (`localhost:5432/foil`, `DATABASE_URL` in `server/.env`).
  Postgres ist die DB — **kein SQLite** (der `sqlite://`-Default in `app/config.py` ist nur
  Dev-Fallback; diese VM + Prod laufen Postgres). systemd-Service **`foil-server`** (Port 8090).
- **Web:** React + Vite + TypeScript (`web/`).
- **Garmin-Uhr:** Monkey C / Connect IQ (`watch/`).
- **Android Phone + Wear OS:** Kotlin/Compose, ein Gradle-Projekt (`android/`, Module `:app` + `:wear`).
- **iOS App + Apple Watch:** SwiftUI (`watch-apple/`, `Sources-iOS/` = iPhone-App, `Sources/` = Watch).

## Was Claude bauen/deployen kann — und was nicht

| Ziel | Claude baut? | Live/Deploy |
|---|---|---|
| **Web** (`web/`) | ✅ bauen **und** deployen | `cd web && npm run build` → `web/dist`, von FastAPI live ausgeliefert. **Sofort online, kein Restart.** |
| **Garmin-Uhr** (alle 78 Geräte) | ✅ bauen | Version in `watch/source/Config.mc` bumpen, dann `cd watch && SDK_HOME=/home/jan/connectiq-sdk-9.2.0 ./build-all.sh` → `watch/bin/` (gitignored). Server liest frisch pro Request → **sofort live** unter `/api/app/devices` + `/api/app/download/<id>`. |
| **Android Phone** (`:app`) | ✅ bauen + verifizieren | `cd android && JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 ./gradlew :app:compileDebugKotlin --no-daemon`. Signiertes Release-AAB + Play-Upload: **nur Jan.** |
| **Wear OS** (`:wear`) | ✅ bauen + verifizieren | `./gradlew :wear:compileDebugKotlin --no-daemon`. Signiertes Release + Upload: **nur Jan.** |
| **iOS App** (`Sources-iOS/`) | ❌ nur Code | Build/Verify/Sign/Upload **nur Jan** (Xcode/macOS, `project.yml` via xcodegen). |
| **Apple Watch** (`Sources/`) | ❌ nur Code | Build/Verify/Sign/Upload **nur Jan** (Xcode/macOS). |

Diese Verteilung ist Jan bekannt — **nicht in jeder Antwort wiederholen** („das kann nur ich in Xcode"
etc.). Einfach die Code-Änderung liefern und sagen, was noch auf Jans Seite zu tun ist, falls relevant.

## Backups

Zwei systemd-Timer (User `jan`, oneshot), Skripte in `deploy/`:
- `foil-backup-latest.timer` → täglich 03:30 → `backup-latest.sh`: `pg_dump` (custom, atomar) +
  `server/data` + `server/media` als Hardlinks nach `/opt/foil/backups/pumpfoil.org/latest-backup/`
  (Pull-Quelle für externen Backup-Server). `BASE` per `BACKUP_BASE` überschreibbar.
- `foil-backup-snapshot.timer` → Mi 04:00 → `backup-snapshot.sh`: `cp -al` → permanenter
  Hardlink-Snapshot unter `…/hardlink-snapshots/<stamp>`.

## Git / GitHub

- Remote: **`git@github.com:kechel/pumpfoil.git`** (`origin/main`). **Standing: nach jedem Commit
  zu GitHub pushen** — Jan hält `main` immer aktuell auf GitHub.

## Konventionen

- **Server neu starten** darf Claude jederzeit (Dev-Stadium): `sudo systemctl restart foil-server`.
  Nach `server/`-Code-Änderungen nötig; Web/Watch-Builds brauchen **keinen** Restart (frisch gelesen).
- **Detektor-/Analyse-Pipeline** (`server/app/analysis/`): Änderungen erst mit Jans OK; Befund +
  verifizierter Fix + Regressions-Check vorlegen. Reanalyse aller Sessions:
  Postgres-`DATABASE_URL` muss im Env sein (manueller `.env`-Parser; `set -a; . ./.env` exportiert
  es NICHT zuverlässig → läuft sonst gegen die alte SQLite und crasht auf `place_lat`).
- **Keine Garmin-Passwörter** im Produkt speichern (nur Jans eigene R&D-Tokens, env, gitignored).
- Commit-Trailer wie vom Harness vorgegeben.
