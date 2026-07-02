# Pumpfoil — Zepp OS (Amazfit) Recorder

Dünner Recorder für Amazfit-Uhren (Zepp OS 3.0), analog zu Garmin/Apple/Wear: nimmt auf,
puffert, lädt über die Zepp-Handy-App zu **pumpfoil.org** hoch. Server macht die Analyse.

**Pairing (reverse, wie alle Uhren):** die Uhr-App zeigt beim ersten Start einen Code →
auf pumpfoil.org → Konto → „Uhr verbinden" eintragen → die Uhr pollt und wird verbunden.

**Stand: v0 — GPS + Puls (untested draft).** Roher 25-Hz-Accel (für Pump/Gleit) ist bei Zepp OS
für Dritt-Apps nicht gesichert verfügbar → vorerst GPS-only ⇒ Server `detection = gps_only`
(Distanz/Speed/Läufe, **noch keine Pumps**). Accel nachrüsten, sobald die API bestätigt ist.

## Ablauf (wie Garmin: Aufnahme primär, Verbindung/Upload im Hintergrund)
- **GPS läuft ab dem Ruhe-Screen** (durchgehender 1-Hz-Sampler) → Status „GPS suche… / GPS ●" vor
  dem Start; Puls parallel.
- **Auto-Start** (wenn `autoStart` in der Config): ab ~7 km/h über einige Samples startet die
  Aufnahme selbst. Manuell per START jederzeit.
- **Pairing im Hintergrund** (reverse): PAIR_INIT holt einen Code, Poll läuft nebenher; die Aufnahme
  ist **nie blockiert** — auch unverbunden aufnehmbar. Code wird im Ruhe-Screen angezeigt.
- **Nach Stopp**: Session wird **persistent gepuffert** (`@zos/storage`, Queue-Key `pending`), dann
  Upload **falls verbunden**; sonst „Upload später" + **automatischer Nachhol-Upload** beim nächsten
  App-Start/Verbindung (`flushPending`). Requests via `this.request` mit Retry (`call()`), der
  verschluckte Antworten (Worker nach Spawn noch nicht bereit) erneut sendet.

## Aufbau (auf dem „Fetch Api"-Template, `@zeppos/zml`)
- `page/index.js` — State-Machine (Ruhe/Aufnahme), Rendering der **konfigurierten Datenfelder**
  (`views` = wischbare Seiten, `offFoilView` = Ruhe; Feld-IDs wie web/`fields.ts`/Garmin), Sampling,
  Auto-Start, Offline-Queue. Titel antippen: in Aufnahme = Seite wechseln, in Ruhe = neuer Code
  (unverbunden) bzw. jetzt nachschicken (verbunden).
- `page/index.[r|s].layout.js` — Widget-Geometrie rund/eckig.
- `app-side/index.js` — App-Side-Service (Handy): `onRequest` → `fetch`. **Reverse-Pairing** wie
  bei allen Uhren: `PAIR_INIT` (`POST /api/devices/pair-init` → `{code, claim_token}`), `PAIR_POLL`
  (`GET /api/devices/pair-poll?claim_token=…` → `device_token`, sobald der Nutzer den Code im Web
  eingelöst hat), dann Ingest-Upload (start/chunk/complete) mit `X-Device-Token`.
- `setting/index.js` — App-Settings: nur Verbindungsstatus + „Trennen". **Keine** Code-Eingabe —
  der Code wird auf der Uhr angezeigt und im Web eingetragen (es gibt keine Web-„Code-erzeugen"-UI).
- `app.json` — target `common` (rund 480 / eckig 390), Permissions GPS + Puls + local_storage.

Ingest-Vertrag: `docs/ingest-contract.md` (Path A: start → chunks[gps json] → complete).

## Bauen / Testen (auf Jans Rechner — hier nicht baubar)
```bash
cd watch-zepp
zeus dev            # Simulator (Balance 2), Live-Reload
# Der Simulator speist KEIN GPS ein -> page/index.js hat DEV_FAKE_GPS=true (synthetische Spur),
# damit Aufnahme+Upload testbar sind. Vor echter Uhr/Release auf false setzen!
zeus preview        # QR für echte Uhr (Zepp-App)
# WICHTIG (Simulator): nach jedem Code-Change/`git pull` den Simulator KOMPLETT neu starten
# (zeus dev beenden + Fenster schließen + neu). Hot-Reload spawnt den App-Side-Worker NICHT neu
# -> sonst 'shake timeout' bei allen Requests. Worker lebt, sobald im JS-Log `[pumpfoil] app-side
# onInit` steht. (Auf echter Uhr/echtem Handy kein Thema — dort spawnt der Worker beim App-Start.)
```

## Noch im Simulator zu verifizieren (blind portiert)
1. `@zos/sensor` **Geolocation** (`getStatus`/`getLatitude`/`getLongitude`/`getSpeed`) + **HeartRate**
   (`getCurrent`) — Methodennamen/Verhalten auf Balance 2.
2. `@zos/storage` **LocalStorage** auf der Uhr (Token/Claim persistieren) — App-Side ist stateless
   und bekommt Token/Claim pro Request mitgeschickt (`@zos/settings` ist im App-Side NICHT auflösbar).
3. `fetch`-Response-Shape (`response.status`, `response.body` String vs. JSON).
4. Pairing-Flow: Code auf der Uhr sichtbar → auf pumpfoil.org/Konto eintragen → Uhr pollt → „verbunden ✓".

## TODO
- Accel (25 Hz) erfassen, falls Zepp OS eine API bietet → int16-base64-Chunks (Pump/Gleit).
- Offline-Queue liegt aktuell in `@zos/storage` (JSON). Für lange Sessions besser auf `@zos/fs`
  (Datei) umstellen — LocalStorage-Größe ist begrenzt.
- Diagnose-`console.log`/`logger.log` (PAIR_INIT/POST-Status/Upload) vor Release ausdünnen.
