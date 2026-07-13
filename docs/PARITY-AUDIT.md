# Parität-Audit: Native Apps vs. Web

**Vorgabe Phone/Web:** [pumpfoil.org](https://pumpfoil.org) (`web/`) · **Vorgabe Uhren:** Garmin (`watch/`).

**Stand: 2026-07-13** (gegen den Code abgeglichen). Legende: ✅ vorhanden · ⚠️ teilweise/abweichend ·
❌ fehlt · 🌐 bewusst Web-only. Offene Punkte → **[`docs/TODO.md`](TODO.md)**.

Kurzfassung: Android + iOS haben seit dem 06-28-Audit **fast volle Web-Parität** erreicht (Home,
Sessions mit allen Scopes, Community/Leaderboards/Medien, Chat inkl. DM/Push-Abo/Blockieren,
Session-Detail mit Farb-Modi/Glättung/Marker/Lauf-Auswahl/Trim/Löschen/Watt, Vergleich, Datenseiten +
Off-Foil, Einstellungen, i18n 8 Sprachen, Caching). Rein Web-zentriert bleiben Admin, Labeling,
FIT-Import und die „Optimal"-Färbung.

## A) Phone-Apps vs. Web

### Navigation / Tabs
| Bereich | Web | Android | iOS |
|---|---|---|---|
| Home/Dashboard | ✅ | ✅ | ✅ |
| Community (Foilers) | ✅ | ✅ | ✅ |
| Sessions (Scope Meine/Spot/Alle + Filter + Monat) | ✅ | ✅ | ✅ |
| Verlauf (+ „Entwicklung am Spot") | ✅ | ✅ | ✅ |
| Spots-Karte | ✅ Leaflet | ✅ osmdroid | ✅ MapKit |
| Chat (DM, Spot, Push-Abo, Blockieren) | ✅ (+ Moderation 🌐) | ✅ | ✅ |
| Einstellungen-Hub | ✅ | ✅ | ✅ |
| Profil | ✅ | ✅ | ✅ |
| Admin | ✅ | 🌐 | 🌐 |
| Landing | ✅ | 🌐 (App startet im Login) | 🌐 |
| Impressum/Datenschutz | ✅ | ✅ | ✅ |

### Session-Detail
| Feature | Web | Android | iOS |
|---|---|---|---|
| Karte (nur Foiling-Segmente) | ✅ | ✅ | ✅ |
| Farb-Modi Speed/HR/Pump | ✅ (+ „Optimal" 🌐) | ✅ | ✅ |
| Glättung 1/3/5 s | ✅ | ✅ | ✅ |
| Pump-Marker | ✅ | ✅ | ✅ |
| Lauf-Auswahl (Tap/Highlight) | ✅ | ✅ | ✅ |
| Läufe-Tabelle | ✅ | ✅ | ✅ |
| Power-Karte (Watt) | ✅ | ✅ | ✅ |
| Farb-Legende (min→max) | ✅ | ✅ | ✅ |
| Stats-Grid | ✅ | ✅ | ✅ |
| Medien (Foto+Video, 2-Spalten-Grid) | ✅ | ✅ | ✅ |
| Foto hochladen/löschen | ✅ | ✅ | ✅ |
| YouTube-Embed | ✅ | ✅ | ✅ |
| Like | ✅ | ✅ | ✅ |
| Melden (Fake/unangemessen) | ✅ | ✅ | ✅ |
| Caption + Foil bearbeiten | ✅ | ✅ | ✅ |
| Trim-Editor (Re-Analyse) | ✅ | ✅ | ✅ |
| Übertragen / Löschen | ✅ | ✅ | ✅ |
| Teilen (Karte-Bild + Foto-Hintergrund) | ✅ | ✅ | ✅ |
| Vollbild-Karte | ✅ | ❌ | ❌ |
| Per-Session-Diskussion (session-Chat) | ✅ | ⚠️ Spot-Chat-Button | ⚠️ Spot-Chat-Button |

### Weitere Seiten
| Feature | Web | Android | iOS |
|---|---|---|---|
| Foils-Katalog / Rechner / Foil-Stats | ✅ | ✅ | ✅ |
| Vergleichsansicht | ✅ | ✅ | ✅ |
| Community-Records/Leaderboards | ✅ | ✅ | ✅ |
| Letzte Medien (Galerie) | ✅ | ✅ | ✅ |
| Verknüpfte Konten (Polar/Suunto/COROS) | ✅ | ✅ | ✅ |
| Labeling-Editor | ✅ | 🌐 | 🌐 |
| FIT-Import (Garmin) | ✅ | 🌐 | 🌐 |

### Einstellungen (editierbar in-App)
| Feld | Web | Android | iOS |
|---|---|---|---|
| Eigene Foils + Standard | ✅ | ✅ | ✅ |
| Gewicht | ✅ | ✅ | ✅ |
| Homespot | ✅ | ✅ | ✅ |
| Datenseiten (Uhr-Felder) + Off-Foil-Screen | ✅ | ✅ | ✅ |
| Farb-Modus an/aus (Uhr) | ✅ | ⚠️ | ⚠️ |
| Sprache (8 Sprachen) | ✅ | ✅ | ✅ |
| Theme Light/Dark/Auto | ✅ | ✅ | ✅ |
| Push-Prefs | ✅ | ✅ | ✅ |
| Anzeigename / Avatar-Upload | ✅ | ✅ | ✅ |
| Passwort ändern | ✅ | ✅ | ✅ |
| Konto löschen (DSGVO) | ✅ | ✅ | ✅ |
| Aktivitätstyp Garmin Connect (nur mit Garmin-Uhr) | ✅ | ✅ | ✅ |
| Geräte-Pairing (Reverse + Forward-Code) | ✅ | ✅ | ✅ |
| Aufzeichnungsmodus je Uhr (Voll/Sparsam/GPS) | ✅ | ✅ | ✅ |
| Login/Register/OAuth (Google/Apple)/Passwort-Reset | ✅ | ✅ | ✅ |

### Plattform-Querschnitt
| Feature | Web | Android | iOS |
|---|---|---|---|
| Caching (Bilder + Session-Detail) | ✅ Browser+304 | ✅ Disk-Cache (data_version) + Coil | ✅ SessionCache + URLCache |
| i18n | ✅ 8 Sprachen | ✅ 8 (inkl. fi-Overlay) | ✅ 8 |
| Social-Age-Gate (<13) | ✅ Flag | ✅ (Debug-Toggle; echte API iOS) | ⚠️ Declared-Age-Range-API-Entitlement offen |
| Push (Zustellung) | ✅ Web-Push | ⚠️ Abo ja, Zustellung offen | ⚠️ |

## B) Recorder-Apps vs. Garmin (`android/wear/` = Wear OS, `watch-apple/Sources/` = watchOS)

_Seit dem letzten Audit unverändert — der jüngste Fokus lag auf Phone/Web._

| Feature | Garmin | Wear OS | watchOS |
|---|---|---|---|
| GPS 1 Hz + Accel 25 Hz | ✅ | ✅ | ✅ |
| Local-first + resumebarer Sync | ✅ | ✅ | ✅ |
| Pairing | ✅ Reverse + Forward | ⚠️ nur Reverse | ⚠️ nur Reverse |
| Auto-Start (10 s Vorlauf) | ✅ | ✅ | ✅ |
| Foil/Alarm-Auswahl + Min/Max on-watch | ✅ | ✅ | ✅ |
| Vibrationsmuster | ✅ Waveforms | ✅ Waveforms | ⚠️ System-Haptics (Plattformlimit) |
| Konfigurierbare Datenseiten + Color-by-value + Off-Foil | ✅ | ✅ | ✅ |
| Feld-Typen | ✅ 20 (inkl. 8 Lauf-Felder) | ⚠️ 10 (keine Lauf-Felder) | ⚠️ 10 |
| Stop = 3-s-Halten mit Ring | ✅ | ⚠️ einfacher Tap | ⚠️ einfacher Tap |
| Start-Screen (Version/GPS/Alarm-Label) | ✅ | ⚠️ ärmer | ⚠️ ärmer |

**Recorder-Restlücken (Wear + watchOS):** Forward-Pairing, Lauf-Datenfelder (10 statt 20 Typen),
3-s-Stop-Halten mit Ring, reichhaltigerer Start-Screen. watchOS-Vibrationsmuster bewusst angenähert.
