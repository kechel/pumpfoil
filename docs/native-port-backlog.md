# Native-Port-Backlog: PWA → iOS / Android

Alles, was seit dem letzten Phone-App-Release (**2026-06-28**, iOS 1.1.0 + Android Phone 1.1.x /
Wear, Store-Review) in der **PWA (`web/`)** dazukam und in die nativen Phone-Apps
(`watch-apple/Sources-iOS/` = SwiftUI, `android/app/` = Compose) übernommen werden soll.

**Legende:** ☐ offen · ✅ schon nativ · 🌐 Web-only (nicht portierbar/nicht sinnvoll) ·
**Server bereit?** = API/Endpoint existiert schon, nativ fehlt nur die UI.

Detail zu jedem Punkt: `git show <hash>`. Stand der Erhebung: 2026-07-05.

---

## 1. Große Features (fehlen auf iOS **und** Android) — Hauptarbeit

### ☐ 1.1 Social-Share / teilbare Session-Card  · Server bereit ✅
Server rendert ein PNG der Session-Karte; App zeigt Teilen-Button + System-Share-Sheet.
- Endpoint: `GET /api/sessions/{id}/share.png` (server `app/sharecard.py`, `api/sessions.py`).
  Query-Params: `title`, `shade` (light/dark-Blau), Farbmodus, Stats-Auswahl, Foto-BG.
- Konfig-Dialog: Farbmodus (Speed/Puls/Pump), welche Stats erscheinen, Session-Foto als
  Hintergrund mit **Pinch/Pan**, eigener **Titel**, Hell/Dunkel-Blau-Umschalter für Lesbarkeit,
  nur **Foiling-Track**, Track-an/aus + Abdunkeln-Slider. Konfig wird als **Profil-Default** gespeichert.
- **Nur eigene Sessions** teilbar (Button owned-gated).
- Web-Quelle: `web/src/pages/SessionDetail.tsx` + ShareDialog. Commits: `aa58350` `454c93e`
  `3a82055` `2230b36` `d7d7458` `6dfb0a1`.
- Port: iOS `ShareLink`/`UIActivityViewController` mit dem PNG; Android `Intent.ACTION_SEND`.
  Konfig-Sheet nachbauen; Default in denselben Profil-Settings-Keys speichern.

### ☐ 1.2 Sessions zusammenführen (Merge)  · Server bereit ✅
Mehrere Aufnahmen derselben Foil-Session zu einer verschmelzen.
- Regeln: nur **On-Foil-erkannte** (is_pumpfoil + num_runs>0), **nicht** aussortierte/gelöschte,
  **nur gleicher Spot**. Umkehrbar (**Un-Merge**), Merge ohne Warn-Popup.
- Zwei Wege: (A) **Banner-Hinweis** auf heutige Kandidaten (Vorschlagsgruppen mit Datum +
  von/bis-Uhrzeiten; Klick → Vergleichen-&-Mergen mit den Vorschlägen vorausgewählt),
  (B) über die **Compare-Ansicht** (eigene Sessions gleichen Datums).
- „Aus N zusammengeführt · Auflösen" ganz am Seitenende, nur Besitzer.
- Endpoints in `api/sessions.py` (merge / unmerge / merge-suggestions).
- Web-Quelle: `web/src/pages/Sessions.tsx` (MergeHint), `Compare.tsx`. Commits: `e1278f7`
  `494f26d` `d7e1ff5` `7df5cc5` `9ac7e03` `6971014` `9357b0f`.
- Port: Compare gibt es nativ schon (`CompareView`/`CompareScreen`) → Merge-Aktion + Suggestions-Banner dort andocken.

