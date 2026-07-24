# TODO & Ideen

**Einzige Quelle für offene Arbeit.** Gegen die Git-Historie abgeglichen (Stand 2026-07-13).
Erledigtes steht nicht mehr hier. Neue spontane TODOs unten unter „📥 Inbox" anhängen.

> Ersetzt die frühere `docs/IDEAS.md`-Inbox. Reine Produktideen weiter unten unter „💡 Backlog".

---

## 🚀 App-Release-Stand (2026-07-22) — alle live & konform
- **iOS 1.1.15 LIVE** (App Store, freigegeben 19.7.), **Android Phone 1.1.13 LIVE**, **Wear 1.2.14/1024 LIVE**
  (22.7., targetSdk 35 → Play-konform), **Garmin 1.0.60 LIVE** (CIQ). `appmeta` gesetzt: ios=1.1.15,
  android=1.1.13, garmin.latest=1.0.60. Nichts offen im App-Release. Details: Memory `watch-apps-release-state`.

## 🩹 Polish / kleine Baustellen
- **Verlauf-Karte abhärten:** osmdroid-Spot-Animation in der Scroll-Liste → am Emulator ANR bei
  schnellem Scrollen (echte Geräte ok). Idee: Karte erst auf Tap initialisieren statt beim Scrollen.
- **Sub-Screen-Header cyan:** Uhr/Datenseiten/Verknüpfte-Konten nutzen Material-`TopAppBar` (nicht
  cyan) — nur die 7 Haupt-Tabs haben die Marken-Leiste.
- **Off-Foil-Screen (nativ):** nur die 3 Feld-Selektoren, ohne den runden Uhr-Preview-Mock der PWA.
- **Update-Hinweis für ungepairte Alt-Uhr-Apps** (Henne-Ei): der Web-Update-Banner hängt am
  gepairten Gerät; eine noch nie gepairte Alt-App sieht keinen Hinweis. Generischen Store-Update-
  Hinweis erwägen. (war `todo-update-hint-unpaired`)
- ~~Garmin CIQ-Store-Listing „Pump Foil" → „Pumpfoil"~~ — ERLEDIGT: Store zeigt „Pumpfoil – Track
  Every Pump" (Titel + App-Name), kein „Pump Foil" mehr (bestätigt 2026-07-22).
- **Muttersprachler-Review** der Übersetzungen fr/it/es/fi (best-effort erzeugt).

## 🔌 Integrationen (credential-gated / extern)
- **COROS** — Workout-Push-Import gebaut + live, aber credential-gated; aktiv erst nach Freigabe.
- **Amazfit/Zepp** — ✅ **APPROVED & LIVE im Zepp/Amazfit Store** (2026-07-21 bestätigt): Pumpfoil v1.0.2
  (appId 1118995, ~40 Geräte inkl. Balance 2). Server nimmt Zepp-Uploads schon an (`platform=zepp`). Offen:
  Verifikation auf echter Amazfit (bisher nur Sim), 25-Hz-Accel (Zepp-API unklar → aktuell gps_only),
  bewerben (Banner-Amazfit-Subline jetzt freigebbar). Memory `zepp-recorder`.
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
- [x] **Start-Erfolgsquote** — ERLEDIGT 2026-07-22 (Laurent): statt Fehlstart-Erkennung aus dem
  Rohsignal (unzuverlässig — Analyse zeigte das) pragmatisch per **Lauf-Distanz-Schwelle** (Jans
  Idee): erkannter Lauf < Schwelle = Startversuch, darüber = Erfolg. Home-Sektion unten, 5 Zeitfenster,
  Schwelle einstellbar (Default 20 m). Rein aus vorhandenen Distanzen, kein Reanalyze, persönlich
  (nicht Community-Rekorde). Endpoint `/api/community/start-success`.
- **Carves in der Karte** — ✅ LIVE 2026-07-21 (read-only, nur Anzeige): „Carves"-Modus in der Web-
  Session-Karte. Enge Turns (GPS-Kurs, ≥90°, Radius <12 m) grün→gelb→rot nach Kurvenlage (v²/r aus GPS),
  feine Catmull-Rom-Bögen, Zähler nach Grad-Bucket. Rein GPS (kein Accel). NICHT in Rekorde/Stats.
  Memory `turn-carve-detection-rnd`. **Offen:** Community-Feedback zu Miss/Over-Detection abwarten
  (Jan postet Ankündigung); Params (`step_m/rate_deg/min_rot/max_radius_m`) ggf. nachtunen; App-Port.
