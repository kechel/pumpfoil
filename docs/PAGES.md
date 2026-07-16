# Web-PWA — Seiten-Index

Alle Routen der React-PWA (`web/src/pages/`, Router in `web/src/main.tsx`) mit Kurzbeschreibung.
Ergänzt [`UX-IA.md`](UX-IA.md) (Informationsarchitektur). Bei neuer Route hier eine Zeile ergänzen.

`/` ist kontextabhängig: **Gast → Landing**, **eingeloggt → PersonalHome** (`RootRoute` in `main.tsx`).

## Öffentlich (ohne Login, außerhalb der App-Shell)

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/` (Gast) | `Landing.tsx` | Öffentliche Startseite: erklärt, wofür Pumpfoil da ist. Nötig für die Google-OAuth-Prüfung (Homepage muss den App-Zweck ohne Anmeldung zeigen). |
| `/login` | `Login.tsx` | Login + Registrierung, OAuth (Google/Apple). Link zum Impressum. |
| `/reset` | `Reset.tsx` | Passwort-Reset. |
| `/impressum` | `Impressum.tsx` | **Impressum + Datenschutzerklärung** (rechtl. Kontakt/Anbieterkennung) — dient auch als Support-/Kontakt-Anlaufstelle. |
| `/s/:token` | `PublicSession.tsx` | Öffentlicher **Teilen-Link** einer Session, read-only, ohne Login (eigene Kopf-/Fußzeile; rendert `SessionDetail` im Public-Modus). |

## App (eingeloggt, App-Shell mit Menü/Header/Footer)

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/` (eingeloggt), `/home` | `PersonalHome.tsx` | Persönliche Startseite/Dashboard; u. a. Hinweis auf eingehende Session-Übertragungen. |
| `/community` | `Home.tsx` | Community-Feed: neueste Sessions/Medien, Bestwerte/Leaderboards, Community-Stats, PWA-Install-Button. |
| `/verlauf` | `History.tsx` | Persönliche Aggregat-Metriken (Summen/Mittel je Zeitfenster + kumuliert) und Bestwerte. |
| `/sessions` | `Sessions.tsx` | „Meine Sessions": Liste, Merge-Vorschläge (heutige Sessions ≤1 h), Session-Transfer annehmen. |
| `/sessions/:id` | `SessionDetail.tsx` | Einzel-Session: Karte, Analyse (Runs/Gleit/Pumps), Video, Teilen-Link, Bearbeiten. |
| `/sessions/:id/label` | `Labeling.tsx` | Pump-**Tap-to-Label** synchron zum Video (Ground Truth fürs Pump-Modell). |
| `/import` | `Import.tsx` | Erklärt den Garmin-Export und bietet den FIT/ZIP-Upload. |
| `/alle-sessions` | `AllSessionsRedirect.tsx` | Redirect für Alt-Links/Bookmarks. |
| `/spots` | `Spots.tsx` | Kartenansicht aller Spot-Locations; Marker → Sessions am Spot. |
| `/foils` | `Foils.tsx` | Foil-Katalog: mehrere als „meine" merken, eines als Standard (Stern). |
| `/foil-stats` | `FoilStats.tsx` | Community-Vergleich je Foil: welche Werte mit welchem Material gefahren werden. |
| `/watch-stats` | `WatchStats.tsx` | Community-Vergleich je Uhr-Modell: was mit welcher Uhr gefahren wird. |
| `/foil-rechner` | `FoilCalculator.tsx` | Nativer Foil-Rechner: mehrere Foils vergleichen (Kennwerte + theoretische Leistung über Speeds; geportetes Physik-Modul). |
| `/vergleich` | `Compare.tsx` | Mehr-Fahrer-/Session-Vergleich mit Farb-Legende je Fahrer. |
| `/account` | `Account.tsx` | **Uhr einrichten**: Tabs Guide/Connect/Ansichten/Alarm/App/Kompatibilität (Watch-Matrix, Connect-IQ-Download). Von Einstellungen aus verlinkt. |
| `/einstellungen` | `Settings.tsx` | Zentrale Einstellungen: Profil (Name/E-Mail/Avatar), Sprache, Theme, Schriftgröße, PWA-Install, Push-Benachrichtigungen; Einstiege zu Uhr/Foils/Rechner/Konten; App-Build-Info. |
| `/konten` | `LinkedAccounts.tsx` | „Verknüpfte Konten": Import-Integrationen (Polar/COROS/Suunto/…) je als eigene Karte; blendet sich aus, wenn serverseitig nicht konfiguriert. |

## Nerd-/Technik-Seiten (öffentlich, tief)

| Route | Komponente | Was drauf ist |
|---|---|---|
| `/nerd-analysen` | `NerdAnalysen.tsx` | Teil 1: Dual-Watch-Pumpfoil-Experiment (2026-06-27). 7 Sprachen (`nerd1.i18n.ts`). |
| `/nerd-analysen-2` | `NerdAnalysen2.tsx` | Teil 2: Wie die Erkennung funktioniert (Signalverarbeitung/ML hinter Pump-/On-Foil-/Start-Ende-/Gleit-Erkennung). Selbstgezeichnete SVGs. |
| `/nerd-analysen-3` | `NerdAnalysen3.tsx` | Teil 3: zweite Doppeluhr-Messung mit echten Fotos + Mess-Plots (`web/public/nerd3/`, same-origin). 8 Sprachen. |
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