### ☐ 1.3 Sprach-Diktat im Chat (+ Feedback-Widget)
Web nutzt die **Web Speech API**; nativ **plattformeigene** APIs:
iOS `SFSpeechRecognizer` + `AVAudioEngine`, Android `SpeechRecognizer`.
- Vollbild-Overlay (weiche Brand-Farben, Diktattext fett + brand-blau), **Live-Vorschau**,
  Kontext-Titel (z. B. „Spot-Chat <Name>"), Aktionen **Senden / Noch mal / Abbrechen / Bearbeiten**
  (Bearbeiten = Text ins Feld statt senden). Vorbestehender Feldtext gedimmt sichtbar.
- Sprachvariante nach Browser/Locale: AT → Österreichisch, CH → Schwiizerdütsch.
- Web-Quelle: `web/src/components/MicButton.tsx` (im Chat + Feedback-Widget). Commits u. a.
  `281389f` `df125f1` `2ab181d` `011df7c` `a4199fd` `5eb428b` `ef6c4bf` `4e4d231` `09cfe29`.
- Port: eigenständige native Umsetzung (Mikro-Permission, Recognizer-Lifecycle) — kein Web-Code
  wiederverwendbar, nur UX/Buttons/Wording spiegeln.

### ☐ 1.4 Chat: eigene Nachrichten bearbeiten & löschen (< 1 h)  · Server bereit ✅
Long-Press (mobil) bzw. Hover (Desktop) → Bearbeiten/Löschen-Icons; nur eigene, < 1 h alt.
- Endpoints in `api/chat.py`. Android hat bisher nur den **I18n-String**, keine Funktion.
- Web-Quelle: `web/src/pages/Chat.tsx`. Commits: `4c2cc96` `ed26810` `13b4d10` `0c752d0`.
- Weitere Chat-Feinheiten zum Mitnehmen: nur letzte **100** Nachrichten anzeigen (`63cb9ba`),
  beim Spot-Wechsel ans Ende scrollen (`4ce3c08`), Auswahl **„Alle Spot-Chats"** — jeder darf in
  jeden Spot-Chat schauen (`7e79eff`).

### ☐ 1.5 Verknüpfte Konten / Fremd-Import (Polar / COROS / Suunto / Strava)  · Server bereit ✅
Eigene Seite **„Verknüpfte Konten"** mit OAuth-Verknüpfung + Import fremder Trainings als Sessions.
- **Polar** AccessLink: LIVE (verknüpfen + Trainings importieren). **COROS**/**Suunto**: gebaut,
  credential-gated (erscheinen erst nach Freigabe). **Strava**: schlafend/gated (nicht weiterverfolgen).
- OAuth läuft über Web-Redirect (`/api/auth/oauth/...` bzw. AccessLink-Flow) → nativ per
  In-App-Browser (`ASWebAuthenticationSession` iOS / Custom Tabs Android) anstoßen.
- Web-Quelle: eigene Accounts-Seite. Commits: `88844be` `757447c` `87ddbe4` `4fa890a`
  `01b361c` `18e2f20` `e181647`.
- Port: „Verknüpfte Konten"-Screen + Import-Button (mobil), Status-Badges je Provider.

### ☐ 1.6 Home: Willkommens-Banner + Community-Stats-Leiste
- Community-Bereich zeigt oben dauerhaft eine **Stats-Leiste** (Foiler / Spots / Sessions / Pumps),
  Endpoint dafür existiert (`f593070`). Wording „Pumpfoiler" (nicht „Foiler").
- Home-**Willkommens-Banner** inkl. Startdatum (23. Juni 2026).
- **Rekord-Kacheln** zeigen das Datum des Rekords.
- HomeScreen/HomeView existieren nativ → nur Banner + Stats-Leiste + Rekord-Datum ergänzen.
- Commits: `dedf854` `953fb11` `6e7d786` `dfc968e` `8e8fd0d` `c0aecbb` `9ada8ff`.

---

## 2. Mittlere Features / Verfeinerungen (prüfen & übernehmen)

### ☐ 2.1 Session-Detail: Play-Animation der Strecke
Track wird abspielbar animiert (verfeinert, mit Lauf-Startzeit in der Tabelle).
Commits: `87aaaaa` `7db0b55`. Web: `SessionDetail.tsx`.

### ☐ 2.2 Verlauf: Entwicklungs-Animation je Spot
Fixer Karten-Ausschnitt, alle Sessions des Spots, **globale** min/max-Speed-Skala (keine Ghost-Linien).
Commits: `b37a21c` `43cfcc5`. Web: `Verlauf.tsx`.

### ☐ 2.3 Foiling-Distanz < 1 km in Metern
Formatierung: `0.02 km` → `17 m`. Commit `9c51f52`. Kleiner, aber überall spiegeln.

### ☐ 2.4 Track neutral-grau bei Accel-Session ohne erkannte Läufe
Statt speed-farbig (kein irreführendes Signal). Commit `443b936`.

### ☐ 2.5 Tap-to-Label — Mehrfach-Takes + Konsens + Triage  · Server bereit ✅
`LabelingScreen`/`LabelingView` existieren nativ, aber älter. Neu in Web/Server: mehrere Durchläufe
(Takes) + Konsens via Kreuzkorrelation, Plausibilitäts-Triage (Scorer + Badge), Sub-Sekunden-Präzision.
Commits: `550fdf7` `843b58c` `8ebf873` `edc9a05`. **Niedrige Prio** (R&D-Tool).

### ☐ 2.6 Foils / Uhren-Discovery
„Meine Foils" mit Subzeile der gewählten Foils (`20f5527`); eigene Uhren/Verknüpfungen blau
hervorheben (`f0e7875`); Plattform-Übersicht auf der Profil-Seite (`c82641f`).

### ☐ 2.7 Sessions-Liste-Verhalten (prüfen — evtl. teils schon nativ)
Default-Scope **„Alle"** (`7d6c04e`); Zurück behält Scope/Filter (`2739bb6`); Löschen leert
Listen-Cache (`5e8106f`); zuletzt angesehene Session scrollen/highlighten (`8eeaeee` `30d8f79` `682732f`).

---

## 3. Schon nativ erledigt (nur zur Kontrolle — nicht erneut bauen) ✅
- **Accel / „auch GPS-only"-Umschalter** (mit On-Foil) — `612a36c` explizit web+android+ios.
- **Records/Accel-Toggle** (zwei Buttons, aktiver markiert) — `6e49e29`.
- **Session-Handling**: Sliding-Token-Refresh + Auto-Logout bei 401 — nativ `d341884`/`f499dd6`.
- **Garmin-Pairing** (beide Wege) + Versionsanzeige — nativ `b829c19`/`4cd957a`.
- **In-App-Kontolöschung**, **Home-Dashboard**, **Compare**, **Community-Records/Leaderboards** — vorhanden.
- **Brand-Icons/Splash/Launch** — heute erledigt (siehe `assets-master-logo-system`-Memory).

---

## 4. Web-only — NICHT nativ nachbauen 🌐
- **PWA-Mechanik**: Build-Stempel + Update-Banner „Update auf Version xyz", autoUpdate-SW,
  Update-Spinner-Fallback (`12b346f` `417349c` `74139fc` `a9606f6` `67b2a07`). Native = Store-Updates.
- **Safari/Browser-Chrome**: Titelleiste cyan via body-Hintergrund (macOS 26) (`84b1832` `ab2908a` `bfaaf96`).
- **Safe-Area-Insets** (Notch/Home-Indicator) (`8547e87` `833dca4`) — native Layouts lösen das selbst.
- **SEO**: robots.txt + sitemap.xml (`f96e598`).
- **Landing-/Marketing-Seite**: Hero-Hintergrundvideo, Promo-Video-Slider vom YouTube-Kanal,
  Store-Badges, Uhren-Matrix, „inkl. Apple Watch/Wear" (`0bca6fb` `abf6516` `c06dc00` `f868e2e`
  `1ab0569` …). App ist post-login → keine Landing.
- **Impressum/Datenschutz**-Texte (`e86cb04` `f19704e` `18da14c`).
- **Admin-UI**: Spots einsehen/mergen/umbenennen, „Zuletzt aktiv", User-Aktionen hinter Toggle
  (`135270b` `80fa06b` `ac63c35`). Admin bleibt Web.
- **spot_id-Umstieg**: PWA nutzt jetzt `spot_id` (Navigation/Karte), Server kanonisiert id↔name für
  App-Kompat. Apps können **vorerst namensbasiert** bleiben; spot_id-Adoption später (Trigger:
  App-Version-Header). Ufer-Venue-Name bevorzugt + Gewässer-Zusatz (`2768b3d` `83f193f`).

---

## 5. Optional / Geschmack
- **i18n-Zuwachs**: echtes Schwiizerdütsch (`gsw`, 195 Keys), Wienerisch (`de-AT`), fr/it/es-Lücken
  (`a6c933f` `a5dfcce` `8e4c5a9` …). Native haben eigene `Loc.swift` / `I18n.kt` — nur bei Bedarf
  nachziehen; „gut genug" ohne Muttersprachler-Review.

---

## Vorgeschlagene Reihenfolge
1. **1.1 Share** (viel Sichtbarkeit, Server fertig, wenig App-Logik — reines Sheet + Konfig).
2. **1.4 Chat Edit/Delete** (klein, Server fertig, Android-String existiert schon).
3. **1.6 Home-Banner + Stats** (klein, Endpoint da).
4. **1.2 Merge** (Compare existiert nativ → andocken).
5. **1.5 Verknüpfte Konten** (OAuth-In-App-Browser-Flow).
6. **1.3 Diktat** (größter native-spezifischer Aufwand, plattformeigene Speech-APIs).
7. Rest aus §2 nach Bedarf.
