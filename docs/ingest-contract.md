# Raw ingest contract

Any watch platform becomes a Pumpfoil recorder by implementing **one** of two upload
paths. The server does all analysis — the watch only records and uploads.

- **Path A — raw chunks** (full capability incl. pumps/glide): this document.
- **Path B — FIT/ZIP** (`POST /api/sessions/upload-fit`, multipart `file`): for platforms
  that only export FIT; gives GPS-based stats (`detection = gps_only`), no pump frequency.

All endpoints are under `BASE_URL` (e.g. `https://pumpfoil.org`).

## Auth

Raw-ingest requests authenticate with a **device token** in a header:

```
X-Device-Token: <token>
```

The token is obtained once via a pairing code: the user generates a code in the web app
(Account page) and the watch redeems it (endpoint in `server/app/api/devices.py`). Store the
token on the device and reuse it for every upload.

## Flow

1. **Start** `POST /api/ingest/session`
   ```json
   {
     "session_uuid": "string [A-Za-z0-9_-]{1,80}",
     "started_at": "2026-06-23T08:00:00Z",
     "sport": "pumpfoil",
     "gps_hz": 1,
     "accel_hz": 25,
     "accel_scale": 2048
   }
   ```
   → `{ "session_id": int, "received_chunks": [int, …] }`
   Idempotent: re-starting the same `session_uuid` returns which chunk indices already
   arrived (resume support). Same UUID must belong to the same user.

2. **Upload chunks** `POST /api/ingest/session/{session_uuid}/chunk` (repeat)
   ```json
   {
     "index": 0,
     "kind": "gps" | "accel",
     "encoding": "json" | "int16-b64",
     "t0_ms": 0,
     "count": 0,
     "data": <list | base64-string>
   }
   ```
   → `{ "ok": true, "index": int }`. Re-uploading an index overwrites it (safe retry).

3. **(optional) Live analyze** `POST /api/ingest/session/{session_uuid}/analyze`
   Re-runs analysis on what arrived so far, without finishing — for live sync.

4. **Complete** `POST /api/ingest/session/{session_uuid}/complete`
   ```json
   { "ended_at": "2026-06-23T08:42:00Z", "total_chunks": 12 }
   ```
   Triggers final analysis (and auto-trim of trailing drive-home, etc.).

## Payload formats

### GPS chunk (`kind: "gps"`, `encoding: "json"`)

`data` is a JSON array of samples; **each sample is a 6-element array, in this order**:

```
[ t_ms, lat, lon, speed_mps, hr, h_accuracy ]
```