- **Turns/große Runden als EIGENES Feature** (Feedback Laurent, FoilMotion-inspiriert) — weite Turns
  getrennt von Carves: eigene Statistik + Rekorde (L/R-Zähler, Netto-Rotation, Vorzugsrichtung, Loops)
  aus GPS-Kurs (evtl. Gyro via FIT). Carves sind bewusst nur die engen (<12 m). R&D/Detektor → Jans OK.
- **„Wer foilt jetzt gerade?"** — laufende Sessions live (braucht Live-Upload während der Session +
  Privacy-Opt-in). Groß.
- **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck, Übersetzungen cachen).
- **Foil je *Lauf*** (per-Run-Foil + per-Run-Watt) — braucht Lauf-Foil-/Labeling-Ablage.
- **Foil-DB** — Abdeckung ist gut (393 Foils/24 Marken, alle großen Pump-Marken). **Takuma** war die
  einzige echte Lücke (Takoon≠Takuma, Google verwechselt sie) → **2026-07-22 ergänzt**: Kujira 1
  (750/980/1095/1210/1440) + Kujira II (650–1400), Fläche belegt, Spannweite tw. geschätzt, Dicke
  geschätzt+markiert. Ansonsten **on-demand**: fehlendes Foil meldet ein Nutzer → 2-Min-Nachtrag.
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
- [x] **`docs/PARITY-AUDIT.md` aktualisiert** (2026-07-22): war schon auf 07-13 gepflegt (fast volle
  Web-Parität); jetzt 10 Sprachen, Carve-Ansicht (Web-only) + öffentl. Teilen-Link ergänzt, **Amazfit/Zepp
  als 4. Recorder** mit Feature-Rückstand (kein Accel/Pumps, keine Lokalisierung) aufgenommen.

---

