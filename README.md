> [!WARNING]
> **Service status (9 Oct 2026): pumpfoil.org is wrongly blocked by the DNS4EU filtering resolvers.**
> If the app or the website shows *“Hostname pumpfoil.org not verified”* with a certificate for
> `*.joindns4.eu`, your phone or network uses the filtering DNS from DNS4EU, which currently sends
> pumpfoil.org to its warning page. Every other DNS service resolves it correctly. We have reported
> the false positive (DNS4EU / Whalebone ticket 58102).
>
> **Workaround until it is fixed:** on Android set *Settings → Network → Private DNS* to
> *Automatic* (or to `unfiltered.joindns4.eu`); on other devices use your provider's DNS or the
> unfiltered DNS4EU resolver `86.54.11.100`. Updates on this page.

<p align="center"><strong>No pull requests, please — they’re so Stone Age. Send us a prompt suggestion instead!</strong></p>

<div align="center">

<img src="brand/logo/logo-stacked-light.png" alt="Pumpfoil — track every pump" width="480">

# Pumpfoil

**Record and analyze pump foiling sessions from your sports watch — GPS track, foiling distance, pump cadence and glide phases. Garmin, Wear OS, Apple Watch, Amazfit (Zepp OS) and Huawei (beta), with native iOS/Android apps and a web PWA.**

