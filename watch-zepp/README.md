# Pumpfoil — Zepp OS (Amazfit) Recorder

Dünner Recorder für Amazfit-Uhren (Zepp OS 3.0), analog zu Garmin/Apple/Wear: nimmt auf,
puffert, lädt über die Zepp-Handy-App zu **pumpfoil.org** hoch. Server macht die Analyse.

**Stand: v0 — GPS + Puls (untested draft).** Roher 25-Hz-Accel (für Pump/Gleit) ist bei Zepp OS
für Dritt-Apps nicht gesichert verfügbar → vorerst GPS-only ⇒ Server `detection = gps_only`
(Distanz/Speed/Läufe, **noch keine Pumps**). Accel nachrüsten, sobald die API bestätigt ist.

## Aufbau (auf dem „Fetch Api"-Template, `@zeppos/zml`)
- `page/index.js` — Uhr-UI + Aufnahme: GPS (1 Hz) + Puls, Puffer im RAM, START/STOPP, Live-Speed/
  Dauer/HR. Beim Stopp `this.request({method:"START"|"CHUNK"|"COMPLETE", …})` an den App-Side.
- `page/index.[r|s].layout.js` — Widget-Geometrie rund/eckig.
- `app-side/index.js` — App-Side-Service (Handy): `onRequest` → `fetch` zu den Ingest-Endpoints
  mit `X-Device-Token`. Löst den Pairing-Code (`POST /api/devices/pair`) beim ersten Upload ein.
- `setting/index.js` — App-Settings: Pairing-Code eingeben (aus pumpfoil.org/Konto). Speichert
  `pairCode` → App-Side tauscht ihn gegen ein `deviceToken`.
- `app.json` — target `common` (rund 480 / eckig 390), Permissions GPS + Puls + local_storage.

Ingest-Vertrag: `docs/ingest-contract.md` (Path A: start → chunks[gps json] → complete).

## Bauen / Testen (auf Jans Rechner — hier nicht baubar)
```bash
cd watch-zepp
zeus dev            # Simulator (Balance 2), Live-Reload
# GPS im Simulator über den "Sensor"-Tab einspeisen -> Aufnahme testen
zeus preview        # QR für echte Uhr (Zepp-App)
```

## Noch im Simulator zu verifizieren (blind portiert)
1. `@zos/sensor` **Geolocation** (`getStatus`/`getLatitude`/`getLongitude`/`getSpeed`) + **HeartRate**
   (`getCurrent`) — Methodennamen/Verhalten auf Balance 2.
2. `settingsLib.getItem/setItem` im **App-Side** (Token/Code lesen/schreiben) — ggf. anderer
   Settings-Zugriff nötig.
3. `fetch`-Response-Shape (`response.status`, `response.body` String vs. JSON).
4. Settings-Widget-API (`View/Text/TextInput/Button`, Prop-Namen).

## TODO
- Accel (25 Hz) erfassen, falls Zepp OS eine API bietet → int16-base64-Chunks (Pump/Gleit).
- Aufnahme auf Datei puffern (`@zos/fs`) statt RAM (lange Sessions) + Resume.
- Auto-Reconnect/Retry beim Upload; „N warten auf Upload"-Anzeige.