- `t_ms` — int, milliseconds **since `started_at`** (elapsed, not epoch)
- `lat`, `lon` — float degrees (WGS84)
- `speed_mps` — float, GPS Doppler speed in m/s (`0.0` if unknown)
- `hr` — int heart rate in bpm (`0`/`null` if none)
- `h_accuracy` — horizontal accuracy indicator (lower = better; pass the platform's value)

Recommended rate 1 Hz, ~60 samples per chunk.

### Accel chunk (`kind: "accel"`, `encoding: "int16-b64"`)

`data` is **base64** of a little-endian `int16` buffer, samples interleaved **x, y, z**:

```
[x0,y0,z0, x1,y1,z1, …]   (little-endian int16 each)
```

- Convert raw to g by dividing by `accel_scale` (default `2048` → value `2048` = 1 g).
- Rate target `accel_hz` (25 Hz). Magnitude is what matters (orientation-invariant), so exact
  axis alignment is not critical — but keep x/y/z consistent.
- Buffer to disk during recording (90k samples/h); upload in chunks; delete a chunk after the
  server acks it. Uploads may happen any time after the session (token + buffer persist).

## Platform notes

- **Apple Watch** — `CMMotionManager` (deviceMotion/accelerometer up to ~100 Hz; downsample to
  25), `CLLocationManager` for GPS, `HKWorkoutSession` to keep sensors alive in background.
  Pack int16 + base64, POST via `URLSession`.
- **Wear OS** — `SensorManager` `TYPE_ACCELEROMETER` (or `TYPE_LINEAR_ACCELERATION`), Health
  Services for HR, FusedLocationProvider for GPS; foreground service to keep recording.
- **Older Garmin / FIT-only devices** — skip the accel path entirely and use **Path B**
  (FIT upload). The server falls back to `detection = gps_only`.

## Import bestehender Dateien: wie viel Defekt vertragen wird

Der zweite Weg (fertige FIT/TCX/GPX-Datei statt Roh-Chunks) trifft auf Dateien, die andere
geschrieben haben — und die halten sich nicht immer an die Norm. Stand 06.09.2026 gilt:

**Gelesen wird, was lesbar ist.** `fitimport.parse_fit_bytes` sammelt die Nachrichten der Reihe
nach ein und behält, was bis zum Abbruch da war. Eine FIT-Datei wird von vorn nach hinten
gelesen, die Trackpunkte stehen der Reihe nach drin — bricht das Lesen bei 60 % ab, sind die
ersten 60 % der Fahrt trotzdem vollständig vorhanden. Vorher lag die ganze Schleife in *einem*
`try/except`: ein Fehler am Dateiende hat auch den Anfang weggeworfen.

An einer echten COROS-Datei durchgemessen (107 Punkte im Original):

| Defekt | vorher | jetzt |
|---|---|---|
| Datei-Prüfsumme falsch | abgelehnt | 107 Punkte |
| Datei-Prüfsumme = 0 | abgelehnt | 107 Punkte |
| Kopf-Prüfsumme falsch | abgelehnt | 107 Punkte |
| `data_size` im Kopf zu klein | abgelehnt | 107 Punkte |
| Null-Bytes hinter dem Dateiende | abgelehnt | 107 Punkte |
| bei 60 % abgeschnitten (leerer Akku) | abgelehnt | **65 Punkte** |
| Feld schmaler deklariert als sein Typ | abgelehnt | 107 Punkte, Feld leer |

Zwei Entscheidungen dahinter, die man kennen sollte:

- **Die Prüfsumme entscheidet nicht mehr allein.** Sie sagt „an dieser Datei hat sich etwas
  verändert", nicht „die Messwerte sind unbrauchbar" — und etliche Schreiber setzen sie schlicht
  falsch oder auf 0. Erst wird streng geprüft; scheitert das, wird ohne Prüfung gelesen.
  Unplausible Punkte fischt die Analyse ohnehin heraus.
- **Ein zu schmal deklariertes Feld wird geleert, nicht geraten.** Aus 1 Byte lässt sich kein
  `uint32` rekonstruieren. Bei `timestamp` würde ein geratener Wert eine ganze Session unbemerkt
  auf die falsche Uhrzeit legen — lieber ein leeres Feld.

War die Datei nur teilweise lesbar, steht das in `parsed["abbruch"]` und landet als Warnung im
Log (`Import <quelle> (user N): Datei nur teilweise lesbar, M Punkte uebernommen`).

**Was trotzdem scheitert, wird aufgehoben.** `storage.quarantaene_ablegen` legt die Bytes unter
`server/data/_nicht-lesbar/<hash>.bin` ab, samt Beipackzettel (Quelle, Nutzer, Grund). Grund:
`save_original_upload` läuft erst *nach* erfolgreichem Parsen — eine gescheiterte Datei war
vorher restlos weg, und jede Rettung hing daran, dass der Nutzer neu synchronisiert und der
Anbieter erreichbar ist. Beides war am 06.09. nicht gegeben (COROS antwortete stundenlang mit
504). Nach jeder Verbesserung am Parser:

```
cd server && .venv/bin/python ../scripts/quarantaene-nachholen.py
```

Trockenlauf per Vorgabe; `--schreiben` importiert die inzwischen lesbaren Dateien für den
Nutzer, dem sie gehören, und räumt sie weg.
