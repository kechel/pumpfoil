# Ideen & Backlog

## 📥 Inbox (unsortiert, später einsortieren)
_Schnell reingeworfene TODOs — keine Priorität, werden nach Ermessen eingeordnet & umgesetzt._

- ✅ **Uhren auf die Benutzersprache einstellen** — *umgesetzt 2026-06-27.* Alle drei Recorder
  (Garmin `Strings.mc`, Wear `I18n.kt`, watchOS `WLoc.swift`) + Phone-Apps (Android/iOS) sowie das
  komplette Web nutzen jetzt die **Profil-Sprache** (7 Locales), via `language` aus `/api/devices/config`
  (lokal gecacht, Fallback de). Reine Einheiten universell. fr/it/es best-effort (Muttersprachler-Review offen).
- **Board-/Foil-IMU → echte Pump-Technik-Analytik (R&D, Daten werden gesammelt).** Hintergrund:
  Intra-Pump-Geschwindigkeit ist aus dem 1-Hz-Wrist-GPS **nicht** rekonstruierbar (Phase-Folding-
  Experiment `server/scripts/accel_speed_experiment.py` besteht den Permutations-Null-Test nicht;
  Wrist-Accel ist arm-confounded). Lösung: Sensor näher am Board. Jan testet mit **2 Uhren** (beide auf
  unserer Recorder-App → roher 25-Hz-Accel; je Gerät eigenes Pairing) in zwei Konfigurationen, je ein
  paar Läufe, ggf. über mehrere Sessions:
  (A) **Fußgelenk + Board-Deck** — Fuß/Deck eng ans Board gekoppelt (kein Arm-Confound); Board oben =
  GPS, kein Puls. (B) **Board-Deck + Foil unterwasser** — Foil-Uhr: kein GPS/Puls, misst aber die
  **Foil-Lage direkt**; Sync beider Uhren über den **Aufprall-Spike beim Lauf-Start** (mehrere pro
  Session → auch Clock-Drift korrigierbar). Auswertbar (nach Reliability sortiert): Pitch/Roll statisch
  aus Gravitation (driftfrei), Pump-Kadenz/-Count board-nah (sauberer als Wrist), Vortriebs-Surge per
  Forward-Achsen-Integration **an GPS geankert**, **Mastbiegung** = Board-Attitude − Foil-Attitude.
  Orientierung größtenteils aus Daten lösbar (Gravitation → up; GPS-Längsbeschleunigung → forward-Achse
  als 1 konstanter Yaw-Offset). Absoluter Foil-AoA-Offset evtl. über `foilPhysics` (Lift=Gewicht im
  stationären Gleiten) ankerbar. **Limit:** dynamische Stroke-Lage braucht eigentlich einen **Gyro** →
  rechtfertigt später einen 6-Achsen-Logger (~10–25 €, ICM-42688 o. ä.) am Mast/Deck. Nächster Schritt:
  Jan liefert Session-IDs + welche Uhr wo/orientiert → serverseitige Auswertung.

- **Google-OAuth-Verifizierung: Datenschutzerklärung ergänzen.** Google (Third Party Data Safety)
  verlangt, dass die Privacy Policy unter `/impressum` explizit **Google-Nutzerdaten** dokumentiert:
  *Data Accessed* (E-Mail, Vorname/`given_name`, Konto-ID `sub`) und *Data Usage* (nur Konto-Erstellung/
  Anmeldung; kein Drive/Gmail/Kalender; keine Weitergabe an Dritte). Eigenen Abschnitt „Google-Nutzerdaten"
  einfügen, dann per E-Mail-Reply bestätigen (Verification Center). Betrifft den OAuth-Login.