[pumpfoil.org](https://pumpfoil.org) · License: [AGPL-3.0](#license)

</div>

---

Pump foiling means riding a hydrofoil with no wind, waves or motor — you stay up purely by
pumping the board rhythmically. Pumpfoil records these sessions on your watch and turns the
raw GPS + accelerometer data into a detailed analysis: how long you were actually foiling, how
efficiently you pumped, and where you rode.

The signature feature: your track is **colored exactly over the foiling phases** (by speed, heart
rate or pump cadence) with **every detected pump stroke marked right on the route**.

<div align="center">
  <img src="web/public/landing-track.webp" alt="A pump foiling session: the foiling track colored by speed, individual pumps marked as white dots" width="640">
</div>

## Features

- <img src="docs/readme-icons/watch.svg" width="18"> **Watch recording on every platform** — a [Connect IQ](watch/) app for **all ~78 Garmin
  devices** (fēnix, Forerunner, epix, Instinct, vívoactive, …), plus native **Wear OS**,
  **Apple Watch** and **Amazfit** (Zepp OS) recorder apps. They capture GPS + heart rate (Garmin
  also raw acceleration) and upload the raw data.
- <img src="docs/readme-icons/phone.svg" width="18"> **Native companion apps** — full **iOS** and **Android** apps (sessions, map, track preview,
  per-run stats, history with trend charts, community) alongside the installable **web PWA**.
- <img src="docs/readme-icons/chart.svg" width="18"> **Automatic analysis** — foiling phases, distance, pump cadence and glide phases per session,
  detected server-side from GPS + accelerometer (ML model + GPS state machine).
- <img src="docs/readme-icons/map.svg" width="18"> **Color-coded track** — foiling segments colored by speed / heart rate / pump frequency, with pump markers.
- <img src="docs/readme-icons/upload.svg" width="18"> **FIT upload** — analyze old activities too: drop in a `.fit` file (or Garmin's ZIP export).
- <img src="docs/readme-icons/tag.svg" width="18"> **Labeling UI** — mark pump / glide / not-foiling ranges to build training data for the ML model.
- <img src="docs/readme-icons/community.svg" width="18"> **Community & history** — compare sessions over time, share runs; web UI in 7 languages.
- <img src="docs/readme-icons/download.svg" width="18"> **One-click watch download** — the site detects your watch model and serves the matching build.

## A look inside the app

| | |
|---|---|
| **Track your progress over time** | **Community records** |
| <img src="web/public/landing-history.webp" alt="History view tracking progress over time"> | <img src="web/public/landing-records.webp" alt="Community records"> |
| **Community records per spot** | **Sessions — yours & everyone's** |
| <img src="web/public/landing-spots.webp" alt="Community records per spot"> | <img src="web/public/landing-sessions.webp" alt="Session list, own and all"> |
| **Detailed per-run stats** | |
| <img src="web/public/landing-stats.webp" alt="Detailed per-run statistics table"> | |

## Apps & watches

Native apps on every platform — one account, one analysis backend.

**📱 Android phone**

<img src="web/public/mobile-v3-1.webp" alt="Android — home" width="160"> <img src="web/public/mobile-v3-8.webp" alt="Android — spots map & spot records" width="160"> <img src="web/public/mobile-v3-2.webp" alt="Android — session list" width="160"> <img src="web/public/mobile-v3-3.webp" alt="Android — sessions" width="160"> <img src="web/public/mobile-v3-4.webp" alt="Android — community records" width="160"> <img src="web/public/mobile-v3-5.webp" alt="Android — session list" width="160"> <img src="web/public/mobile-v3-6.webp" alt="Android — session detail" width="160"> <img src="web/public/mobile-v3-7.webp" alt="Android — run on the map" width="160"> <img src="web/public/mobile-v3-9.webp" alt="Android — profile" width="160"> <img src="web/public/mobile-v3-10.webp" alt="Android — community layouts & spots" width="160"> <img src="web/public/mobile-v3-11.webp" alt="Android — history" width="160"> <img src="web/public/mobile-v3-12.webp" alt="Android — run stats & board attitude" width="160"> <img src="web/public/mobile-v3-15.webp" alt="Android — watch stats: recording quality" width="160"> <img src="web/public/mobile-v3-13.webp" alt="Android — community layouts" width="160"> <img src="web/public/mobile-v3-14.webp" alt="Android — community layouts" width="160">

**📱 iOS phone**

<img src="screenshots/mobile/ios-store-65-en/01.png" alt="iOS — home dashboard" width="200"> <img src="screenshots/mobile/ios-store-65-en/02.png" alt="iOS — session with track on map" width="200"> <img src="screenshots/mobile/ios-store-65-en/03.png" alt="iOS — per-run stats: distance, speed, pumps, heart rate" width="200"> <img src="screenshots/mobile/ios-store-65-en/05.png" alt="iOS — community, spots & records" width="200">

**📱 No watch? Record with the phone** (Android & iOS app — strapped to the board or in a pocket)

<img src="web/public/phonerec-v2-3.webp" alt="Phone recorder — start" width="180"> <img src="web/public/phonerec-v2-4.webp" alt="Phone recorder — recording" width="180"> <img src="web/public/phonerec-v2-5.webp" alt="Phone recorder — upload" width="180">

**⌚ Wear OS**

<img src="web/public/watch-wear-v2-7.webp" alt="Wear OS — start" width="160"> <img src="web/public/watch-wear-v2-1.webp" alt="Wear OS — recording" width="160"> <img src="web/public/watch-wear-v2-3.webp" alt="Wear OS — data fields" width="160"> <img src="web/public/watch-wear-v2-6.webp" alt="Wear OS — last run" width="160"> <img src="web/public/watch-wear-v2-10.webp" alt="Wear OS — upload done" width="160">

**⌚ Apple Watch**

<img src="web/public/watch-apple-v2-1.webp" alt="Apple Watch — recording" width="160"> <img src="web/public/watch-apple-v2-2.webp" alt="Apple Watch — on foil" width="160"> <img src="web/public/watch-apple-v2-3.webp" alt="Apple Watch — data fields" width="160"> <img src="web/public/watch-apple-v2-4.webp" alt="Apple Watch — data fields" width="160"> <img src="web/public/watch-apple-v2-8.webp" alt="Apple Watch — settings" width="160">

**⌚ Garmin** (all ~78 Connect IQ devices)

<img src="web/public/watch-garmin-v3-7.webp" alt="Garmin — start" width="160"> <img src="web/public/watch-garmin-v3-1.webp" alt="Garmin — recording" width="160"> <img src="web/public/watch-garmin-v3-3.webp" alt="Garmin — on foil" width="160"> <img src="web/public/watch-garmin-v3-6.webp" alt="Garmin — data fields" width="160"> <img src="web/public/watch-garmin-v3-10.webp" alt="Garmin — upload done" width="160">

**⌚ Amazfit** (Zepp OS)

<img src="web/public/watch-amazfit-v2-7.webp" alt="Amazfit — start" width="160"> <img src="web/public/watch-amazfit-v2-1.webp" alt="Amazfit — recording" width="160"> <img src="web/public/watch-amazfit-v2-2.webp" alt="Amazfit — data fields" width="160"> <img src="web/public/watch-amazfit-v2-4.webp" alt="Amazfit — stop" width="160"> <img src="web/public/watch-amazfit-v2-6.webp" alt="Amazfit — last run" width="160">

**⌚ Huawei** (HarmonyOS — new, beta)

<img src="web/public/watch-huawei-v3-7.webp" alt="Huawei — start" width="160"> <img src="web/public/watch-huawei-v3-1.webp" alt="Huawei — recording" width="160"> <img src="web/public/watch-huawei-v3-3.webp" alt="Huawei — data fields" width="160"> <img src="web/public/watch-huawei-v3-4.webp" alt="Huawei — last run" width="160"> <img src="web/public/watch-huawei-v3-6.webp" alt="Huawei — settings" width="160">

## Architecture

| Directory | Stack | Purpose |
|-----------|-------|---------|
| [`watch/`](watch/) | Monkey C (Connect IQ) | Garmin recorder (all ~78 devices): records GPS + raw accelerometer, uploads raw data |
| [`android/`](android/) | Kotlin · Jetpack Compose | One Gradle project: Android phone app (`:app`) + Wear OS recorder (`:wear`) |
| [`watch-apple/`](watch-apple/) | Swift · SwiftUI | iOS companion app (`Sources-iOS/`) with embedded Apple Watch recorder (`Sources/`) |
| [`watch-zepp/`](watch-zepp/) | JavaScript · Zepp OS (`@zeppos/zml`) | Amazfit recorder: records GPS + heart rate, uploads via the Zepp app |
| [`server/`](server/) | Python · FastAPI · PostgreSQL · numpy/scipy/scikit-learn | Ingest, immutable raw storage, foiling/pump detection, REST API |
| [`web/`](web/) | React · Vite · TypeScript · Tailwind · Leaflet | Installable PWA: sessions, map, charts, labeling, community |
| [`deploy/`](deploy/) | systemd · Apache | Service unit, reverse-proxy config, backup timers |

Raw session data is always stored **complete and unmodified**, so any future detection model can be
re-run on old sessions. Detection runs server-side (fast iteration in Python, no watch recompile).

## Development

**Server**

```bash
cd server
python3 -m venv .venv && . .venv/bin/activate
pip install -e .
cp .env.example .env          # then set DATABASE_URL (Postgres is required)
uvicorn app.main:app --reload --port 8090
# API docs: http://localhost:8090/api/docs
```

**Web**

```bash
cd web
npm install
npm run dev                   # Vite dev server, proxies /api to :8090
```

**Garmin watch** — requires the [Garmin Connect IQ SDK](https://developer.garmin.com/connect-iq/)
and a developer key (see `watch/setup-sdk.sh`). The SDK is **not** included (distributed by Garmin
under its own license). Build one device with `watch/build.sh <device>`, or all manifest devices
with `watch/build-all.sh` (also generates the download catalog the website serves).

**Android phone + Wear OS** — one Gradle project under [`android/`](android/) (modules `:app` and
`:wear`), Kotlin + Jetpack Compose. Build/verify with `./gradlew :app:compileDebugKotlin` /
`:wear:compileDebugKotlin` (JDK 21).

**iOS app + Apple Watch** — [`watch-apple/`](watch-apple/), Swift + SwiftUI, generated with
[xcodegen](https://github.com/yonaskolb/XcodeGen) (`project.yml`); built in Xcode on macOS.

The raw upload format (GPS + int16 accelerometer chunks) is specified in
[`docs/data-format.md`](docs/data-format.md).

## Privacy

Pumpfoil is a community platform: by design, your sessions are visible to other users in the
community feed. What it will **never** do is sell your data or hand it to third parties for
advertising or tracking. This repository contains **source code only** — no user accounts,
recordings, databases or Garmin SDK files.

## License

Pumpfoil is free software, licensed under the **GNU Affero General Public License v3.0**
([AGPL-3.0](LICENSE)). In short: you may use, study, modify and redistribute it, but if you run a
modified version as a network service, you must make your source available to its users.

It is a community project — contributions are welcome.
