# TODO & Ideen

**Einzige Quelle für offene Arbeit.** Gegen die Git-Historie abgeglichen (Stand 2026-07-13).
Erledigtes steht nicht mehr hier. Neue spontane TODOs unten unter „📥 Inbox" anhängen.

> Ersetzt die frühere `docs/IDEAS.md`-Inbox. Reine Produktideen weiter unten unter „💡 Backlog".

---

## 🚀 Nächstes App-Release — seit Release 2026-07-15 (Android 1.1.12 live / iOS 1.1.13 in Prüfung)
Was seit dem letzten Release in PWA/Server dazukam und in die Apps gehört (Repo: Android 1.1.12/28,
iOS 1.1.14/18 — vor Golive bumpen: Phone → 1.1.13/29, iOS → 1.1.15/19):
- [x] **Öffentliche Session-Teilen-Links** — Server (`share_token`, `POST/DELETE /api/sessions/{id}/share`,
  `GET /api/public/session/{token}`) + PWA (`/s/:token` read-only mit eigener Hülle, Owner-Link-Popup
  mit Kopieren/Deaktivieren, freundliche 404+Redirect). **App-Port erledigt** (2026-07-15): Teilen-Link-
  Button (🔗) + Popup in iOS `SessionDetailView` + Android `SessionDetailScreen` (Kopieren via
  Clipboard/UIPasteboard, Deaktivieren). Die geteilten Links selbst öffnen im Browser auf pumpfoil.org
  (keine native Read-only-Anzeige nötig).
