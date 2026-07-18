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
- **„Wer foilt jetzt gerade?"** — laufende Sessions live (braucht Live-Upload während der Session +
  Privacy-Opt-in). Groß.
- **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck, Übersetzungen cachen).
- **Foil je *Lauf*** (per-Run-Foil + per-Run-Watt) — braucht Lauf-Foil-/Labeling-Ablage.
- **Foil-DB um weitere Marken erweitern** — Infrastruktur da (`thickness_estimated`, idempotenter
  Seed), nur Daten ergänzen.
- ⏸ **Video direkt in der App aufnehmen** + self-hosten — zurückgestellt (YouTube-Link reicht;
  Transkodierung/Storage/Moderation = XL).

## 🔬 R&D
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
- **Neue Rekord-Kacheln in die Apps** (2026-07-18): Web zeigt jetzt 11 Rekorde (+Session-Distanz/
  -Zeit/-Pumps, Max-Puls, Early Bird, Night Owl — 8d0c208); Android/iOS-Community zeigt noch die
  alten 5. Server liefert alle bereits (additiv, Apps ignorieren Unbekanntes).
- [x] **Niederländisch (nl) in die Apps portieren** — ERLEDIGT 2026-07-18 (6e8cfea): Overlays
  Android (545 Keys) + iOS (526 Keys), Picker „Nederlands", Diktat nl-NL (+ fi-FI-Diktat-Fix).
  Wear bleibt bei 7 Sprachen (nl→de), wie fi. OFFEN nur: Muttersprachler-Review nl (+ fr/it/es/fi).
- [x] **Mehrere Videos pro Session: App-Parität** — ERLEDIGT 2026-07-18 (Android + iOS: Video-Liste
  im Medien-Grid, Verlinken/Löschen über die neuen `/videos`-Endpoints, Fallback alter Server).
- **Feature-Flags systematisch statt Sammel-`beta`** (2026-07-16): aktuell liefert der Server
  `profile.beta=true` hart für alle → jeder ist Betatester (öffnete Phone-Recorder ohne Release).
  `beta` ist damit vorerst **nicht** für echte, nicht-öffentliche Beta-Features nutzbar. Reihenfolge
  zum Wieder-Freibekommen (WICHTIG, sonst verschwindet der Recorder bei allen):
  1. Native Release (Android+iOS), in dem der **Phone-Recorder NICHT mehr an `beta`** hängt (eigenes
     Kriterium / nur lokaler Toggle).
  2. Warten, bis praktisch alle dieses Update haben.
  3. Erst dann `beta=false` für alle setzen und `beta` (bzw. je Feature ein eigenes Flag) für echte
     private Beta-Features + gezielte Tester (`BETA_USER_IDS`) wiederverwenden.
  Kein Zeitdruck. Siehe Memory `beta-flag-public`.
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
