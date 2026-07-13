# TODO & Ideen

**Einzige Quelle für offene Arbeit.** Gegen die Git-Historie abgeglichen (Stand 2026-07-13).
Erledigtes steht nicht mehr hier. Neue spontane TODOs unten unter „📥 Inbox" anhängen.

> Ersetzt die frühere `docs/IDEAS.md`-Inbox. Reine Produktideen weiter unten unter „💡 Backlog".

---

## 🔜 Nächstes App-Release (auf `main`, noch nicht gebumpt)
Alles gebaut; offen ist nur Jans Xcode-/Store-Teil:
- **iOS Age-Gate finalisieren:** Entitlement `com.apple.developer.declared-age-range` im Target +
  SDK-Typnamen in `AgeGate.swift` gegen die iOS-26-Doku verifizieren. Danach im App-Store-Formular
  „Soziale Medien für <13 deaktiviert = Ja" → niedrigere Altersfreigabe.
- **`xcodegen generate`** vor dem iOS-Build (neue Datei `SessionCache.swift`).
- **`appmeta ios` → 1.1.12** setzen, sobald Apple die iOS-1.1.12 freigibt (Server `api/appmeta.py`).
- **Wear 1.2.10/1022** hochladen — optional (funktional unverändert seit 1.2.9).

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
_leer_
