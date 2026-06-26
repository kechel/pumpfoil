# Parität-Audit: Native Apps vs. Vorgaben

**Vorgabe Phone/Web:** [pumpfoil.org](https://pumpfoil.org) (`web/`).
**Vorgabe Uhren:** Garmin (`watch/`).

Stand: 2026-06-26. Legende: ✅ vorhanden · ⚠️ teilweise/abweichend · ❌ fehlt · 🐛 Bug.

> Diese Datei ist die Soll-Ist-Liste. Erst abweichen/fehlen erfassen, dann priorisiert umsetzen.

## Stand 2026-06-26 (autonome Serie) — Phone-Parität weitgehend hergestellt

Beide Phone-Apps (Android verifiziert kompiliert, iOS in TestFlight gebaut/getestet) haben jetzt:
Home-Dashboard · Sessions mit Scope (Meine/Homespot/Alle) + Spot-Suche · Community-Feed
**+ Records/Leaderboards** · Spots · Chat · Profil (**Avatar-Upload**, Name) · **Einstellungen**
(Gewicht/Homespot/Theme/Push) · Foils/Rechner/Stats · **Datenfelder-Editor** · **On-Foil-Alarm**.
Session-Detail: Karte (nur Foiling, Farb-Modi Speed/Puls/Pump **+ Glättung 1/3/5 s**), Pump-Marker,
Läufe-Tabelle, Power-Karte, **Per-Session-Foil**, Fotos+Upload, YouTube, Like, **löschen**,
**Beschriftung**, **melden** (Fake/unangemessen).
Auth: E-Mail Login/**Register** · **Sign in with Apple** (iOS) · **Mit Google** (Android) · Auto-Uhr-Verknüpfung.

**Gefixte Bugs:** iOS Community-Decode; iOS Session-Detail (Kachel-Karte/on-foil/Speed-Chart raus);
Android Login-Light-Mode; iOS Release-Crash in Einstellungen+Alarm (selbstgebautes `Binding.onChange`
entfernt); Social-Login-Displayname-Fallback; diverse Web-Light-Mode-Kontraste.

**Noch offen (niedriger Nutzen / Web-zentriert):** Farb-Modus „Optimal", Lauf-Auswahl-Highlight,
Labeling, Trim-Editor, Vergleichsansicht. **Braucht dich/Geräte:** Recorder-P2 (Lauf-Felder,
3-s-Stop-Ring, „GPS bereit", Forward-Pairing), i18n (Uhr+Phone), Google-Consent-Verifizierung.

---

## A) Phone-Apps vs. Web (`android/` = Compose, `Sources-iOS/` = SwiftUI)

### Navigation / Tabs
| Bereich | Web | Android | iOS |
|---|---|---|---|
| Home/Dashboard | ✅ | ❌ | ❌ |
| Community-Feed | ✅ | ✅ | ✅ *(Decode gefixt)* |
| Sessions | ✅ (Scope Meine/Spot/Alle + Spot-Suche + Sport-Filter + Monat) | ⚠️ nur eigene | ⚠️ nur eigene |
| Verlauf/History | ✅ | ✅ | ✅ |
| Spots-Karte | ✅ (Leaflet/OSM) | ✅ (osmdroid) | ✅ (MapKit) |
| Chat | ✅ (+ Moderation, Push-Abo, ungelesen) | ⚠️ Text, ohne Moderation/Push | ⚠️ Text, ohne Moderation/Push |
| Einstellungen-Hub | ✅ | ⚠️ via Profil | ⚠️ via Profil |
| Profil | ✅ | ✅ (Name) | ✅ (Name) |
| Admin | ✅ (admin-only) | ❌ | ❌ |
| Landing/Impressum | ✅ | ❌ | ❌ |

### Session-Detail
| Feature | Web | Android | iOS |
|---|---|---|---|
| Karte mit Kacheln | ✅ Leaflet/OSM | ✅ osmdroid *(gefixt)* | ✅ MapKit *(gefixt)* |
| Nur Foiling-Segmente | ✅ | ✅ *(gefixt)* | ✅ *(gefixt)* |
| Speed-Verlauf-Chart (gibt's im Web NICHT) | — | ✅ entfernt *(gefixt)* | ✅ entfernt *(gefixt)* |
| Farb-Modi (Speed/HR/Pump/Optimal) | ✅ | ❌ nur Speed | ❌ nur Speed |
| Glättungsfenster 1/3/5 s | ✅ | ❌ | ❌ |
| Pump-Marker auf Track | ✅ | ❌ | ❌ |
| Lauf-Auswahl (Klick/Tasten) | ✅ | ❌ | ❌ |
| Vollbild-Karte | ✅ | ❌ | ❌ |
| Läufe-Tabelle + Vergleich | ✅ | ❌ | ❌ |
| Power-Karte (Watt) | ✅ | ❌ | ❌ |
| Stats-Grid | ✅ | ✅ | ✅ |
| Fotos ansehen/hochladen | ✅ | ✅ | ✅ (kein Löschen) |
| YouTube-Embed | ✅ | ✅ | ✅ |
| Like | ✅ | ✅ | ✅ |
| Fake/Inappropriate-Vote | ✅ | ❌ | ❌ |
| Caption/YouTube/Foil bearbeiten | ✅ | ❌ | ❌ |
| Trim-Editor (Re-Analyse) | ✅ | ❌ | ❌ |
| Session löschen | ✅ | ❌ | ❌ |
| Per-Session-Chat-Thread | ✅ | ❌ | ❌ |

### Weitere Seiten
| Feature | Web | Android | iOS |
|---|---|---|---|
| Foils-Katalog (meine + Standard) | ✅ | ✅ | ✅ |
| Foil-Rechner | ✅ | ✅ | ✅ |
| Foil-Stats (Community) | ✅ | ✅ | ✅ |
| Vergleichsansicht (`/vergleich`) | ✅ | ❌ | ❌ |
| Labeling-Editor | ✅ | ❌ | ❌ |
| FIT-Import (Garmin) | ✅ | ❌ | ❌ |
| Community-Records/Leaderboards | ✅ | ❌ | ❌ |
| Letzte Medien (Galerie) | ✅ | ❌ | ❌ |

### Einstellungen (editierbar in-App)
| Feld | Web | Android | iOS |
|---|---|---|---|
| Vibrationsalarm (inkl. Default-Quelle) | ✅ | ✅ *(diese Session)* | ✅ *(diese Session, neue Datei → `xcodegen generate`)* |
| Eigene Foils + Standard | ✅ | ✅ | ✅ |
| Gewicht | ✅ | ⚠️ nur gelesen (Rechner) | ⚠️ nur gelesen |
| Datenseiten (Uhr-Felder) | ✅ | ❌ | ❌ |
| Farb-Modus an/aus (Uhr) | ✅ | ❌ | ❌ |
| Homespot | ✅ | ❌ | ❌ |
| Sprache (7 Sprachen) | ✅ | ❌ (System) | ❌ (System) |
| Theme Light/Dark/Auto | ✅ | ⚠️ folgt System, kein Schalter | ❌ |
| Push-Benachrichtigungen + Prefs | ✅ | ❌ | ❌ |
| Anzeigename | ✅ | ✅ | ✅ |
| Avatar-Upload | ✅ | ❌ | ❌ ("später") |
| Passwort ändern | ✅ | ❌ | ❌ |
| Geräte-Pairing/Verwaltung | ✅ (Code + Liste + Revoke) | ⚠️ Wear-Auto-Mint (Data Layer) | ⚠️ Watch-Companion |
| OAuth/Registrieren/Passwort-Reset | ✅ | ❌ (nur Login) | ❌ (nur Login) |

### Plattform-Querschnitt
| Feature | Web | Android | iOS |
|---|---|---|---|
| Offline-Cache | ✅ (PWA/Workbox) | ❌ (jeder Screen frisch) | ❌ |
| Push | ✅ (Web-Push) | ❌ | ❌ |
| i18n | ✅ 7 Sprachen | ❌ (DE hardcodiert) | ❌ (DE hardcodiert) |

### 🐛 Bugs (Phone) — alle in dieser Session gefixt
- ✅ **iOS Community-Feed Decode**: eigenes `CommunityItem`-Model (`session_id/name/avatar_url/spot/like_count`) + `CommunityRow`; `Api.communitySessions` umgestellt.
- ✅ **iOS Session-Detail**: MapKit-Karte (`UIViewRepresentable`/`MKMapView`, iOS-16-tauglich) zeigt nur Foiling-Segmente speed-gefärbt; Speed-Chart entfernt; `Analysis.segments` ergänzt.
- ✅ **Android Session-Detail**: osmdroid-Karte, nur Foiling-Segmente, Speed-Chart raus.
- ✅ **Android Community-Feed Decode**: `CommunityItem`-Model.
- ✅ **Android Login-Screen** unlesbar (dunkel auf dunkel) → `Surface` mit Theme-Hintergrund.

> Swift (iOS) ist hier nicht kompilierbar — die iOS-Fixes sind code-vollständig + konsistenz-geprüft, aber in Xcode zu verifizieren. Kotlin (Android) ist grün kompiliert.

---

## B) Recorder-Apps vs. Garmin (`watch-wear/` = Wear OS, `watch-apple/Sources/` = watchOS)

| Feature | Garmin | Wear OS | watchOS |
|---|---|---|---|
| GPS 1 Hz + Accel 25 Hz | ✅ | ✅ | ✅ |
| Local-first + resumebarer Sync | ✅ | ✅ | ✅ |
| Pairing | ✅ Reverse **+ Forward** (Settings-Code) | ⚠️ nur Reverse | ⚠️ nur Reverse |
| Start-Screen: Version | ✅ | ❌ | ❌ |
| Start-Screen: GPS-Status | ✅ | ❌ | ❌ |
| Start-Screen: Alarm-Label/Hinweise | ✅ | ❌ | ❌ |
| Alarm-Auswahl (Foil/Feste Werte/Ohne) | ✅ | ✅ | ✅ |
| Alarm-Default-Quelle (foil/fixed) | ✅ | ✅ *(diese Session)* | ✅ *(diese Session)* |
| Vibrationsmuster (short1/short2/long2/lsl) | ✅ Waveforms | ✅ Waveforms *(diese Session)* | ⚠️ auf System-Haptics gemappt (Plattformlimit) |
| Repeat-Modus once/continuous + Toggle | ✅ | ✅ *(diese Session)* | ✅ *(diese Session, Sheet)* |
| Min-Fenster [min-2, min) | ✅ | ✅ *(diese Session)* | ✅ *(diese Session)* |
| Konfigurierbare Datenseiten | ✅ | ✅ | ✅ |
| Color-by-value | ✅ | ✅ | ✅ |
| Off-Foil-Auto-Screen | ✅ | ✅ | ✅ |
| Live-Lauferkennung | ✅ | ✅ | ✅ |
| Feld-Typen | ✅ 20 (inkl. 8 Lauf-Felder) | ⚠️ 10 (keine Lauf-Felder) | ⚠️ 10 (keine Lauf-Felder) |
| Stop = 3-s-Halten mit Ring | ✅ | ⚠️ einfacher Tap | ⚠️ einfacher Tap |
| Erfolgs-/Upload-Screen | ✅ | ✅ | ✅ |

### Recorder-Lücken (Wear + watchOS vs. Garmin)
1. Start-Screen ärmer: kein Version-/GPS-Status/Alarm-Label/Hinweise.
2. Keine Lauf-zentrischen Datenfelder (8 Felder), nur 10 statt 20 Feld-Typen.
3. Stop ohne 3-s-Halten + Ring-Feedback (versehentliches Beenden möglich).
4. Pairing nur Reverse (kein Forward/Settings-Code).
5. watchOS: Vibrationsmuster nur angenähert (kein Plattform-Weg für freie Waveforms) — akzeptiert.

---

## C) Vorschlag Priorisierung

**P0 – Bugs (sofort):**
- iOS Community-Decode (`CommunityItem`).
- iOS Session-Detail: MapKit-Karte, nur Foiling-Segmente, Speed-Chart raus (Android-Parität).

**P1 – Sichtbare Phone-Lücken beider Apps — ✅ umgesetzt (Android kompiliert, iOS in Xcode zu verifizieren):**
- ✅ Session-Detail-Tiefe: Farb-Modi (Speed/Puls/Pump), Pump-Marker, Läufe-Tabelle, Power-Karte.
- ✅ Sessions-Scope (Meine/Homespot/Alle) + Spot-Suche.
- ✅ Home-Dashboard (Gesamt-Kennzahlen + Rekorde klickbar + letzte Sessions) als 1. Tab.
- ✅ Einstellungen-Screen: Gewicht, Homespot, Theme-Schalter (Light/Dark/Auto), Push-Prefs.
- Offen aus P1: Community-Records/Leaderboards-Seite, Datenseiten-Editor (Uhr-Felder), Sprache-Schalter (hängt an i18n), Lauf-Auswahl/Glättung im Detail.

**P2 – Recorder-Angleichung (Wear + watchOS):**
- Start-Screen (Version/GPS/Alarm-Label/Hinweise), Lauf-Felder + restliche Feld-Typen, 3-s-Stop-Halten mit Ring.

**P3 – Größere Bausteine:**
- Session bearbeiten/trimmen/löschen, Labeling, Vergleichsansicht, FIT-Import, Fake/Inappropriate-Votes, Chat-Moderation/Push, Avatar-Upload, Passwort/OAuth/Register, i18n, Offline-Cache, Admin.

> Hinweis: einige reichste Web-Features (Trim/Labeling/Admin/Compare) sind bewusst Web-zentriert — beim Durchgehen entscheiden, was auf Phone wirklich gebraucht wird.
