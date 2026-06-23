<div align="center">

# 🌊 Pumpfoil

**Record and analyze pump foiling sessions from a Garmin watch — GPS track, foiling distance, pump cadence and glide phases.**

[pumpfoil.org](https://pumpfoil.org) · License: [AGPL-3.0](#license)

</div>

---

Pump foiling means riding a hydrofoil with no wind, waves or motor — you stay up purely by
pumping the board rhythmically. Pumpfoil records these sessions with a Garmin watch and turns the
raw GPS + accelerometer data into a detailed analysis: how long you were actually foiling, how
efficiently you pumped, and where you rode.

The signature feature: your track is **colored exactly over the foiling phases** (by speed, heart
rate or pump cadence) with **every detected pump stroke marked right on the route**.

<div align="center">
  <img src="web/public/landing-track.webp" alt="A pump foiling session: the foiling track colored by speed, individual pumps marked as white dots" width="640">
</div>

## Features

- ⌚ **Garmin recording** — a Connect IQ watch app captures GPS and raw acceleration and uploads it.
- 📈 **Automatic analysis** — foiling phases, distance, pump cadence and glide phases per session.
- 🗺️ **Color-coded track** — foiling segments colored by speed / heart rate / pump frequency, with pump markers.
- 📂 **FIT upload** — analyze old activities too: drop in a `.fit` file (or Garmin's ZIP export).
- 🏷️ **Labeling UI** — mark pump / glide / not-foiling ranges to build training data for the ML model.
- 🌍 **Community & history** — compare sessions over time, share runs; UI in 7 languages.

## Architecture

| Directory | Stack | Purpose |
|-----------|-------|---------|
| [`watch/`](watch/) | Monkey C (Connect IQ) | Watch app: records GPS + raw accelerometer, uploads raw data |
| [`server/`](server/) | Python · FastAPI · PostgreSQL · numpy/scipy/scikit-learn | Ingest, immutable raw storage, foiling/pump detection, REST API |
| [`web/`](web/) | React · Vite · TypeScript · Tailwind · Leaflet | SPA: sessions, map, charts, labeling, community |
| [`deploy/`](deploy/) | systemd · Apache | Service unit, reverse-proxy config, backup timers |

Raw session data is always stored **complete and unmodified**, so any future detection model can be
re-run on old sessions. Detection runs server-side (fast iteration in Python, no watch recompile).

## Development

**Server**

```bash
cd server
python3 -m venv .venv && . .venv/bin/activate
pip install -e .
cp .env.example .env          # dev defaults to SQLite — no Postgres required
uvicorn app.main:app --reload --port 8090
# API docs: http://localhost:8090/api/docs
```

**Web**

```bash
cd web
npm install
npm run dev                   # Vite dev server, proxies /api to :8090
```

**Watch** — requires the [Garmin Connect IQ SDK](https://developer.garmin.com/connect-iq/) and a
developer key (see `watch/setup-sdk.sh`). The SDK itself is **not** included in this repo (it is
distributed by Garmin under its own license). Build with `watch/build.sh`.

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
