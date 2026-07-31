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

## Sprachen (i18n)

Die Uhr-UI war komplett hartcodiert **deutsch**, obwohl der Server die Profil-Sprache längst
mitschickt (`GET /api/devices/config` → `language`, im `app-side` durchgelassen) — sie wurde in
`page/index.js` nur nie ausgewertet. Seit 1.0.4 gibt es dort ein **Wörterbuch im Code**
(`LANGS`/`S`/`t()`), gespeist aus genau dieser Profil-Sprache und in `@zos/storage` gecacht
(Key `lang`), damit der nächste App-Start auch offline/ungepairt richtig lokalisiert ist.

- **Spalten:** `de gsw de-AT en fr it es pt id ru nl fi cs ja zh` (15). Fallback pro String:
  Sprache → **en** → de. Reine Einheiten (`km/h`, `bpm`, `m`) bleiben unlokalisiert.
- **Wortlaut ist nicht neu erfunden**, sondern 1:1 aus den anderen Uhr-Apps übernommen:
  `watch/source/Strings.mc` (Hauptquelle, 13 Sprachen), `android/wear/…/I18n.kt` (ja/zh + Keys,
  die Garmin nicht hat), `web/src/i18n/locales/*.ts` (`f.dist`=`field.4`, `f.dur`=`sd.duration`,
  `rec.noData`=`watchStats.none`). Wo keine belegte Übersetzung existierte, ist die Spalte leer
  → Englisch (statt geraten).
- **Bewusst KEIN `@zos/i18n`/`.po`:** `getText()` lokalisiert nach **Geräte**-Sprache, wir wollen
  wie alle anderen Uhren die **Profil**-Sprache. Und ein fehlschlagender Modul-Import nimmt beim
  Laden die ganze App mit (derselbe Grund, warum im `app-side` kein `@zos/settings` steht) — ein
  Objekt-Literal kann nicht fehlschlagen. Die Beispiel-`.po`-Dateien unter `page/i18n/` bzw.
  `app-side/i18n/` sind **unbenutztes Template-Gerüst**.
- **Default ist Englisch**, nicht Deutsch: die App liegt international im Store, und die
  Geräte-Systemsprache ist ohne zusätzlichen `@zos`-Import nicht lesbar (Garmin/Wear weichen an
  dieser Stelle auf die Systemsprache aus, Zepp kann das nicht). Gepairte Uhren bekommen die
  Profil-Sprache beim ersten `CONFIG` und behalten sie.
- Offen: `setting/index.js` (Einstellungs-Seite **in der Zepp-Handy-App**) ist weiter deutsch —
  dort gibt es keine belegbare Sprachquelle (stateless, kein `@zos/settings`, kein Profil-Abruf).

## Echte Zepp-Aktivität aufzeichnen — geprüft, **nicht möglich** (Stand Zepp OS 3.x)