- [x] **Feature-Port-Runde 2026-07-18** (Android + iOS, kompiliert bzw. parse-geprüft): mehrere
  Videos pro Session (Anzeige+Verlinken+Löschen, NEU auch als Feature: Apps konnten bisher gar keine
  Videos verlinken); „Alle löschen" für Aussortierte (Confirm, `DELETE /api/sessions/other/all`);
  Teilen-Dialog #36 stats=none + #37 Lauf-Vorauswahl; Foil-/Uhren-Stats sortierbar (Chips) +
  Cross-Link zur jeweils anderen Statistik; Karten-Maßstabsleiste (#15); Social-Links
  (YouTube/Instagram/TikTok) im Profil. Web-only übersprungen: Hotkeys, Chat-Drag, Scroll-FAB,
  Admin-Verlaufsgrafik, Testimonial-Archiv, Store-Badges.
- **`appmeta ios` → 1.1.13** setzen, sobald Apple 1.1.13 freigibt (Server `api/appmeta.py`, aktuell 1.1.12).

## 🩹 Polish / kleine Baustellen
- **Verlauf-Karte abhärten:** osmdroid-Spot-Animation in der Scroll-Liste → am Emulator ANR bei
  schnellem Scrollen (echte Geräte ok). Idee: Karte erst auf Tap initialisieren statt beim Scrollen.
- **Sub-Screen-Header cyan:** Uhr/Datenseiten/Verknüpfte-Konten nutzen Material-`TopAppBar` (nicht
  cyan) — nur die 7 Haupt-Tabs haben die Marken-Leiste.
- **Off-Foil-Screen (nativ):** nur die 3 Feld-Selektoren, ohne den runden Uhr-Preview-Mock der PWA.
- **Update-Hinweis für ungepairte Alt-Uhr-Apps** (Henne-Ei): der Web-Update-Banner hängt am
  gepairten Gerät; eine noch nie gepairte Alt-App sieht keinen Hinweis. Generischen Store-Update-
  Hinweis erwägen. (war `todo-update-hint-unpaired`)
- **Garmin CIQ-Store-Listing** von „Pump Foil" auf „Pumpfoil" umbenennen (Portal; App-Code ist
  längst „Pumpfoil"). Sport bleibt generisch „Pump-Foiling".
- **Muttersprachler-Review** der Übersetzungen fr/it/es/fi (best-effort erzeugt).

## 🔌 Integrationen (credential-gated / extern)
- **COROS** — Workout-Push-Import gebaut + live, aber credential-gated; aktiv erst nach Freigabe.
- **Amazfit/Zepp** — Recorder v0 (`watch-zepp/`) ungetestet; Build/Verify nur auf Jans Mac.
- **Polar nativer BLE-Recorder — ZURÜCKGESTELLT (2026-07-15).** Kein On-Watch-App-Store bei Polar →
  Roh-Accel nur via Handy-BLE-SDK (Offline-Recording: Handy startet + holt ab → viel Reibung). Nutzen
  ggü. dem live AccessLink-Import = nur Pumps, bei hohem Aufwand/Hardware-Unsicherheit. Erst wieder,
  wenn Polar-Nutzer konkret nach Pumps fragen. Beta-Gerüst bleibt versteckt. Details: Memory `polar-recorder-plan`.
- (Suunto ✅ live, Polar ✅ AccessLink live, Garmin-FIT-Import wartet auf Garmins Formular.)

## 💡 Backlog (Produktideen — bewusst später)
- **Komplettes Setup statt nur Front-Foil** (Feedback Tom Petr 2026-07-20): zusätzlich zur Foil-Liste
  auch Stabilizer/Rear-Wing, Fuselage/Tail-Größe, Shim erfassen — oder Freitext-Setup-Beschreibung je
  Session. „Macht großen Unterschied, inspiriert andere Foiler." (Erweiterung Foil-/Session-Modell.)
- **Garmin-Datenseiten-UX aufräumen** (Feedback Tom 2026-07-20): Screen-Konfiguration verwirrend
  („weiß nicht wo ich bin"; Hinzufügen ersetzte den On-Foil-Screen durch 1/2/3), Feldbezeichnungen
  unklar (was heißt welcher Wert) — FoilMotion sei übersichtlicher. On-Watch/Web-Konfig-UX überdenken.
- **Session pausieren (Garmin)** (Feedback Tom 2026-07-20) — Aufnahme pausieren/fortsetzen können.
- **Chat: Like/👍 für Beiträge** (Feedback Tom 2026-07-20) — Daumen-hoch auf Chat-Nachrichten.
- **Pumps/min über die Web-Detail hinaus** (Feedback Tom + Laurent) — Toggle Hz↔Pumps/min gibt's jetzt
  in der Web-Session-Detail; ggf. auch in Apps/Listen/Community anbieten. (Web-Detail erledigt 2026-07-20.)
- **Upload-Speed Garmin→pumpfoil.org** (Feedback Tom 2026-07-20): dauert „ewig" vs. Garmin-Sync —
  Chunk-Upload-Durchsatz/Parallelität prüfen. (R&D; BLE-Limit beachten.)
- **Pump-Kadenz auch in Pumps/Minute** (Feedback Laurent 2026-07-20) — zusätzlich zur Hz-Anzeige
  (×60). Kleine Anzeige-Ergänzung (Web/Apps/Nerd-Seiten); `avg_cadence_hz` liegt vor.
- **Start-Erfolgsquote** (Feedback Laurent, FoilMotion-inspiriert) — % erfolgreiche Starts vs.
  Gesamt-Startversuche. Braucht Startversuch-Erkennung (verwandt mit Paddle-Up-/Attempts-Erkennung).
  R&D/Detektor → Jans OK.
- **Rechts-/Links-Turns zählen** (Feedback Laurent, FoilMotion-inspiriert) — aus GPS-Kurs (evtl.
  Gyro, sofern via FIT verfügbar). R&D/Detektor → Jans OK.
- **„Wer foilt jetzt gerade?"** — laufende Sessions live (braucht Live-Upload während der Session +
  Privacy-Opt-in). Groß.
- **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck, Übersetzungen cachen).
- **Foil je *Lauf*** (per-Run-Foil + per-Run-Watt) — braucht Lauf-Foil-/Labeling-Ablage.
- **Foil-DB um weitere Marken erweitern** — Infrastruktur da (`thickness_estimated`, idempotenter
  Seed), nur Daten ergänzen.
- ⏸ **Video direkt in der App aufnehmen** + self-hosten — zurückgestellt (YouTube-Link reicht;
  Transkodierung/Storage/Moderation = XL).
- **Paddle-Up-Support** (Idee 2026-07-19, Anlass: FoilMotion-FIT von Markus, Illmensee): Paddle-Up =
  Pumpfoilen, aber Startgeschwindigkeit wird liegend/kniend mit Paddel im Wasser aufgebaut (statt
  Absprung). Die **Startsequenz ist krasses, sehr charakteristisches Paddeln** → gut erkennbar; als
  eigenen Phasentyp erkennen: **Strokes bis zum Abheben zählen, Abhebe-Geschwindigkeit**, Zeit/Strokes
  bis on-foil. **Ab on-foil greift unser jetziges Pump-Modell** (nur die Start-/Anpaddel-Phase braucht
  eigene Logik). Detektor-/Modell-Arbeit → Jans OK; nicht jetzt.

- **„Pumpen für einen guten Zweck" — Sponsoren-Aktionen** (Idee 2026-07-19): lokale Firmen sponsern
  pro Pump an einem nahegelegenen Spot/See einen Betrag (z. B. 1 Cent/Pump) für einen selbstgewählten
  Zweck. Zeitlich begrenzte Aktionen mit eigener Landingpage/Werbung je Kampagne. Sponsoren
  **registrieren sich selbst** und tragen ein: Zeitraum, Geld pro Pump, Spot(s), Zweck. Banner
  selbst hochladen **oder** generieren lassen (KI-Aufruf) **oder** von uns vorgeschlagene Bilder
  verwenden. Beispiele: „Pumpen für Afrika", „Pumpen für den neuen Spielplatz im Kindergarten in
  Hintertupfingen". Groß (Self-Service-Portal + Kampagnen-Modell + Pump-Zählung je Spot/Zeitraum +
  Landingpages + Banner-Generierung + ggf. Zahlungs-/Nachweis-Fluss). Nur Idee, nicht umsetzen.
  - **Missbrauchsschutz (Kern der Zählbarkeit):** nur Pumps zählen, die **direkt mit einer unserer
    nativen Apps aufgezeichnet UND übertragen** wurden (kein FIT-/Fremd-Import, keine reinen
    GPS-only-Sessions) und **echte Accel-Daten** haben (Pump-Erkennung aus Beschleunigung, nicht
    schätzbar/fälschbar). Ggf. weitere Measures nötig: geräte-/session-gebundene Herkunft (Device-Token),
    Plausibilitäts-/Physik-Gates (wie beim Unecht-Verdacht), Rate-/Dedup-Schutz, evtl. Spot-Geofence
    (Pump muss am gesponserten Spot passiert sein). Sponsor-Geld hängt an gezählten Pumps → Zählung
    muss manipulationssicher sein.

