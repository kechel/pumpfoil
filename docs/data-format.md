# Roh-Upload-Datenformat (Uhr → Server)

Vertrag zwischen Watch-App (`watch/`) und Server (`server/app/api/ingest.py`).

## Prinzipien

- Die Uhr erzeugt eine **`session_uuid`** (clientseitig, stabil über Wiederholungen) → Uploads sind
  **idempotent** und **resumebar**: ein erneut gesendeter Chunk überschreibt denselben Index.
- GPS (~1 Hz) ist klein → **JSON**. Accel (~25 Hz) ist groß → **int16, base64-kodiert**.
- Jeder Chunk wird einzeln bestätigt (Ack). Erst nach Ack darf die Uhr den Chunk lokal verwerfen.

## Authentifizierung

Alle `ingest`-Endpoints erwarten Header `X-Device-Token: <token>`.
Der Token entsteht durch Einlösen eines **Pairing-Codes** (auf der Website generiert):

```
POST /api/devices/pair   { "code": "ABC123" }   →   { "device_token": "...", "user_id": ... }
```

Die Uhr speichert den Token dauerhaft in den App-Settings.

## Ablauf

### 1. Session anmelden
```
POST /api/ingest/session
X-Device-Token: <token>
{
  "session_uuid": "f1e2...-uuid",
  "started_at": "2026-06-20T09:00:00Z",   // ISO 8601 UTC
  "sport": "pumpfoil",
  "gps_hz": 1,
  "accel_hz": 25,
  "accel_scale": 2048      // int16-Wert pro 1 g  (raw = g * accel_scale)
}
→ 200 { "session_id": 42, "received_chunks": [0,1,2] }   // received_chunks für Resume
```

### 2. Chunks hochladen
```
POST /api/ingest/session/{session_uuid}/chunk
X-Device-Token: <token>
{
  "index": 0,
  "kind": "gps" | "accel",
  "encoding": "json" | "int16-b64",
  "t0_ms": 0,              // ms-Offset des ersten Samples relativ zu started_at
  "count": 750,           // Anzahl Samples in diesem Chunk
  "data": ...             // siehe unten
}
→ 200 { "ok": true, "index": 0 }
```

**GPS-Chunk** (`kind=gps`, `encoding=json`): `data` = Array von Samples, Reihenfolge fest:
```
[ [t_ms, lat, lon, speed_mps, hr_bpm, h_acc_m], ... ]
```
`hr_bpm` und `h_acc_m` dürfen `null` sein. `t_ms` ist Offset zu `started_at`.

**Accel-Chunk** (`kind=accel`, `encoding=int16-b64`): `data` = base64 eines **little-endian int16-Arrays**,
flach im Muster `[ax, ay, az, ax, ay, az, ...]`. Physikalisch: `g = raw / accel_scale`.
Sample-Zeit = `started_at + t0_ms + i * (1000 / accel_hz)`.

### 3. Session abschließen
```
POST /api/ingest/session/{session_uuid}/complete
X-Device-Token: <token>
{ "ended_at": "2026-06-20T10:00:00Z", "total_chunks": 130 }
→ 200 { "session_id": 42, "status": "complete", "analysis": "queued" }
```
Server prüft Vollständigkeit (alle Indizes 0..total_chunks-1 vorhanden), persistiert die Rohdaten
unveränderlich (`server/data/<session_uuid>/`) und stößt die Analyse an.

## Größen-Richtwert
1 h ≈ 3600 GPS-Samples (JSON, ~150 KB) + 90 000 Accel-Samples (int16 = 540 KB roh, base64 ~720 KB).
Chunkgröße so wählen, dass eine `makeWebRequest`-Payload klein bleibt (BLE-Limit) — z. B. 30 s
Accel/Chunk (750 Samples ≈ 6 KB base64) bzw. 60 s GPS/Chunk.
