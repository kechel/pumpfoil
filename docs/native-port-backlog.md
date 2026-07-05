# Native-Port-Backlog: PWA → iOS / Android

Alles, was seit dem letzten Phone-App-Release (**2026-06-28**, iOS 1.1.0 + Android Phone 1.1.x /
Wear, Store-Review) in der **PWA (`web/`)** dazukam und in die nativen Phone-Apps
(`watch-apple/Sources-iOS/` = SwiftUI, `android/app/` = Compose) übernommen werden soll.

**Legende:** ☐ offen · ✅ schon nativ · 🌐 Web-only (nicht portierbar/nicht sinnvoll) ·
**Server bereit?** = API/Endpoint existiert schon, nativ fehlt nur die UI.

Detail zu jedem Punkt: `git show <hash>`. Stand der Erhebung: 2026-07-05.

> **Nach Jans Review (2026-07-05) betont:** App-Update-Hinweis auch **nativ** (§1.7),
> **alle Übersetzungen komplett** übernehmen (§2, wichtig), **spot_id-Umstellung** nicht
> vergessen (§3), und die nativen Ansichten **so schön wie die PWA** machen — bis ins Detail
> (§4, durchgehend). Ordentlich, mit Zeit.

---

## 1. Große Features (fehlen auf iOS **und** Android) — Hauptarbeit

### ✅ 1.1 Social-Share / teilbare Session-Card  · Server bereit ✅  — Android+iOS gebaut
Umgesetzt: Share-Button in Session-Detail (nur eigene, mit Track), Konfig-Sheet (Titel, Track an/aus,
Farbmodus cyan/speed/hr, Hell/Dunkel-Blau, Stats-Auswahl), Live-Vorschau, System-Share-Sheet,
Default-Speicherung in `settings.share`. **Offen (Follow-up §4):** Foto-Hintergrund mit Pinch/Pan
(Web komponiert lokal per Canvas; nativ noch nicht — aktuell bg=navy).
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

### ✅ 1.2 Sessions zusammenführen (Merge)  · Server bereit ✅  — Android+iOS gebaut
Umgesetzt: In **Compare** neben „Vergleichen" ein **Zusammenführen**-Button (≥2 gewählt; Server
prüft same-spot/on-foil, Fehlermeldung inline) → öffnet die neue Session. **Vorschlags-Banner** oben
in der Sessions-Liste (heutige Kandidaten) → tippt in Compare **vorausgewählt**. **Un-Merge** unten in
der Session-Detail (Besitzer, wenn `merged_count>0`). Endpoints merge/unmerge/merge-suggestions.
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