## 📥 Inbox (spontane TODOs — hier anhängen, später einsortieren)
- **Natives-Parität-Runde 2026-07-23 (autonomer /loop) — Stand:** ✅ Carve-Anzeige + Tages-Gruppierung
  in Android (compile ok) + iOS (parse ok); ✅ 5 Sprachen pt/ja/zh/ru/id in Android/iOS/Web + Garmin
  pt/id/ru (ja/zh CJK-Glyph-blockiert); ✅ Versionen gebumpt (Phone 1.1.14/30, Wear 1.2.15/1025,
  iOS 1.1.16/20, Garmin 1.0.61); ✅ Android im Emulator visuell verifiziert (Sprachen).
  **Fortsetzung 2026-07-24 (autonomer /loop):** ✅ Apple-Watch Recorder-Status-Strings i18n
  (rec.saving/rec.saved, Commit 95ceef6); ✅ (e) geprüft → **gegenstandslos**: der Foilers-Tab
  (CommunityView/Screen) hat keinen chronologischen Session-Feed zum Gruppieren (nur Stats/Rekorde/
  Medien/„Best bewertet"=Like-Ranking/Spots); der eigentliche Alle-Feed liegt im Sessions-Tab
  (Scope.ALL) und gruppiert bereits (beide Apps rufen `sessions-grouped`). OFFEN:
  (a) **Uploader GPS-first Client-Reorder** — ✅ **Garmin erledigt in v1.0.62** (2026-07-24, Commit,
  Uploader._advance() Phasen :start→:gps→:accel→:final; Compile fenix7xpro ok; Gerätetest durch Jan
  vor CIQ-Release ausstehend). ✅ **Android+Wear erledigt** (2026-07-24, Commit: parallele Uploader,
  chunkFiles GPS-first sortiert via neuem chunkKind()-Datei-Kopf-Read; :app/:wear compile ok;
  Gerätetest ausstehend). Offen noch **Apple** (iPhone- + Watch-Recorder, Swift-Uploader), Server+Web
  bereits GPS-first (dormant); Client berührt kritischen Upload-Pfad → erst mit Gerätetest;
  (b) **Stufe B Teil-Accel-Upload** erst
  datenbasiert verifizieren (Task #17: Läufe/Puffer/Start-Erkennung); (c) **Zepp-i18n** (keine Infra,
  0 Nutzer); (d) iOS/Apple xcodegen+Xcode-Build durch Jan. Details Memory [[watch-apps-release-state]].
- **5 neue Sprachen in Apps + Review** (2026-07-23): Web live in pt/ja/zh/ru/id (15 total).
  Offen: (a) Android/iOS-Overlay wie fi/nl/cs nachziehen; (b) Muttersprachler-Review aller 5
  (KI-Übersetzung). pt-Flagge = 🇧🇷 (Brasilien).
- **Tages-Gruppierung in Apps** (2026-07-23): Web bündelt im Alle-Feed + an Spots die Sessions eines
  Nutzers pro Tag/Spot zu einer aufklappbaren Kachel (Server `GET /api/community/sessions-grouped`,
  rein anzeige-seitig, ändert keine Rekorde). Android/iOS nutzen weiter die flache Liste → dort
  nachziehen (gleicher Endpoint). Bei sehr großem Feed später Python-Voll-Scan (Cap 6000) durch eine
  echte Gruppen-Paginierung/Materialisierung ersetzen.
- **Amazfit-Rollout** (2026-07-21, nach Store-Approval): erledigt = /uhr-Tabelle (Zepp-App-Badges),
  Plattform-Subline, Changelog, YouTube-Banner (SUBLINE + volle Breite), Meta/OG/noscript, **Landing**
  (Karussell je Plattform + Amazfit-Screenshots + `watchBody`/`f1Body` in 10 Sprachen), **Pairing-Guide**
  (Amazfit-Sektion, `guide.z.*` in 10 Sprachen). Nebenbei: Landing-Uhr-Sektion auf auto-rotierende
  Karusselle umgebaut, Garmin-Screenshots v1.0.24→v1.0.44 aktualisiert. OFFEN nur noch: (a) Verifikation
  auf echter Amazfit (Balance 2, bisher nur Sim); (b) 25-Hz-Accel (Zepp-API unklar → aktuell gps_only);
  (c) Banner-Bild auf YouTube hochladen (Jan). Memory `zepp-recorder`.
- **Aufnahme nicht automatisch hochladen / Save-Discard** (Feedback 2026-07-19): „session started auto,
  stopped → auto-uploaded. Every other activity has save/discard." Wunsch: (a) optional NICHT automatisch
  hochladen bzw. Save/Discard-Abfrage nach dem Stopp, ODER (b) nur Sessions mit ≥1 erkanntem Lauf hoch-
  laden. Betrifft Garmin-Watch-UX (Monkey C) + evtl. Phone-Recorder. Abwägen: Auto-Upload ist bewusst
  reibungsarm; ggf. Opt-in-Setting „vor Upload fragen". Claude kann Watch bauen.
- ~~Sabfoil-Foils ergänzen (Eric 2026-07-13)~~ — schon drin (`foils.json`: LEVIATHAN BLACKBIRD 1400/
  „THE 1350", BLACKBIRD RAZOR 1077). Kein TODO.
- [x] **Max-Speed: Rand-GPS-Spike killen** — ERLEDIGT 2026-07-21: Speed-Rekord war schon 3-s-Max, aber
  ein Doppler-Spike auf dem ERSTEN/LETZTEN GPS-Punkt setzte den Rekord (Median-Filter am Rand blind,
  `mode="edge"`). Fix: Endpunkte gegen Innen-Median clampen (nur runter). Regression: 7/647 Sessions,
  alle Reduktionen (S555 31,8→18,9 etc.), alle 7 reanalysiert + persistiert. Changelog-Eintrag live.
  OFFEN bleibt der separate **Positions-Ausreißer-Filter** (5000-km-Sprünge, verfälscht Distanz) →
  eigener Inbox-Punkt unten.
- **Android: Stats pro Lauf + Foil in Community** (Feedback Tom 2026-07-20): (a) in der Session-Detail
  der App zeigt „einen Lauf auswählen" weiter die Gesamt-Stats (kein Puls/Kadenz je Lauf) — Web kann's,
  App nicht → Parität. (b) In der Community-Liste der App fehlt das benutzte Foil (Web zeigt es). Beides
  Android(/iOS)-Port.
- [x] **Uhr-Sprache + Default Englisch** — ERLEDIGT 2026-07-21 (Feedback Laurent): Ursache war der
  harte `de`-Default in der ganzen Kette (`User.language` default, `_clean_lang`, Web-i18n-Fallback,
  `/config`). Umgestellt auf **Englisch als Default** (deutsche Browser/Geräte bleiben per Detection
  Deutsch). `/api/devices/config` sendet bei ungesetzter Sprache jetzt `""` → Uhr weicht auf
  `System.getDeviceSettings().systemLanguage` aus (Mapping+EN-Fallback in `Strings.mc` existierte
  schon; kein Uhr-Rebuild). Bestehende Nutzer mit explizitem „de" unberührt.
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
- [x] **GPS-Positions-Ausreißer filtern** — ERLEDIGT 2026-07-21: `_repair_spikes` fing schon innere
  Einzelpunkt-Spikes (kam nach der Notiz) → keine Session hatte verfälschte Distanz. Restlücke
  geschlossen: neuer `_fill_invalid_coords`-Vorfilter ersetzt ungültige Koords (|lat|>90/|lon|>180,
  z.B. (180,180)-Sentinel) durch den nächsten gültigen Nachbarn — auch am ERSTEN/LETZTEN Punkt +
  aufeinanderfolgend (S591-Randpunkt). Regression: 0 Distanz-Änderungen; S591 reanalysiert.
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
