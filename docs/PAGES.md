# Web-PWA — Seiten-Index

Alle Routen der React-PWA (`web/src/pages/`, Router in `web/src/main.tsx`) mit Kurzbeschreibung.
Ergänzt [`UX-IA.md`](UX-IA.md) (Informationsarchitektur). Bei neuer Route hier eine Zeile ergänzen.

`/` ist kontextabhängig: **Gast → Landing**, **eingeloggt → PersonalHome** (`RootRoute` in `main.tsx`).

## Öffentlich (ohne Login, außerhalb der App-Shell)

**Sprach-Adressen:** die oeffentliche Startseite gibt es unter `/` (Deutsch, zugleich
`x-default`) und `/<code>/` fuer die uebrigen 16 Sprachen — `/en/`, `/fr/`, `/ja/` usw. Die
Sprache kommt aus der Adresse (`i18n.langAusPfad`), `hreflang` steht in `index.html` und in der
`sitemap.xml`.

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/` (Gast) | `Landing.tsx` | Öffentliche Startseite: erklärt, wofür Pumpfoil da ist. Nötig für die Google-OAuth-Prüfung (Homepage muss den App-Zweck ohne Anmeldung zeigen). |
| `/login` | `Login.tsx` | Login + Registrierung, OAuth (Google/Apple). Link zum Impressum. |
| `/reset` | `Reset.tsx` | Passwort-Reset. |
| `/why-pumpfoil`, `/<code>/why-pumpfoil` | `Warum.tsx` | **Warum pumpfoil.org?** — was das Projekt ausmacht (Community, freie Software, Transparenz, offene Auswertungen), öffentlich, 18 Sprachen (`why.*`). Verlinkt im Menü über dem Impressum, auf der Startseite (oben unter den Plattformen, Abschluss, Fuß) und im Gast-Fuß; hreflang + sitemap.xml je Sprache. |
| `/<code>/nerd-analysen[-2…6]`, `/<code>/impressum` | dieselben Seiten | **Sprach-Adressen** (02.11.2026): Startseite, Warum, Nerd 1–6 und Impressum gibt es je Sprache unter `/<code>/…` (Deutsch ohne Präfix), mit Canonical + hreflang (`useSprachSeite`, `SPRACH_SEITEN` in `lib/seo.ts`) und je einem Eintrag in `public/sitemap.xml`. Die Startseite verlinkt in ihrer Sprache. Systemarchitektur nur Deutsch, eine Adresse. |
| `/impressum` | `Impressum.tsx` | **Impressum + Datenschutzerklärung** (rechtl. Kontakt/Anbieterkennung) — dient auch als Support-/Kontakt-Anlaufstelle. |
| `/s/:token` | `PublicSession.tsx` | Öffentlicher **Teilen-Link** einer Session, read-only, ohne Login (eigene Kopf-/Fußzeile; rendert `SessionDetail` im Public-Modus). |

## App (eingeloggt, App-Shell mit Menü/Header/Footer)

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/` (eingeloggt), `/home` | `PersonalHome.tsx` | Persönliche Startseite mit Reitern (`?tab=`, seit 02.11.2026): Übersicht (letzte Sessions, Hinweise, Freunde mit letzter Session) · Rekorde · Team · Spots (seit 04.11.2026: zweite Zeile = eigene Spots, Homespot vorgewaehlt, „Alle (n)" rechts mit Kacheln je Spot, `?spot=<id>|alle`; darunter die Spot-Reiter, `?stab=`) · Profil (letzter Reiter, die eigene `/foiler`-Seite eingebettet, seit 04.11.2026) · Stats (zweite Reiterzeile `?sub=`: Verlauf, Kennzahlen = Jahresbilanz/Start-Erfolgsquote/Carves/Wenden & Halsen, Lage des Bretts). Startet immer mit der Übersicht. |
| `/community` | `Home.tsx` | Community mit Reitern (`?tab=`, seit 02.11.2026): **Rekorde & Bestenliste** (Kacheln + Bestenliste, eigene Zeile unter Platz 10, als Bild teilen), **Medien** (Fotos/Videos, Best bewertet, Social-Feed, Uhr-Layouts), **Teams & Events**. Zeitraum/Sportart/Foil/Liste stehen in der Adresse (`period`, `sport`, `band`, `lb`). |
| `/verlauf` | — | Leitet seit 02.11.2026 auf `/?tab=stats` um (Reiter „Stats" › „Verlauf" in Home, `History.tsx` eingebettet). |
| `/sessions` | `Sessions.tsx` | „Meine Sessions": Liste, Merge-Vorschläge (heutige Sessions ≤1 h), Session-Transfer annehmen. Reiter Meine · Freunde · Alle. Mit `?spot=` die **Spot-Seite** mit Reitern Rekorde (Tabelle) · Sessions · Heatmap · Wetter · Beschreibungen (seit 02.11.2026, `SpotBereich`; auch Reiter „Spots" auf Home). |
| `/sessions/:id` | `SessionDetail.tsx` | Einzel-Session: Karte, Analyse (Runs/Gleit/Pumps), Video, Teilen-Link, Bearbeiten. |
| `/sessions/:id/label` | `Labeling.tsx` | Pump-**Tap-to-Label** synchron zum Video (Ground Truth fürs Pump-Modell). |
| `/import` | `Import.tsx` | Erklärt den Garmin-Export und bietet den FIT/ZIP-Upload. |
| `/alle-sessions` | `AllSessionsRedirect.tsx` | Redirect für Alt-Links/Bookmarks. |
| `/foiler/:id` | `Foiler.tsx` | **Oeffentliche Profilseite eines Foilers** (Login noetig, nicht fuer Suchmaschinen): Anzeigename, Dabei-seit, Homespot, bis zu drei benutzte Uhren, drei meistgenutzte Foils, Rekorde der letzten 12 Monate. Was erscheint, entscheidet der Server aus `settings.public_profile` (`/api/community/foiler/<id>`); 404 bei hidden/blocked/unter 13/abgeschaltet. **Freunde** (seit 15.10.2026) sehen alles, auch eine abgeschaltete Seite, dazu das Gewicht; Knopf „Freundschaft anfragen“ oben rechts. **Bewusst ohne Sessionliste** (Bewegungsprofil, 04.09.2026). Stand 08.09.2026 **nirgends verlinkt** — Einstieg noch offen. |
| `/spots` | `Spots.tsx` | Reiter Karte · Liste · Routen (seit 02.11.2026; Liste/Routen kamen aus der Community). Karte: Kartenansicht aller Spot-Locations; Marker → Sessions am Spot. Heatmap (30 Tage / 1 Jahr) = Sessions je Rasterzelle, nur die Läufe, für alle gleich, nachts vorgerechnet (`app/heatmap.py`, Timer `foil-heatmap`). |
| `/foils` | `Foils.tsx` | Foil-Katalog: mehrere als „meine" merken, eines als Standard (Stern). |
| `/foil-stats` | `FoilStats.tsx` | Community-Vergleich je Foil: welche Werte mit welchem Material gefahren werden. |
| `/foil-stats/:foilId` | `FoilDetail.tsx` | Ein Foil im Einzelnen: Community-Rekord-Kacheln mit genau diesem Fluegel, darunter die eigenen Sessions damit (laedt beim Scrollen nach). Erreichbar per Klick auf den Foil-Namen in der Tabelle. |
| `/watch-stats` | `WatchStats.tsx` | Community-Vergleich je Uhr-Modell: was mit welcher Uhr gefahren wird. Darunter „Wie gut zeichnen die Uhren auf?“ — Pump-Erkennung, Ortung, Puls und ein Urteil je Modell, gemessen an unseren eigenen Aufnahmen (`/api/app/watch-quality`, Snapshot aus `scripts/uhren-qualitaet.py`; Stand + Datenbasis stehen dabei). |
| `/foil-rechner` | `FoilCalculator.tsx` | Nativer Foil-Rechner: mehrere Foils vergleichen (Kennwerte + theoretische Leistung über Speeds; geportetes Physik-Modul). |
| `/vergleich` | `Compare.tsx` | Mehr-Fahrer-/Session-Vergleich mit Farb-Legende je Fahrer. |
| `/account` | `Account.tsx` | **Uhr einrichten**: Tabs Guide/Connect/Ansichten/Alarm/App/Kompatibilität (Watch-Matrix, Connect-IQ-Download). Von Einstellungen aus verlinkt. |
| `/friends` | `Friends.tsx` | **Freunde verwalten** (15.10.2026, Einstieg: Knopf auf der Profilseite): Freunde, wer davon gerade pumpt (mit Spot), Anfragen an mich, eigene offene Anfragen. Angefragt wird auf `/foiler/:id`. Regeln: `server/app/freunde.py`. |
| `/teams` | `Teams.tsx` | **Meine Teams + Team gruenden** (31.10.2026, Einstieg: Knopf „Team“ auf der Profilseite). Plan/Regeln: `docs/TEAMS.md`, `server/app/teams.py`. |
| `/events` | `EventsAlle.tsx` | **Alle Events** (01.11.2026), endlos scrollend: laufende, kommende, dann vergangene; nur aus oeffentlichen, freigegebenen und eigenen Teams (`GET /api/teams/liste/events/alle?offset=&n=`). Link in der Community-Ueberschrift. |
| `/teams/liste` | `TeamsAlle.tsx` | **Alle Teams** (01.11.2026): alle freigegebenen Teams mit Suche. Die Community-Seite zeigt seitdem keine Teamliste mehr, nur laufende und in den naechsten 3 Tagen beginnende Events (`GET /api/teams/liste/events`) und den Link hierher. |
| `/teams/:slug` | `Team.tsx` | **Teamseite**: Wappen, Bestenlisten mit Zeitraum, Mitglieder (wenn erlaubt), Beitreten-Knopf mit Kleingedrucktem zur Oeffentlichkeit. **Auch fuer Gaeste** (eigener Rahmen in `main.tsx`), dann nur oeffentliche, freigegebene Bestenliste: Rang, Name, Initialen, Wert. Nicht fuer Suchmaschinen. Links auch auf Home neben dem Homespot. |
| `/teams/:slug/verwalten` | `TeamEinstellungen.tsx` | **Verwaltung** (Leitung + Moderatoren): Anfragen mit Spots/Sportarten der Anfragenden, Mitglieder, Events, Einladungslinks mit QR-Code. |
| `/teams/:slug/einstellungen` | `TeamEinstellungen.tsx` | **Grundeinstellungen** (nur Leitung): Freigabe, Auftritt (Name, Adresse, Beschreibung, Wappen, Teambild mit Fokus, Farbe), Beitritt, Sichtbarkeit, Bestenlisten-Editor, Teamspots, sicheres Loeschen. |
| `/teams/:slug/events/:id` | `TeamEventSeite.tsx` | **Ein Event**: Zeitraum, was gemessen wird, Beschreibung und alle Bestenlisten (aktueller Stand, danach Ergebnis). Auch fuer Gaeste bei oeffentlichem Team (Gastform). Die Teamseite zeigt nur kompakte Kacheln, die hierher fuehren. |
| `/teams/:slug/join-<token>`, `/apply-<token>` | `TeamEinladung.tsx` | **Einladungslinks** (direkt Mitglied bzw. Anfrage), mit QR-Code in den Einstellungen. Ohne Konto: Link im localStorage gemerkt, nach Login/Registrierung zurueck (`App.tsx`). |
| `/einstellungen` | `Settings.tsx` | Zentrale Einstellungen (Menue „Einstellungen", Handyleiste „Setup"; am Desktop ueber das Profilbild oben links, seit 04.11.2026): Profil (Name/E-Mail/Avatar), Sprache, Theme, Schriftgröße, PWA-Install, Push-Benachrichtigungen; Einstiege zu Uhr/Foils/Rechner/Konten; App-Build-Info. |
| `/konten` | `LinkedAccounts.tsx` | „Verknüpfte Konten": Import-Integrationen (Polar/COROS/Suunto/…) je als eigene Karte; blendet sich aus, wenn serverseitig nicht konfiguriert. |