## 🔬 R&D
- **Phone-Placement-Modell (Vergleich, unkritisch):** Erste echte Phone-Session (#646, Jeroen,
  Samsung A55) läuft mit dem Wrist-Modell einwandfrei (detection=model, 508 Pumps @ 1,5 Hz,
  plausibel; Accel effektiv 125 Hz statt getaggter 50 — Ratenerkennung fängt das). Eigenes
  Modell je `placement=phone` erst **zum Vergleich trainieren, wenn 10+ Handy-Sessions von
  unterschiedlichen Fahrern** da sind (2026-07-19, Jans Einschätzung). Nebenbeobachtung:
  Android-Recorder könnte on-device auf Zielrate resampeln (2,5× Upload-Volumen).
- **Board-/Foil-IMU → echte Pump-Technik-Analytik.** Wrist-GPS reicht nicht (Null-Test bestanden nicht);
  Jan sammelt 2-Uhren-Daten (Fußgelenk/Board/Foil, 25-Hz-Accel). Auswertung serverseitig, sobald
  Session-IDs + Uhr-Positionen vorliegen. Später evtl. 6-Achsen-Gyro-Logger am Mast. (Details:
  Memory `board-imu-experiment`, `docs/nerd`-Seiten.)
- **Pump-Zähler kalibrieren** (unter-erkennt ~2× lt. Label-App-Wahrheit) — Jans OK offen; physisch
  erst via X5-Rig. (Memory `pump-groundtruth`.)

## 🗒️ Doku-Hygiene
- **`docs/PARITY-AUDIT.md` ist veraltet** (Stand 2026-06-28): listet viele ❌ für Android/iOS (Home,
  Farb-Modi, Datenseiten, Community, Chat, Compare …), die inzwischen alle gebaut sind. Neu aufnehmen
  oder entfernen.

---