- ✅ **Watch Offline-Recording + Sync-UI** (2026-06-25, Apple + Wear): Aufnahme ist **local-first**
  (persistenter `LocalStore`, kein Netz/Pairing zum Start nötig); **Pairing optional** („Später
  verbinden"), Sessions werden lokal gepuffert und per `drain()` automatisch nachgesynct, sobald
  gepairt + online (resumebar via `received_chunks`, kein Serverumbau). UI: Sync-Banner + „Jetzt
  nicht", Online-Erkennung (offline → letzte gecachte Datenseiten), Upload-Indikator, „N warten auf
  Upload", Start-Button in Startphase ausgeblendet. Default-Datenseiten = 3 sinnvolle Seiten statt 1.

- ✅ **/foil-stats: relevante Kennzahlen.** *umgesetzt:* statt Max-Speed jetzt **Ø-Speed** (Σdist/Σzeit)
  und **Meter pro Pump** (Σdist/Σpumps) — Endpoint `/api/community/foil-stats` aggregiert `avg_speed_kmh`
  + `meters_per_pump`, FoilStats-Seite zeigt die Spalten „Ø-Speed" / „Meter pro Pump".

- **Foil-DB um weitere Marken erweitern.** *Infrastruktur + erste Marken umgesetzt (2026-06-24):*
  Schema-Flag `thickness_estimated` (Model/Migration/Seed/API), idempotenter Seed (neue Foils per
  brand/model/size nachladbar), UI-Badge „≈ Dicke geschätzt" (Foils-Liste, Rechner-t/c, Session-Watt).
  **Ergänzt:** Armstrong HA (580–1180, 7 Wings) + Unifoil Progression (140/170/200) — span/area aus
  Herstellerangaben, **Dicke aus t/c-Annahme geschätzt** (AR≥10→0.11, ≥9→0.12, sonst 0.13) und markiert.
  Jetzt 8 Marken / 133 Foils. **Noch offen:** weitere Marken (Lift, Code, Naish, North, Takuma, GoFoil,
  Appletree, Moses …) — bei Bedarf mit verifizierten span/area ergänzen (Dicke weiter geschätzt+markiert).
- ✅ **Spot-Sessions → Direktlink zum Spot-Chat.** *umgesetzt:* in `/alle-sessions?spot=…` aufklappbarer
  Spot-Chat (Button „💬 Spot-Chat"); Homespot-Karte auf /home zeigt den Spot-Chat direkt.
- **Chat-Moderation & Anti-Spam** (Teil der Chat-Engine):
  - ✅ **Duplikatserkennung** — *umgesetzt:* gleicher Text desselben Users im selben Raum < 2 min -> kein Doppelpost.
  - ✅ **Melden-Icon** je Nachricht (klein). *umgesetzt (⚠ pro Fremdnachricht).*
  - ✅ **Auto-Ausblenden** ab **3+ Meldungen** (kein Auto-Löschen). *umgesetzt + Admin-Freigeben.*
  - ✅ **Admin:** ausgeblendete wieder **freigeben**, Nutzer auf **read-only** setzen, Melde-Zähler.
    *umgesetzt:* `/chat/{id}/hide`, `/chat/reported`, `/chat/moderation/readonly`, Admin-Buttons in der
    Chat-Komponente **und** eigener Admin-Tab „Chat" (gemeldete Nachrichten, freigeben/ausblenden,
    read-only). ✅ komplett.
- ✅ **Persönliche Startseite / Dashboard** — *umgesetzt: /home (Rekorde + 3 letzte Sessions + Homespot-Chat),
  Home als 1. Bottom-Tab (6 Tabs), Profilbild + Post-Login -> /home, Rekorde aus Sidebar entfernt.*
  - ✅ **Ungelesen-Hinweise:** *umgesetzt:* `chat_room_state` (last_read je Raum/User), „Meine Chats"-Widget
    auf /home mit Unread-Badges; Chat-Komponente meldet Lesestand (`/chat/read`).
  - ✅ **Chatraum verlassen:** *umgesetzt:* `/chat/leave` + Button in der Chat-Leiste; verlassene Räume
    verschwinden aus „Meine Chats".
- **Foil-Rechner nativ nachbauen + Physik als Modul (★★★, ersetzt den HTML-Link).**
  - ✅ **Schritt 1 — Physik-Modul** `web/src/lib/foilPhysics.ts` aus dem Calculator-JS portiert
    (AR, Reynolds, Chord/Dicke, CLmax, required CL, Stall/Min-Viable, Cd induziert+Profil, Foil-/Mast-Drag,
    Pump-Trägheit/Added-Mass, `computeFoilPowerAtSpeed`). **Verifiziert** gegen die Referenz:
    `npm run test:physics` (135/135 Werte identisch, `scripts/verify-foil-physics.mjs`).
  - ✅ **Schritt 3 — Watt in Detailansichten:** `FoilPower`-Karte in der Session-Detailansicht zeigt die
    theoretische Leistung bei Ø- und Top-Speed (Fahrergewicht aus den Einstellungen, reale Pump-Hz für den
    Trägheitsanteil).
  - ✅ **Schritt 2 — native Rechner-Seite:** `/foil-rechner` (`FoilCalculator.tsx`) im App-Layout —
    Parameter (Gewicht/Mast/Pump), Foil-Mehrfachauswahl aus dem Katalog, Basis-Kennwerte-Tabelle
    (AR/Chord/t-c/CLmax/Stall/Min-Speed/Optimal) und Leistungs-Tabelle (W über 10–20 km/h, beste je
    Spalte hervorgehoben). Profil-Link zeigt jetzt dorthin; statische `public/foilcalculator.html` entfernt.
  **→ Foil-Rechner-Item komplett erledigt** (Modul verifiziert, Watt in Detailansichten, native Seite).
- **Light-Mode + Theme-Schalter.** *umgesetzt (Review-gated, 2026-06-24):* slate-Skala als CSS-Variablen
  (`tailwind.config` + `src/index.css`), Dark = exakte alte Werte (Live pixelgleich), Light = invertierte
  Rampe → kippt ohne Komponenten-Änderungen. Profil-Schalter **Dark / Light / Auto** (`lib/theme.ts`,
  `ThemeSelect`), No-Flash-Init in `index.html`, dynamische `theme-color`-Meta.
  **Default = Auto** (folgt System, inkl. öffentlicher Startseite) — live aktiviert 2026-06-24 auf
  Wunsch (nur Tester Peter aktiv). Kontrast-Fix: `text-slate-950` (dunkle Tinte auf Akzent) bleibt im
  Light dunkel gepinnt. **Optional später:** Light-Palette weiter feinschleifen nach echtem Feedback.
- **Einheitliches Icon-Set (Material).** Alle aktuell handgemalten Inline-SVG-Icons durch ein
  konsistentes, schönes Set ersetzen. Option A: selbst im Material-Stil designen. Option B:
  **Google Material Symbols** — Lizenz **Apache-2.0**, also erlaubt; **müssen self-hosted** sein
  (SVGs/Variable-Font lokal bündeln) wegen CSP/Offline, **kein** Remote-Zugriff der Nutzer zu Google.
  → vermutlich B (self-hosted Material Symbols) als gemeinsame `<Icon name=…>`-Komponente.
- ✅ **Sessions-Seite vereinheitlicht.** *umgesetzt:* eine `/sessions`-Seite mit Umschalter
  **Meine / 📍\<Homespot\> / Alle** + **Spotsuche** in einer Zeile; dynamischer Titel
  („Sessions · \<Name\>" | „Sessions · 📍\<Spot\>" | „Sessions · Alle"). `Sessions`+`AllSessions` zu einer
  Komponente gemerged (eigene vs. Community-Liste je Scope), Spot-Chat-Toggle integriert; alte Route
  `/alle-sessions` leitet weiter, `SessionScopeTabs`/`AllSessions` entfernt.
- **Öffentliche Startseite** — *teilweise erledigt:* Feature-Kacheln für **Foil-DB/Stats, On-Foil-Alarm,
  Push, PWA/Offline** ergänzt; Wording generisch. ✅ **Community-Chat + Spots-Karte** als Feature-Kacheln
  ergänzt (land.f11/f12). **Optional:** Slider-Screenshots der neuen Features.
- ✅ **Chatraum per Push abonnieren.** *umgesetzt:* `/chat/subscribe` (Opt-in je Raum), Glocken-Toggle in
  der Chat-Leiste; neue Nachrichten lösen Web-Push an Abonnenten aus (Notify-Typ „chat", respektiert
  globale notify_prefs). ✅ „chat" jetzt auch als eigener Schalter in den globalen Push-Einstellungen.

---


Sammelstelle für Produktideen — **noch nichts davon umgesetzt**. Gruppiert, mit grober
Einschätzung. Technischer/Plattform-Backlog (Apple/Wear/Connectoren, CI, Error-Tracking,
CSP …) steht in [`ROADMAP.md`](ROADMAP.md).

**Nutzen:** ★ niedrig · ★★ mittel · ★★★ hoch
**Aufwand:** S = Stunden · M = 1–2 Tage · L = mehrere Tage · XL = Wochen

---

## 1 · Foil-Ausrüstung & Physik

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| ✅ **Foil-Datenbank** (Katalog von Foils) — *umgesetzt: Tabelle+Seed (123) + /api/foils* | ★★★ | M | **Schema + Daten existieren** im Calculator (`reference/foilcalculator.html`, `const foilData`): 123 Foils / 6 Marken (AXIS, Duotone, F-One, Gong, Sabfoil, TAKOON). Pro Foil nur Stammwerte: `{ brand, model, size, span_cm, area_cm2, thickness_mm }` (+ `isBaseline`). AR/Chord/CL/CD/Reynolds/Drag/Power werden **berechnet**, nicht gespeichert. → DB-Tabelle 1:1 nach diesen 6 Feldern, Seed aus `foilData`. |
| ✅ **Foil je Nutzer/Session** — *umgesetzt: „Meine Foils" (mehrere + Default ★), Foil-Select je Session* | ★★★ | M | **Noch offen: je Lauf** (Labeling) — Segmente liegen in segments_json, braucht eigene Ablage. |
| ✅ **Community-Stats je Foil** — *umgesetzt: /foil-stats (Sessions/Foiler/Top-Speed/weitester Lauf/Ø Pump), von Community verlinkt* | ★★ | M | |
| ✅ **Gewicht im Profil** — *umgesetzt: Settings.weight_kg (optional, privat)* | ★★ | S | Input für Leistungsberechnung. |
| ✅ **Leistungsberechnung (Watt)** — *umgesetzt: FoilPower-Karte in der Session-Detailansicht (Watt bei Ø-/Top-Speed, Gewicht aus Profil, reale Pump-Hz); Physik als verifiziertes Modul.* | ★★★ | L | **Noch offen: je *Lauf*** (per-Run-Watt, braucht Lauf-Foil/Labeling-Ablage). |
| ✅ **Foil-Calculator eingebunden** — *vollständig: native `/foil-rechner`-Seite + Physik-Modul (verifiziert) + Watt in Detailansichten; statische HTML entfernt.* | ★★ | M | Referenz liegt im Repo: [`reference/foilcalculator.html`](reference/foilcalculator.html) (self-contained, ~4170 Zeilen, eigene i18n, `addFoil`/Foil-Liste, Funktionen u. a. `calculateFoilPerformance`, `calculateTotalDrag`, `computeFoilPowerAtSpeed`, `calculateOptimalSpeed`, `calculateReynolds`). Teilt sich Daten/Logik mit Foil-DB + Leistungsberechnung — sinnvoll, die Physik einmal als Modul rauszuziehen. |

## 2 · Community & Social

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| **„Wer foilt jetzt gerade?"** – laufende Sessions live | ★★★ | L | braucht **Live-Upload während der Session** (Teilbasis da: `/ingest/.../analyze`, `status=recording`). Watch müsste periodisch hochladen + „live"-Flag; Privacy-Opt-in! |
| **Session-Diskussion** (Kommentare unter jeder Session) | ★★★ | M | Eher Forum/Diskussion als Chat. **Nur Text.** Nutzt dieselbe Chat-Engine wie der Spot-Chat (gemeinsame Komponente/Tabelle, scope=session). Moderation/Meldefunktion mitdenken. |
| ✅ **Spot-Chat** (ein Raum je Spot) — *umgesetzt: Chat-Engine mit `scope`, Spot-Räume, Homespot-Default, Moderation/Anti-Spam, Push-Abo.* | ★★ | L | Realtime per Polling (kein WebSocket nötig). |
| ✅ **Homespot im Profil** — *umgesetzt: Settings.homespot, Auswahl aus Spots, „" = letzte Session* | ★★ | S | speist später Spot-Chat-Default + Sessions-Merge. |
| **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck) | ★★ | M | günstiges Übersetzungsmodell; **Übersetzungen cachen** (pro Ziel-Sprache) und direkt mitladen, wenn vorhanden. Hängt an den Texten der Chat-Engine. |

**Chat-Engine (gemeinsam für Session-Diskussion + Spot-Chat):** nur **Textnachrichten**, simple **URL-Erkennung** (Links klickbar → öffnen in neuem Browser-Tab). Eine Engine/Tabelle mit `scope` (`session:<id>` | `spot:<name>`), wiederverwendbare UI-Komponente.

## 3 · Medien

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| **Video direkt in der App aufnehmen** + klein skaliert **selbst hosten** | ★★ | XL | Aufnahme (MediaRecorder), serverseitige Transkodierung/Skalierung (ffmpeg), Storage/Bandbreite, Moderation. Bisher: nur YouTube-Verlinkung. |

---

## Einordnung / empfohlene Reihenfolge

**Schnelle Wins (S–M, hoher/mittlerer Nutzen), bauen aufeinander auf:**
1. **Foil-Datenbank** (Fundament) → 2. **Foil je Nutzer/Session/Lauf** → 3. **Gewicht im Profil**.
   Danach werden **Community-Stats je Foil** und **Leistungsberechnung** möglich.
4. **Session-Kommentare** (eigenständig, hoher Social-Nutzen) → später **Auto-Übersetzung** drauf.

**Größere Brocken (L–XL) – bewusst später / gut planen:**
- „Wer foilt gerade" (Live-Upload + Privacy-Opt-in).
- Spot-Chaträume (Realtime + Moderation).
- Video-Aufnahme & Self-Hosting (Transkodierung/Storage).

**Querschnitt zu beachten:** Privacy/Opt-in (Live-Status, Gewicht), Moderation (Kommentare/Chat),
Betriebskosten (Video/Chat) — passt zur „immer kostenlos, ggf. Affiliate"-Linie.