## Nerd-/Technik-Seiten (öffentlich, tief)

**Seit 06.09.2026 wirklich öffentlich** — eigene Routen ohne Login (vorher rendert `RootRoute`
Gästen dort die Landing-Page). Sie stehen in der `sitemap.xml`, sind aus der `robots.txt`
heraus und von der Startseite verlinkt.

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/nerd-analysen` | `NerdAnalysen.tsx` | Teil 1: Dual-Watch-Pumpfoil-Experiment (2026-06-27). 7 Sprachen (`nerd1.i18n.ts`). |
| `/nerd-analysen-2` | `NerdAnalysen2.tsx` | Teil 2: Wie die Erkennung funktioniert (Signalverarbeitung/ML hinter Pump-/On-Foil-/Start-Ende-/Gleit-Erkennung). Selbstgezeichnete SVGs. |
| `/nerd-analysen-3` | `NerdAnalysen3.tsx` | Teil 3: zweite Doppeluhr-Messung mit echten Fotos + Mess-Plots (`web/public/nerd3/`, same-origin). 8 Sprachen. |
| `/nerd-analysen-6` | `NerdAnalysen6.tsx` | Teil 6: Pump- und Gleit-Erkennung pg-1 gegen das Brett (`docs/PUMP-GLEIT.md`), freigegeben 24.10.2026. Bilder `web/public/nerd6/` aus `scripts/pumpgleit/nerd6_bilder.py`. 18 Sprachen (`nerd6.i18n.ts`). Verlinkt: Sidebar, NerdNav, Startseite (Tiefe-Inhalte), `llms.txt`. |
| `/systemarchitektur` | `Systemarchitektur.tsx` | Realer Server-Aufbau, prüfbar für IT-Interessierte. Nur Deutsch. **Keine Secrets** (Verfahren/Design, keine Keys/Hosts/IPs). |

## Admin

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/admin` | `Admin.tsx` | Admin-Dashboard: Feedback/Testimonials, News-Banner, Blockierungen, Nutzer/Moderation etc. Nur für Admins. |

## Globale Widgets (keine eigene Route, überall in der App-Shell)

- **FeedbackWidget** (`components/FeedbackWidget.tsx`) — globales Feedback-Formular; landet im Admin-Tab.
- **DmWidget** (`components/DmWidget.tsx`) — 1:1-Direktnachrichten, Floating rechts unten.
- **WelcomeBanner** (`components/WelcomeBanner.tsx`) — DB-getriebener News-Banner (`GET /api/app/news`).

> **Support-/Kontakt-Einstieg** (COROS-/Store-Anforderung): Impressum (`/impressum`) + globales Feedback-Widget + DM.
