# Roadmap — Multi-Platform Support

Goal: support **all common sports watches**, and clearly document which watch
delivers which data so the user can decide (see the in-app `/uhren` page).

## Design principle: write the logic once

Everything that can be shared **is** shared, so a new watch is a thin add-on:

- **Analysis lives server-side** (`server/app/analysis`, `server/app/ml`). Pump/glide
  detection, foiling distance, records — none of it runs on the watch. Iterating the
  model never requires a watch recompile.
- **The web app is platform-agnostic** (`web/`). It only renders whatever the server
  computed; it does not care which device recorded the session.
- **Each watch app is a thin recorder**: capture sensors → buffer → upload a common
  payload. No analysis, no domain UI beyond live stats.
- **Two ingest contracts already exist and are platform-neutral:**
  - `POST /api/sessions/upload-fit` — a `.fit` file (or Garmin ZIP export).
  - `POST /api/ingest/...` — raw chunked GPS (1 Hz) + int16 accelerometer.
  A new platform implements *one* of these; the server does the rest.
- **Graceful degradation is built in.** The analyzer already classifies each session as
  `detection = model | gps_only | none`. Watches **without** raw accel (older Garmin,
  or any FIT/cloud import) still get GPS-based stats (distance, speed, foiling phases);
  only pump frequency & glide phases require raw accel. So "support older Garmin without
  accel" needs no server work — only a watch build with a lower API floor that skips the
  accel logger when unavailable.

## Capability matrix (summary)

| Platform | GPS/distance/speed | Heart rate | Pumps & glide (raw accel) | Path |
|----------|:---:|:---:|:---:|------|
| Garmin (Connect IQ) | ✓ | ✓ | ✓ | native recorder (done) |
| Garmin (older, no accel) | ✓ | ✓ | – | recorder w/ accel optional |
| Apple Watch | ✓ | ✓ | ✓ | native recorder |
| Wear OS | ✓ | ✓ | ✓ | native recorder |
| Amazfit / Zepp OS | ✓ | ✓ | ~ | native recorder (model-dependent) |
| Polar | ✓ | ✓ | ~ | FIT/cloud import (+ BLE sensor for accel) |
| Suunto | ✓ | ✓ | – | FIT/cloud import |
| COROS | ✓ | ✓ | – | cloud import |
| Fitbit | – | – | – | discontinued |

## Phases

1. **Garmin recorder + web + server** — *done.*
2. **GPS-only Garmin build** — lower the manifest API floor, make the accel `SensorLogger`
   optional; old watches upload GPS only → `gps_only` analysis. *(Watch-side only.)*
3. **Apple Watch recorder** — Core Motion (raw accel) + Core Location + Workout API →
   upload via the raw-ingest contract.
4. **Wear OS recorder** — `SensorManager` (raw accel) + Health Services + FusedLocation →
   same contract.
5. **Cloud/FIT connectors** — Polar AccessLink, Suunto/COROS APIs → import GPS-based
   sessions for brands without an on-watch app.
6. **Amazfit / Zepp OS** — JS recorder where the sensor API allows.

## Tooling / where to download per platform

| Platform | What to install | Where | Cost | Notes |
|----------|-----------------|-------|------|-------|
| **Garmin** | Connect IQ SDK (SDK Manager) + VS Code *Monkey C* extension | developer.garmin.com/connect-iq/sdk | free | dev key generated locally (`watch/setup-sdk.sh`) |
| **Apple Watch** | **Xcode** | Mac App Store (macOS only) | free | Swift/SwiftUI, Core Motion, HealthKit — no extra SDK |
| | Apple Developer Program | developer.apple.com/programs | $99/yr | needed to run on a real watch + distribute |
| **Wear OS** | **Android Studio** (incl. Wear OS SDK + emulator) | developer.android.com/studio | free | Win/macOS/Linux; Health Services via Gradle |
| | Google Play Console | play.google.com/console | $25 once | distribution |
| **Amazfit / Zepp OS** | Zeus CLI (npm) + Zepp OS Simulator | docs.zepp.com (developer docs) | free | JS apps; needs Zepp phone app as bridge |
| **Polar** | Polar BLE SDK (raw accel via BLE) | github.com/polarofficial/polar-ble-sdk | free | + AccessLink cloud API: admin.polaraccesslink.com |
| **Suunto** | SuuntoPlus / API (partner) | apizone.suunto.com | free | limited on-watch SDK; mainly cloud data |
| **COROS** | COROS Open/Training API (partner) | coros.com (developer/partner) | free | cloud only, apply for access |

**Realistic next downloads:** for native pump-capable apps you only need
**Xcode** (Apple Watch) and **Android Studio** (Wear OS). The rest (Polar/Suunto/COROS)
are cloud-API registrations, not SDK installs.