Wunsch (Nutzer-Anfrage): parallel zu unserer Rohdaten-Aufnahme eine **echte Zepp-Aktivität**
anlegen, damit die Session in der Zepp-App landet und von dort z. B. nach Strava fließt — so wie
es die Garmin-App macht (`watch/source/SessionRecorder.mc:800-830` legt eine FIT-Session
„Pumpfoil" an). Recherche in der offiziellen Doku (kein SDK auf der Build-VM):

| Kandidat | Befund |
|---|---|
| `@zos/sensor` **`Workout`** (API 3.0, Permission `data:user.hd.workout`) | **read-only**: `getStatus()`, `getHistory()`, `getUserHrZoneSettings()`, `getWorkoutTrackNavInfo()`. Kein Anlegen/Starten. |
| `app.json` **`appType`** | nur `"app"` (Mini Program) und `"watchface"`. Es gibt **keinen** Sport-/Workout-App-Typ, den man beantragen könnte. |
| **Workout Extension** (`data-widget`, Zepp OS **3.5+**) | Plug-in **innerhalb** der System-Workout-App: der Nutzer startet dort die Aktivität, die System-App besitzt den Datensatz — die Extension liefert nur zusätzliche Screens/Datenfelder. Eigene App-ID + eigenes Review, und nur auf T-Rex 3, Cheetah Pro, Cheetah (Round), Cheetah Square, T-Rex Ultra, Falcon (**Balance 2 nicht dabei**). |
| `@zos/app-access` **`getSportData()`** (API **3.6**) | *liest* Live-Werte der System-Sport-App, schreibt nichts. |
| `@zos/router` **`launchApp({ appId: SYSTEM_APP_SPORT, native: true })`** (API 3.0) | kann die System-Workout-App **starten** — dann ist unsere App aber nicht mehr im Vordergrund, unser 1-Hz-Sampler läuft nicht weiter. |

→ **Kein Code dafür geschrieben** (API-Namen zu erfinden wäre in einer Store-App das falsche
Risiko). Wenn es kommen soll, ist der einzige belegbare Weg eine **Architektur-Änderung**:
System-Workout-App im Vordergrund (sie erzeugt die echte Aktivität) + unser Recorder als
`app-service` (Background Service) für die Rohdaten — ungeprüft, ob ein Background Service
dauerhaft GPS halten darf. Zweite Option: **Workout Extension** als separate App (setzt 3.5+ und
die 6 Geräte oben voraus, Balance 2 müsste Amazfit erst nachziehen).

## TODO
- Accel (25 Hz) erfassen, falls Zepp OS eine API bietet → int16-base64-Chunks (Pump/Gleit).
- Offline-Queue liegt aktuell in `@zos/storage` (JSON). Für lange Sessions besser auf `@zos/fs`
  (Datei) umstellen — LocalStorage-Größe ist begrenzt.
- Diagnose-`console.log`/`logger.log` (PAIR_INIT/POST-Status/Upload) vor Release ausdünnen.

## Tastenbedienung (1.0.3, 2026-07-27)

Anlass: Nutzer-Meldung per Instagram — „Stoppen geht leider nur über wischen und nicht über eine taste. Das
funktioniert nicht wenn das display nass ist mit nassen Fingern." Beim Pumpfoilen ist nass der
Normalzustand, ein Touch-only-Recorder ist dort also unbenutzbar.

Seither ist die App **ohne jede Berührung** bedienbar (`onKey` aus `@zos/interaction`, API 2.0+; die
App verlangt ohnehin 3.0):

| Zustand | Taste kurz | Taste halten |
|---|---|---|
| Aufnahme | nächste Seite (mit Umlauf) | **stoppen & speichern** |
| Start-Screen | nächste Seite | **Aufnahme starten** (nur auf Seite 1) |
| Zusammenfassung | fertig | fertig |

Start/Stopp brauchen bewusst ein **Halten** — ein versehentlicher Druck in der Tasche soll nichts
auslösen, dieselbe Logik wie das 3-s-Halten auf der Garmin. `KEY_BACK` bleibt unangetastet, sonst
sitzt man in der App fest. Zepp erlaubt nur EINE `onKey`-Registrierung, deshalb ein Callback für alle
Tasten. Touch/Wischen funktioniert unverändert weiter.

**Auf Hardware ungetestet, bewusst so released (2026-07-27):** der Zepp-**Simulator hat keine
Hardware-Tasten**, der Tasten-Pfad ist dort also nicht prüfbar. Jan gibt 1.0.3 trotzdem in den Store;
**Der Melder testet nach der Freigabe** — er hat es angefragt und hat das Gerät. Deshalb ist der ganze
Callback in `try/catch` gekapselt: geht dort etwas schief, tut die Taste nichts, statt die laufende
Aufnahme mitzunehmen. Falls der Langdruck auf echter Hardware nicht als `KEY_EVENT_LONG_PRESS`
ankommt, ist der Umbau klein (Doppelklick oder `KEY_EVENT_PRESS`/`RELEASE` mit eigener Zeitmessung) —
dafür genügt, was im Log der Uhr ankommt.
Wer die Tasten VOR einem Release prüfen will: `zeus preview` läuft auf der echten Uhr, dort gibt es
sie.