### ✅ 1.3 Sprach-Diktat im Chat  — Android+iOS gebaut
Umgesetzt: Mikro-Button in der Chat-Eingabe → **Vollbild-Diktat** (Kontext-Titel, „Sprich jetzt …",
Diktattext **fett + brand-blau**, vorbestehender Text gedimmt) mit Aktionen **Abbrechen / Noch mal /
Bearbeiten / Senden**. Spracherkennung nativ: Android `SpeechRecognizer` (Live-Partials, RECORD_AUDIO-
Permission + `<queries>`), iOS `SFSpeechRecognizer`+`AVAudioEngine` (Info.plist: Mikro + Speech-Usage,
iOS-16-kompatible Permission-API). Locale folgt der App-Sprache inkl. AT (de-AT) / CH (de-CH).
Android compile-verifiziert. **Offen (optional):** Diktat auch im Feedback-Widget (nur Chat portiert).
Web nutzt die **Web Speech API**; nativ **plattformeigene** APIs:
iOS `SFSpeechRecognizer` + `AVAudioEngine`, Android `SpeechRecognizer`.
- Vollbild-Overlay (weiche Brand-Farben, Diktattext fett + brand-blau), **Live-Vorschau**,
  Kontext-Titel (z. B. „Spot-Chat <Name>"), Aktionen **Senden / Noch mal / Abbrechen / Bearbeiten**
  (Bearbeiten = Text ins Feld statt senden). Vorbestehender Feldtext gedimmt sichtbar.
- Sprachvariante nach Locale: AT → Österreichisch, CH → Schwiizerdütsch.
- Web-Quelle: `web/src/components/MicButton.tsx` (im Chat + Feedback-Widget). Commits u. a.
  `281389f` `df125f1` `2ab181d` `011df7c` `a4199fd` `5eb428b` `ef6c4bf` `4e4d231` `09cfe29`.
- Port: eigenständige native Umsetzung (Mikro-Permission, Recognizer-Lifecycle) — kein Web-Code
  wiederverwendbar, nur UX/Buttons/Wording spiegeln.

### ✅ 1.4 Chat: eigene Nachrichten bearbeiten & löschen (< 1 h)  · Server bereit ✅  — Android+iOS gebaut
Umgesetzt: Long-Press (Android) / Kontextmenü (iOS) auf eigene, < 1 h alte Nachrichten →
Bearbeiten (Dialog) / Löschen; Hinweistext unter dem Chat; Chat lädt jetzt 100 statt 30.
Server: PUT-Alias zu PATCH ergänzt (Android HttpURLConnection kann kein PATCH).
Long-Press (mobil) bzw. Hover (Desktop) → Bearbeiten/Löschen-Icons; nur eigene, < 1 h alt.
- Endpoints in `api/chat.py`. Android hat bisher nur den **I18n-String**, keine Funktion.
- Web-Quelle: `web/src/pages/Chat.tsx`. Commits: `4c2cc96` `ed26810` `13b4d10` `0c752d0`.
- Weitere Chat-Feinheiten zum Mitnehmen: nur letzte **100** Nachrichten anzeigen (`63cb9ba`),
  beim Spot-Wechsel ans Ende scrollen (`4ce3c08`), Auswahl **„Alle Spot-Chats"** — jeder darf in
  jeden Spot-Chat schauen (`7e79eff`).

### ✅ 1.5 Verknüpfte Konten / Fremd-Import (Polar / COROS / Suunto)  · Server bereit ✅  — Android+iOS gebaut
Umgesetzt: eigener „Verknüpfte Konten"-Screen (Profil → Eintrag) mit Provider-Karten. Status je Provider
(`/status`), **Verbinden** öffnet die OAuth-URL (`/connect`) im In-App-Browser (Android ACTION_VIEW /
iOS SFSafariViewController) → bei Rückkehr Status neu laden; **Importieren** (`/sync`, Polar+Suunto),
**Trennen** (`DELETE`). COROS ist push-basiert → kein Import-Button, Hinweis „kommt automatisch".
Nicht konfigurierte Provider erscheinen als „Bald verfügbar". accounts.*-Keys (7 Sprachen).
**TODO Jan (kein Code):** COROS/Suunto sind credential-gated → echtes End-to-End-Testen erst nach Freigabe.
Eigene Seite **„Verknüpfte Konten"** mit OAuth-Verknüpfung + Import fremder Trainings als Sessions.
- **Polar** AccessLink: LIVE (verknüpfen + Trainings importieren). **COROS**/**Suunto**: gebaut,
  credential-gated (erscheinen erst nach Freigabe). **Strava**: schlafend/gated (nicht weiterverfolgen).
- OAuth läuft über Web-Redirect (`/api/auth/oauth/...` bzw. AccessLink-Flow) → nativ per
  In-App-Browser (`ASWebAuthenticationSession` iOS / Custom Tabs Android) anstoßen.
- Web-Quelle: eigene Accounts-Seite. Commits: `88844be` `757447c` `87ddbe4` `4fa890a`
  `01b361c` `18e2f20` `e181647`.
- Port: „Verknüpfte Konten"-Screen + Import-Button (mobil), Status-Badges je Provider.

### ✅ 1.6 Home: Willkommens-Banner + Community-Stats-Leiste  · Server bereit ✅  — Android+iOS gebaut
Umgesetzt: schließbarer Willkommens-Banner auf Home (Intro + Stats-Satz mit fett/cyan Zahlen,
`foil_banner_v1`), dauerhafte Community-Stats-Leiste oben im Community-Bereich (gleiche Zahlen),
Rekord-Kacheln zeigen jetzt das Datum des Rekords. Endpoint `/api/community/stats`.
- Community-Bereich zeigt oben dauerhaft eine **Stats-Leiste** (Foiler / Spots / Sessions / Pumps),
  Endpoint dafür existiert (`f593070`). Wording „Pumpfoiler" (nicht „Foiler").
- Home-**Willkommens-Banner** inkl. Startdatum (23. Juni 2026).
- **Rekord-Kacheln** zeigen das Datum des Rekords.
- HomeScreen/HomeView existieren nativ → nur Banner + Stats-Leiste + Rekord-Datum ergänzen.
- Commits: `dedf854` `953fb11` `6e7d786` `dfc968e` `8e8fd0d` `c0aecbb` `9ada8ff`.

### ✅ 1.7 App-Update-Hinweis in den nativen Apps  — Server + Android+iOS gebaut
Umgesetzt: Server `GET /api/app/latest?platform=ios|android` (`app/api/appmeta.py`, Werte MANUELL
gepflegt — `latest` leer ⇒ kein Hinweis). Home zeigt nicht-blockierenden Banner „Update verfügbar
· Version x" + Button zum Store, wenn die Store-Version neuer als die eigene Bundle-Version ist
(semantischer Vergleich). **TODO Jan:** in `appmeta.py` nach jedem Store-Review `latest` + echte
`store_url`/App-ID setzen (aktuell Platzhalter). `min_supported` optional für Hard-Gate (Feld da,
Hard-Gate-UI noch nicht — bei Bedarf später).
Wie der PWA-Update-Banner, aber für iOS/Android: App fragt beim Server, ob eine **neuere Version**
im Store ist, und zeigt einen **nicht-blockierenden** Hinweis („Neue Version verfügbar → im Store
aktualisieren"). Kein Zwang, nur ein zusätzlicher Hinweis.
- **Wichtig (Jans Vorgabe):** Der Server kennt die Store-Version **nicht automatisch** — die
  neueste freigegebene Version wird **von Hand gesetzt**, erst **nachdem** der Store-Review durch ist
  (sonst Hinweis auf eine noch nicht verfügbare Version).
- Serverseitig neu: z. B. `GET /api/app/latest?platform=ios|android` → `{ latest: "1.1.8",
  min_supported: "1.1.0", store_url: "…" }`, gepflegt in einer kleinen Config/Tabelle
  (Analog zum Garmin-Update-Gate `88ad1f6`, aber für die Phone-Apps). Werte manuell nach jedem Release.
- App vergleicht mit der eigenen Bundle-Version (`CFBundleShortVersionString` / `versionName`) und
  blendet den Hinweis ein (optional Hard-Gate über `min_supported`, wenn eine Version wirklich raus muss).
- Web-Analogie (nur Referenz, nicht 1:1): `12b346f` `67b2a07`.

---

## 2. Übersetzungen — vollständig übernehmen (WICHTIG)  — ✅ Kern-Sync gebaut
**Stand:** Alle native Keys (Android 262 / iOS 257) haben strukturell **alle 7 Sprachen**
(row()/r()-7-Tupel). Für die **~106 Keys mit demselben Namen wie im Web** wurden die Zellen
**autoritativ aus den Web-Locales** gesynct (Skript, Android compile-verifiziert, iOS-Integrität
per Parser geprüft): **Android 51 Keys / 188 Zellen**, **iOS 50 Keys / 190 Zellen** aktualisiert —
v. a. **de-AT jetzt echt Wienerisch** (war 25× Hochdeutsch-Kopie), gsw/fr/it/es korrigiert.
**Offen (manuell, kein Blocker):** ~150 **native-only** Keys (Screens ohne Web-Pendant) haben zwar
alle 7 Sprachen, deren gsw/de-AT sind aber teils Hochdeutsch-nah — feiner Dialekt-Schliff wäre
Handarbeit ohne Web-Vorlage. Als laufende Politur mitziehen, wenn man die Screens ohnehin anfasst.

Ursprüngliche Vorgabe (Referenz):
- **`gsw` (echtes Schwiizerdütsch)** — 195 nutzer-sichtbare Keys (`a6c933f` `f7b7dfe`).
- **`de-AT` (Wienerisch)** — öffentliche + interne Touchpoints (`97d828a` `aaf2f6f` `c51f472`
  `a5dfcce` `4a24111` inkl. Spracherkennungs-Locale AT/CH).
- **`fr` / `it` / `es`** — nachgezogene nutzer-sichtbare Lücken (`8e4c5a9` `f1f1e3a` `da084be`).
- **`en`** — fehlende Keys ergänzt (`da084be`).
- Quelle der Wahrheit: `web/src/i18n*` (alle Keys + Sprachen). Native Tabellen: iOS `Loc.swift`,
  Android `I18n.kt` → **auf Vollständigkeit gegen die Web-Keys abgleichen** und fehlende Sprachen/Keys
  ergänzen. Ziel: gleiche Sprachliste + gleiche Keys wie Web, nichts fehlt.
- Zusätzlich: Diktat-/Spracherkennungs-Locale nativ passend zur App-Sprache wählen (AT/CH-Varianten).

---

## 3. spot_id-Umstellung in den Apps  · Server bereit ✅ (kanonisiert id↔name)  — ✅ additiv gebaut
**Umgesetzt (additiv):** `spot_id` + `place_water` in die nativen Modelle (SessionDetail, SpotMapItem);
Gewässer wird als Zusatz-Label unter dem Ort in der Session-Detail angezeigt (beide Apps). Der
**volle Nav-Umstieg auf spot_id bleibt bewusst aufgeschoben** (Server kanonisiert id↔name, Apps laufen
namensbasiert weiter → kein Bruch; Umstieg getriggert durch App-Adoption, siehe Memory `spot-name-overrides`).
 Referenz-Original:
Nicht vergessen: die PWA nutzt jetzt **`spot_id`** statt Spot-Name für Navigation/Karte/Chat-Scope.
Der Server kanonisiert id↔name (App-Kompat), aber die Apps sollen mitziehen.
- Web-Quelle: `83f193f` (Navigation auf spot_id), `2768b3d` (Ufer-Venue-Name bevorzugt +
  Gewässername als Zusatz-Label).
- Nativ zu tun: Spot-Referenzen (Sessions-Scope, Spot-Chat-Scope, Karten-/Spot-Auswahl,
  Homespot in Settings) additiv auf `spot_id` umstellen; Anzeige = Ufer-Venue-Name (+ Gewässer
  als Zusatz). Namensbasiert als Fallback behalten, bis alle Clients umgestellt sind.
- Modelle/DTOs: `spot_id` in die nativen Session-/Spot-Modelle aufnehmen (Server liefert es additiv).

---

## 4. UI-Parität & Politur — den PWA-Look nativ nachbauen (DURCHGEHEND)
Jan: die nativen Ansichten sind noch nicht so hübsch wie die PWA. Ist viel aufwendiger als im Web —
**trotzdem ordentlich, mit Zeit, bis ins Detail.** Nicht nur Funktion, sondern **Look & Feel**:
kleine farbige Icons, saubere Ausrichtung, gleiche Abstände, Light/Dark sauber.

**Vorgehen:** Screen für Screen die PWA neben die native App legen und angleichen. Design-Sprache
zentral verankern (Theme/Design-Tokens), dann pro Screen anwenden.

**Screen-Audit-Fortschritt (penibler 1:1-Abgleich, Emulator+Playwright):**
- ✅ Login (branded), Impressum/Datenschutz, Home (Reihenfolge/Kacheln/Chat-Button/letzte Sessions/Feedback),
  Farbcodes (hell = `#0e7490`, dunkel = `#22d3ee`), Bottom-Nav (eigene Bar, aktives Icon+Label cyan).
- ✅ **Foilers/Community** (Android verifiziert, iOS gespiegelt): Reihenfolge jetzt wie PWA — Stats →
  **Zeitraum-Filter** (Heute/10 T/30 T/1 J/Allzeit) + **Accel/alle-Umschalter** → **Community-Rekorde-Grid**
  (Wert cyan + Avatar/Name/Datum/Spot, klickbar) → Neueste Medien → Bestenliste (mit Einheit) → Best
  bewertet → **Spots** (eigene Spots + Suche, je Spot ein Rekord-Grid). Generischer „alle Sessions"-Feed
  entfernt (nicht in PWA), separater Records-Screen entfällt (inline). Chips in Marken-Cyan statt M3-Lavendel.
  API um `accel_only`/`period` erweitert; i18n-Keys (period/leader/unit/spots) in allen 7 Sprachen.
- ✅ **Sessions** (Android verifiziert, iOS gespiegelt): Scope-Chips (Meine/Homespot/Alle) jetzt in
  Marken-Cyan + **Accel/alle-Umschalter** rechts; für „Meine" **Pumpfoil/Aussortiert-Filter** +
  **Monats-Dropdown** (mit Anzahl); Spot-Scope zeigt **Spot-Wetter** (HomeWeatherCard); „— Ende —"-Fuß;
  Monats-Leerzustand. API um month/filter/accel_only (sessions, sessionMonths, communitySessions) erweitert;
  i18n (7 Spr.): sessions.filterPump/filterOther/allMonths/noneMonth/listEnd, all.allSpots.
  Offen (klein): ♥-HR wird als rotes Emoji gerendert (Web nutzt Slate-HeartPulse-Icon) — Politur später.
- ☐ Session-Detail → Verlauf → Spots → Chat → Profil → Einstellungen (in Arbeit).

**Design-Tokens (aus der PWA):**
- Brand-Cyan **`#22d3ee`** (hell) / **`#0e7490`** (dunkel), Navy **`#020617`**. **Keine Verläufe.**
- Konsistente Card-Radien/Schatten, einheitliche vertikale Abstände, Button-Höhen **gleich**.
- Light- **und** Dark-Mode müssen beide sauber lesbar sein (im Web gab es viele Kontrast-Fixes).

**Konkrete Detail-Checkliste (aus den Web-Politur-Commits — als Zielbild):**
- ✅ Session-Detail: **Aktions-Icons in Brand-Cyan** (Share/Label/Trim), **Fake = Amber**,
  **Unangemessen = Rot**, Löschen = Rot (Android; iOS-Toolbar ist per Default Accent + destructive-Rolle).
  Gebaut, Android compile-verifiziert.
- ☐ Session-Badges **einheitlich hoch + horizontal ausgerichtet** (flex-Row, items-center) (`f97884a`).
- ☐ Foto-Vorschau behält Seitenverhältnis (Querformat volle Breite, alle gleich hoch).
- ☐ Community/„nur ansehen"-Badge im Light-Mode lesbar (`e03eb61`); Lightbox-Herz (`dfc968e`);
  Wassertemperatur-Farbe (`1180178`) — generell **Light-Mode-Kontraste** überall prüfen.
- ☐ Reiche **Session-Karten**: Avatar (deterministische Farbe aus User-ID) / Stats /
  Track-Vorschau / Thumbnail — auf PWA-Niveau.
- ☐ **„User #<id>"-Fallback** für Nutzer ohne Anzeigenamen (Liste/Community/Chat), stabil & eindeutig.
- ☐ Header/Logo: horizontales Lockup (3 versetzte Wellen), nicht verzerrt; Theme-Umschalter-Platzierung.
- ☐ Community-Stats-Box schlank, unter dem Titel (siehe §1.6) — Abstände wie Web (`6e7d786` `80b7cb1`).
- ☐ Track-Farbmodi (Speed/Puls/Pump) + Glättung; Pump-Marker default aus + klein; neutral-grau bei
  Accel-Session ohne Läufe (`443b936`).
- ☐ Distanz-/Zahl-Formatierung wie Web (Foiling-Distanz < 1 km in **Metern**, `9c51f52`).
- ☐ Leere Zustände, Lade-Indikatoren, Scroll-/Highlight-Verhalten (zuletzt angesehene Session).
- ☐ Icons: **SVG-basiert / vektor**, kein Material-Default-Look, wo die PWA eigene Icons nutzt.
- ☐ Play-Animation der Strecke (§5.1) und Verlauf-Animation (§5.2) auch visuell wie Web.

**Referenz-Screens zum 1:1-Abgleich:** Home, Community(+Records), Sessions(+Scope/Filter),
Session-Detail, Verlauf, Spots, Chat, Foils/Rechner/Stats, Profil, Einstellungen, Login.

---

## 5. Mittlere Features / Verfeinerungen (prüfen & übernehmen)
> **Loop-Stand:** Die restlichen Punkte hier (Play-/Verlauf-Animation, voller visueller Feinschliff)
> sind bewusst **noch offen** — sie brauchen Geräte-/Sicht-Feedback und (iOS) einen Xcode-Build zur
> Verifikation, den ich hier nicht habe. Distanz-in-Metern (`<1 km → m`) ist auf beiden Apps bereits
> vorhanden (`fmtDist`). Rest wenn du live drüberschauen kannst.

### ☐ 5.1 Session-Detail: Play-Animation der Strecke
Track wird abspielbar animiert (verfeinert, mit Lauf-Startzeit in der Tabelle).
Commits: `87aaaaa` `7db0b55`. Web: `SessionDetail.tsx`.

### ☐ 5.2 Verlauf: Entwicklungs-Animation je Spot
Fixer Karten-Ausschnitt, alle Sessions des Spots, **globale** min/max-Speed-Skala (keine Ghost-Linien).
Commits: `b37a21c` `43cfcc5`. Web: `Verlauf.tsx`.

### ☐ 5.3 Track neutral-grau bei Accel-Session ohne erkannte Läufe
Statt speed-farbig (kein irreführendes Signal). Commit `443b936`. (Siehe auch §4.)

### ☐ 5.4 Tap-to-Label — Mehrfach-Takes + Konsens + Triage  · Server bereit ✅
`LabelingScreen`/`LabelingView` existieren nativ, aber älter. Neu in Web/Server: mehrere Durchläufe
(Takes) + Konsens via Kreuzkorrelation, Plausibilitäts-Triage (Scorer + Badge), Sub-Sekunden-Präzision.
Commits: `550fdf7` `843b58c` `8ebf873` `edc9a05`. **Niedrige Prio** (R&D-Tool).

### ☐ 5.5 Foils / Uhren-Discovery
„Meine Foils" mit Subzeile der gewählten Foils (`20f5527`); eigene Uhren/Verknüpfungen blau
hervorheben (`f0e7875`); Plattform-Übersicht auf der Profil-Seite (`c82641f`).

### ☐ 5.6 Sessions-Liste-Verhalten (prüfen — evtl. teils schon nativ)
Default-Scope **„Alle"** (`7d6c04e`); Zurück behält Scope/Filter (`2739bb6`); Löschen leert
Listen-Cache (`5e8106f`); zuletzt angesehene Session scrollen/highlighten (`8eeaeee` `30d8f79` `682732f`).

---

## 6. Schon nativ erledigt (nur zur Kontrolle — nicht erneut bauen) ✅
- **Accel / „auch GPS-only"-Umschalter** (mit On-Foil) — `612a36c` explizit web+android+ios.
- **Records/Accel-Toggle** (zwei Buttons, aktiver markiert) — `6e49e29`.
- **Session-Handling**: Sliding-Token-Refresh + Auto-Logout bei 401 — nativ `d341884`/`f499dd6`.
- **Garmin-Pairing** (beide Wege) + Versionsanzeige — nativ `b829c19`/`4cd957a`.
- **In-App-Kontolöschung**, **Home-Dashboard**, **Compare**, **Community-Records/Leaderboards** — vorhanden.
- **Brand-Icons/Splash/Launch** — erledigt (siehe `assets-master-logo-system`-Memory).

---

## 7. Web-only — NICHT nativ nachbauen 🌐
- **PWA-Mechanik**: Service-Worker/autoUpdate, Update-Spinner-Fallback (`417349c` `74139fc`
  `a9606f6`). Der *Hinweis auf eine neue Version* ist dagegen sehr wohl nativ gewünscht → §1.7.
- **Safari/Browser-Chrome**: Titelleiste cyan via body-Hintergrund (macOS 26) (`84b1832` `ab2908a`).
- **Safe-Area-Insets** (Notch/Home-Indicator) (`8547e87` `833dca4`) — native Layouts lösen das selbst.
- **SEO**: robots.txt + sitemap.xml (`f96e598`).
- **Landing-/Marketing-Seite**: Hero-Hintergrundvideo, Promo-Video-Slider vom YouTube-Kanal,
  Store-Badges, Uhren-Matrix, „inkl. Apple Watch/Wear" (`0bca6fb` `abf6516` `c06dc00` `1ab0569` …).
  App ist post-login → keine Landing.
- **Impressum/Datenschutz**-Texte (`e86cb04` `f19704e` `18da14c`).
- **Admin-UI**: Spots einsehen/mergen/umbenennen, „Zuletzt aktiv", User-Aktionen hinter Toggle
  (`135270b` `80fa06b` `ac63c35`). Admin bleibt Web.

---

## Vorgeschlagene Reihenfolge
1. **1.1 Share** (viel Sichtbarkeit, Server fertig, wenig App-Logik — reines Sheet + Konfig).
2. **1.4 Chat Edit/Delete** (klein, Server fertig, Android-String existiert schon).
3. **1.6 Home-Banner + Stats** + **1.7 Update-Hinweis** (beide klein; Update-Endpoint zuerst bauen).
4. **§2 Übersetzungen** komplett abgleichen (durchziehen, wichtig).
5. **1.2 Merge** (Compare existiert nativ → andocken).
6. **§3 spot_id** additiv umstellen.
7. **1.5 Verknüpfte Konten** (OAuth-In-App-Browser-Flow).
8. **1.3 Diktat** (größter native-spezifischer Aufwand, plattformeigene Speech-APIs).
9. **§4 UI-Politur** begleitend zu jedem Screen, den man ohnehin anfasst — plus ein dedizierter
   Feinschliff-Durchgang am Ende.
