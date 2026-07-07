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

## Netz / Deployment (WICHTIG für Tests)

- Die App (`foil-server`, uvicorn `:8090`) läuft auf **dieser VM**. Der **Reverse-Proxy (Apache)
  läuft auf einer SEPARATEN VM** und leitet nur weiter (`ProxyPass / → diese-VM:8090`; Template in
  `deploy/`). Die SPA/`web/dist` + statische Assets liefert die FastAPI-App selbst aus.
- **Diese VM erreicht `pumpfoil.org` / die externe IP NICHT** (ging noch nie) → **niemals
  `curl https://pumpfoil.org/...` von hier** (hängt bis Timeout). Öffentliche Endpunkte **immer
  lokal** testen: `curl http://localhost:8090/...`. `pumpfoil.org` selbst funktioniert einwandfrei
  (PWA + Medien) — nur eben nicht von der VM aus erreichbar.
- Öffentliche, nicht verlinkte Datei-URL (z. B. Play-Belege): über eine App-Route ausliefern
  (Beispiel `GET /demo/wear-fgs.webm` in `main.py`) → erscheint dann unter `https://pumpfoil.org/...`.

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
- **Datenschutz / Cookies:** pumpfoil.org setzt **null Cookies**. Nur first-party `localStorage` für
  Funktion (Login-Token, Sprache `foil_lang`, `theme`, Banner-Version, `hideCompareTip`) — kein
  Tracking/Analytics (harte Vorgabe), keine Dritt-Skripte/Fonts/Karten von extern. YouTube nur als
  **Click-to-Load** über `youtube-nocookie.com` (Impressum-Keys `imp.yt*`). → **Kein Cookie-Banner
  nötig** (Consent braucht es nur für nicht-essentielle/Tracking-Speicherung, die wir nicht haben).
  Erst neu bewerten, falls je ein Dritt-Skript/Analytics/externe Font/Karte dazukommt.
- **News-Banner (DB-getrieben, kein PWA-Rebuild):** Inhalt + Version stehen in der DB
  (`NewsBanner`-Singleton), öffentlicher `GET /api/app/news`. `WelcomeBanner.tsx` holt das und zeigt den
  Banner, wenn `enabled` und `version` > weggeklickter Wert (localStorage `foil_banner_v1`); Text =
  `texts[lang]||de`. **Gepflegt im Admin-Tab „News-Banner"** (`PUT /api/admin/news`): Text je Sprache +
  Version-Bump → News posten ohne Deploy. **HARTE REGEL: der Banner ist GLOBAL/öffentlich (alle Nutzer,
  alle Sprachen) → NUR allgemeine Ankündigungen. NIEMALS Persönliches oder an einzelne Nutzer Gerichtetes
  in den Banner** (Privatsphäre); persönliche Nachrichten ausschließlich per 1:1-Chat/DM. „Trag den Banner
  nach" = nur allgemeine News; im Zweifel nachfragen. **TODO:** dasselbe in Android/iOS (könnten
  `/api/app/news` auch abfragen).
- Commit-Trailer wie vom Harness vorgegeben.

## Dokumentation & weitere Kontext-Quellen

**Verträge & Datenformat**
- [`docs/data-format.md`](docs/data-format.md) — Upload-Vertrag Watch↔Server (GPS + int16-Accel-Chunks).
- [`docs/ingest-contract.md`](docs/ingest-contract.md) — wie eine beliebige Watch-Plattform zum Recorder wird (2 Upload-Wege).

**Produkt & Planung**
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — Ziel: alle gängigen Sportuhren; welche unterstützt/geplant.
- [`docs/UX-IA.md`](docs/UX-IA.md) — Informationsarchitektur über bestehende + geplante Features.
- [`docs/IDEAS.md`](docs/IDEAS.md) — Ideen-Backlog (noch nichts umgesetzt; nur sammeln).
- [`docs/PARITY-AUDIT.md`](docs/PARITY-AUDIT.md) — Feature-Parität Web ↔ Watch/Apps (✅/⚠️/❌/🐛).

**Komponenten-READMEs**
- [`watch/README.md`](watch/README.md) · [`watch-apple/README.md`](watch-apple/README.md)
  (+ [`UPLOAD.md`](watch-apple/UPLOAD.md), App-Store-Submit) — Recorder-Apps.
- [`deploy/README.md`](deploy/README.md) — Apache/systemd-Deploy.
- [`brand/README.md`](brand/README.md) — Marken-/Store-/Social-Assets + Generator (`brand/master/`); Zuordnungs-Karte.
- [`analyse/README.md`](analyse/README.md) + [`FINDINGS.md`](analyse/FINDINGS.md) — Dual-Watch-Experiment (Pump-Wahrheit).

**Memories (lokal, sessionübergreifend — NICHT im Repo)**
Persistenter Kontext unter `~/.claude/projects/-home-jan-garmin-connect-iq/memory/`.
[`MEMORY.md`](file:///home/jan/.claude/projects/-home-jan-garmin-connect-iq/memory/MEMORY.md) ist der
**vollständige Index** und wird jede Session automatisch geladen. Schlüssel-Memories u. a.:
- `build-deploy-matrix`, `github-repo`, `jan-knows-build-constraints` — wer baut/deployt was, Push-Konvention.
- `connectiq-sdk-build`, `wear-build-jdk` — Watch-/Wear-Build-Details.
- `backups`, `prod-restart-ok`, `web-deploy-build` — Betrieb/Deploy.
- `wrist-detector-improvements`, `board-imu-experiment` — Detektor-Bilanz + offene ML-/FR55-Themen.
- `garmin-watch-fieldtest-gotchas`, `garmin-settings-pairing`, `todo-watch-model-direct-download` — Garmin-Praxis.
- `todo-oauth-login`, `ios-native-port`, `roadmap-multiplatform`, `user-technical-poweruser`, `jan-prefers-large-images`.