## 📥 Inbox (spontane TODOs — hier anhängen, später einsortieren)
- **Max-Speed: GPS-Ausreißer killen, 3-s-Max zeigen** (Feedback Tom Petr 2026-07-20, DECKT SICH mit
  #367-Befund + Laurent): rohe GPS-Max-Speed zeigt Fantasiewerte (Tom: 102 km/h; Community-Rekord
  „31,8 km/h auf Gong Sirius XXL" unrealistisch). Statt Roh-Max den **geglätteten 3-s-Max** als
  Speed-Rekord nehmen (Uhr zeigt schon 3-s; Auswertung/Community-Records nach) + Positions-Ausreißer-
  Filter beim Analysieren. Detektor/Analyse → Jans OK + Regression. **Wichtig, mehrfach gemeldet.**
- **Android: Stats pro Lauf + Foil in Community** (Feedback Tom 2026-07-20): (a) in der Session-Detail
  der App zeigt „einen Lauf auswählen" weiter die Gesamt-Stats (kein Puls/Kadenz je Lauf) — Web kann's,
  App nicht → Parität. (b) In der Community-Liste der App fehlt das benutzte Foil (Web zeigt es). Beides
  Android(/iOS)-Port.
- **Uhr-Sprache: Geräte-Systemsprache als Default** (Feedback Laurent, 2026-07-20): Uhr-UI teils
  DE trotz englischer Erwartung. Befund: `watch/source/Strings.mc` ist vollständig EN (alle 60 Keys
  haben echten EN-Slot, keine hartcodierten DE-Texte) → Ursache ist die **Profil-Sprache**: ist sie
  nicht explizit gesetzt, liefert `/api/devices/config` `language="de"` (Default) → Uhr fällt auf DE.
  Verbesserung: wenn keine explizite Profil-Sprache, die **Geräte-Systemsprache**
  (`System.getDeviceSettings().systemLanguage`) auf unsere 7 Uhr-Codes (de/gsw/de-AT/en/fr/it/es)
  mappen statt hart „de". Sofort-Workaround für Nutzer: Profil-Sprache auf pumpfoil.org auf Englisch
  stellen. (Watch unterstützt nur 7 Sprachen; fi/nl/cs fallen ohnehin auf EN/DE.)
- **FIT-Import: record-Level-IMU (accel_xyz/gyro_xyz/mag_xyz) lesen** (Befund 2026-07-19, FoilMotion-FIT
  von Markus). Aktuell liest `fitimport.parse_fit_bytes` Accel nur aus `accelerometer_data`-Messages
  (SensorLogging). FoilMotion & Co. schreiben die IMU aber als **Developer-Felder pro `record`** →
  unser Import wertet solche FITs als **GPS-only** (kein Pump-Modell!), obwohl volle 25-Hz-Daten drin
  sind. TODO: `accel_xyz` (sint8, ×64 mg, 75 Werte = 25 Hz × 3 Achsen interleaved) extrahieren →
  in unser int16-Format (2048/g) wandeln (Faktor ≈ ×131,072) → als Accel-Chunks ablegen, dann läuft
  unsere Pump-Erkennung. Bonus als Ground Truth/Training: `gyro_xyz` (×16 °/s, 25 Hz — neuer Kanal!),
  `mag_xyz` (×16 mGauss, 5 Hz), `foil_status`/`water_detected` pro record, `run_pumps`/`run_pump_rate`
  je lap, `total_pumps`/`total_on_foil`/`total_off_foil` je session. Import-/Detektor-Änderung → Jans OK.
  Verwandt: [[board-imu-experiment]] (Gyro!), `pump-groundtruth`.
- **fenix 5 → Sparsam-Default beim Pairing** (2026-07-19, WARTET auf Nutzer-Bestätigung): Oerni
  (fenix 5, FW 25.00, Part 006-B2697-00) crasht beim Session-Start mit IQ!-Logo — 128-KB-Klasse
  wie FR55; Session #719 war 25-Hz-getaggt aber gps_only (Accel kam nie an). Nutzer testet gerade
  `lite`. Bestätigt sich das: fenix-5-Familie in `_LOW_ACCEL_MODEL_HINTS` (server/app/api/devices.py)
  aufnehmen → record_mode wird beim Pairing automatisch auf lite gekappt (wie FR55). Dabei prüfen,
  welche 5er-Varianten (5/5S/5X, Plus?) betroffen sind — Speicherlimits je Device-File checken.
- **GPS-Positions-Ausreißer filtern** (Befund 2026-07-19 an #367): einzelne korrupte GPS-Punkte
  mit 5.000-km-Sprüngen (Doppler-Speed dabei normal) verfälschen total_distance_m + Distanz-Stats;
  die Karte filtert sie nur beim Zeichnen. Fix wäre ein Ausreißer-Filter beim Laden/Analysieren
  (Punkt verwerfen, wenn Positionssprung >> Doppler×dt). Detektor-Pipeline → Jans OK + Regression.
- [x] **Spot-Ortszeit in die Apps** — ERLEDIGT 2026-07-18: Android (TimeFmt.kt, 7 Modelle + alle
  Session-Screens inkl. Compare) + iOS (TimeFmt.swift, 7 Structs + Listen/Detail/Rekorde/Compare).
  Bewusst Betrachter-Zeit geblieben: Chat, Wetter, Verlauf-Chartachsen; Transfers ohne Server-tz.
- [x] **Neue Rekord-Kacheln in die Apps** — ERLEDIGT 2026-07-19: Android + iOS zeigen alle 11
  (inkl. Early Bird/Night Owl in Spot-Ortszeit, mod-24h); i18n row+fi+nl beidseitig.
- [x] **Niederländisch (nl) in die Apps portieren** — ERLEDIGT 2026-07-18 (6e8cfea): Overlays
  Android (545 Keys) + iOS (526 Keys), Picker „Nederlands", Diktat nl-NL (+ fi-FI-Diktat-Fix).
  Wear bleibt bei 7 Sprachen (nl→de), wie fi. OFFEN nur: Muttersprachler-Review nl (+ fr/it/es/fi).
- [x] **Mehrere Videos pro Session: App-Parität** — ERLEDIGT 2026-07-18 (Android + iOS: Video-Liste
  im Medien-Grid, Verlinken/Löschen über die neuen `/videos`-Endpoints, Fallback alter Server).
- **Feature-Flags systematisch statt Sammel-`beta`** (2026-07-16): aktuell liefert der Server
  `profile.beta=true` hart für alle → jeder ist Betatester (öffnete Phone-Recorder ohne Release).
  `beta` ist damit vorerst **nicht** für echte, nicht-öffentliche Beta-Features nutzbar. Reihenfolge
  zum Wieder-Freibekommen (WICHTIG, sonst verschwindet der Recorder bei allen):
  1. [x] **ERLEDIGT 2026-07-18:** Phone-Recorder hängt in Android+iOS NICHT mehr an `beta` (nur noch
     lokaler Toggle `phone_rec_enabled`; „(Beta)"-Label entfernt). Kommt mit Android 1.1.13/iOS 1.1.15.
  2. Warten, bis praktisch alle dieses Update haben (~4 Wochen nach Golive).
  3. Erst dann `beta=false` für alle setzen und `beta` (bzw. je Feature ein eigenes Flag) für echte
     private Beta-Features + gezielte Tester (`BETA_USER_IDS`) wiederverwenden.
  Siehe Memory `beta-flag-public`.
- **Gleitphasen-Rekord „mit Weiterfahrt"** (Philipp-Feedback #29, 2026-07-16 gemerkt): Glides mitten
  im Lauf getrennt von End-Glides werten (der End-Glide vor dem Absteigen ist eh immer der längste).
  R&D/Detektor → Jans OK nötig. Nicht jetzt.
- **Partielle Accel-Daten** (Philipp #34, FR55): Session hat Accel bis ~Sek. 650, danach nichts —
  Analyse behandelt alles als accel-los. Abschnittsweise Behandlung = Detektor-Änderung, Jans OK.
  Verwandt: fr55-accel-truncation Ebene 2. Für später gemerkt (2026-07-16).
- ~~Läufe zusammenführen (Philipp #14/18/20)~~ — laut Jan durch die mehrfachen Detektor-Verbesserungen
  (Re-Arm-Cooldown, End-Verlängerung, NOSTOP) vermutlich obsolet.
- **Öffentliche Session-Teilen-Links** (Community-Wunsch Dominik/Pixelfoil, 2026-07-15): unguessbarer
  Token-Link → vollständige Session-Detailseite ohne Login/Registrierung. Spec (Jan, festgelegt):
  - **Nur für EIGENE Sessions** erzeugbar; `share_token` je Session (nullable), vom Besitzer erzeugbar +
    **widerrufbar**. Öffentliche read-only Route `/s/<token>` (Web) + Server-Endpoint ohne Auth, der NUR
    diese eine Session über den Token liefert (kein Zugriff auf Liste/Community/andere Konten).
  - **Alles sichtbar, KEINE Optionen/Teil-Verbergen:** Puls, Pumps, Position, Track/Karte, Segmente,
    Bilder (Preview **und** Fullscreen — `/media` ist eh öffentlich, Zufalls-UUID), YouTube (click-to-load),
    Bezeichnung/Caption, Besitzer-Name + Profilbild, Spot, Datum, Stats.
  - **Owner-only Aktionen im öffentlichen View AUSBLENDEN:** Editieren (Caption/YouTube), Foil setzen,
    Trimmen, Labeln/Pump-Tap, Löschen, Zusammenführen/Auflösen, Übertragen, Melden/Vote, Like-Button,
    Vergleich-Hinzufügen, Foto-Upload/-Löschen, Spot-Chat-Button, Rohdaten/Labeling-Zugriff.
  - **Prüfen:** `device_model`/`device_label` (interne Fehlersuche-Felder) im öffentlichen Payload
    besser WEGLASSEN — sind keine „Ride-Daten". Sonst nichts tracken, kein Dritt-Skript.
  - Server additiv (neue Spalte + 1 Endpoint), Web = bestehende Detailansicht read-only rendern; Teilen-
    Button in Apps später nachziehen. Jan erwägt es (noch nicht „bau's").
