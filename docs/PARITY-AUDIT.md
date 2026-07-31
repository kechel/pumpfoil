# Parität-Audit: Native Apps vs. Web

**Vorgabe Phone/Web:** [pumpfoil.org](https://pumpfoil.org) (`web/`) · **Vorgabe Uhren:** Garmin (`watch/`).

**Stand: 2026-07-31** (gegen den Code abgeglichen; die aelteren Abschnitte bleiben als Beleg stehen). Legende: ✅ vorhanden · ⚠️ teilweise/abweichend ·
❌ fehlt · 🌐 bewusst Web-only. Offene Punkte → **[`docs/TODO.md`](TODO.md)**.

Kurzfassung: Android + iOS haben seit dem 06-28-Audit **fast volle Web-Parität** erreicht (Home,
Sessions mit allen Scopes, Community/Leaderboards/Medien, Chat inkl. DM/Push-Abo/Blockieren,
Session-Detail mit Farb-Modi/Glättung/Marker/Lauf-Auswahl/Trim/Löschen/Watt, Vergleich, Datenseiten +
Off-Foil, Einstellungen, i18n 10 Sprachen, Caching). Rein Web-zentriert bleiben Admin, Labeling,
FIT-Import und die „Optimal"-Färbung.

## Stand 2026-07-31 — alles seit dem 07-29-Release in die Apps gezogen

Nach dem gemeinsamen Release (Android 1.1.17, iOS/Apple 1.1.18, Wear 1.2.17, Zepp 1.0.3) lief die PWA
zwei Tage weiter. Diese Runde holt beide Handy-Apps auf denselben Stand — je einzeln verifiziert
(Android kompiliert, iOS syntaxgeprueft PLUS Modelle/Chip-Logik/Sprachdateien wirklich kompiliert und
gegen echte Server-Antworten laufen gelassen).

| Feature | PWA | Android | iOS | Anmerkung |
|---|---|---|---|---|
| Lauf/Zeitbereich aussortieren | ✅ | ✅ `2483c3a` | ✅ `0698b3c` | schon am 30.7. |
| App-Version pro Session | ✅ | ✅ `e36232c` | ✅ `e0468a0` | Uhren ueber Config-Abruf |
| Setup-Chips (Stab/Mast/Board) auf den Karten | ✅ | ✅ `ee70549` | ✅ `17b914c` | inkl. Skateboard in Cyan |
| Sportart-Kennzeichen auf Community-Karten | ✅ | ✅ | ✅ | eigene Sessions haben schon das Klassifikations-Badge |
| „was ist neu"-Liste sportartunabhaengig (`sport=all`) | ✅ | ✅ | ✅ | Rekorde/Bestenlisten bleiben einsportig |
| Katalog-Kennzeichen „Masse abgeleitet" | ✅ | ✅ | ✅ | PWA-Keys fehlten, `13f2458` |
| Katalog ohne Herstellermasse (0 cm²) | ✅ | ✅ | ✅ | Hinweistext statt Null, raus aus Rechnern |
| Stab-Maasse anzeigen | ✅ | ✅ | ✅ | API liefert sie seit `97db339` |
| „Fehlt im Katalog?" -> Feedback | ✅ | ✅ | ✅ | mit vorbelegtem Text |
| Foil-Favoriten ohne Scrollen | ✅ | — | ✅ | Android: Problem existiert nicht (DropdownMenu startet oben) |
| Zuschnitt zeigt Uhrzeit | ✅ | ✅ | ✅ | |
| Zepp: i18n (41 Strings, 15 Sprachen) | — | — | — | ✅ `38eadc2`, Wortlaut aus Garmin/Wear |

Zwei Fehler in den Apps fielen dabei auf und sind mitgefixt: **beide** Apps dekodierten das vom Server
gelieferte `foil` in Community-Karten nicht (Foil-Chip fehlte dort), und iOS quetschte bis zu sieben
Chips in eine Zeile (jetzt Umbruch in Dreier-Zeilen).

**Zepp: echte Aktivitaet ist NICHT machbar** (Recherche mit Quellen in `watch-zepp/README.md`):
`@zos/sensor Workout` ist read-only, `appType` kennt nur `app`/`watchface`, die Workout Extension ist
ein Plug-in IN der System-Sport-App (eigene App-ID, Zepp OS 3.5+, 6 Geraete, Balance 2 nicht dabei).
Einziger belegbarer Weg waere ein Architektur-Umbau (System-Workout vorn + unser Recorder als
Background Service) — offen ist, ob ein Background Service dauerhaft GPS halten darf.

## Stand 2026-07-30 — neue Rueckstaende NACH dem Release

Diese Punkte sind erst nach dem 07-28-Release entstanden, sind in der PWA live und in den Apps
(noch) nicht — sie gehen also in die naechste Runde:

| Feature | PWA | Android | iOS | Wear/Apple/Zepp |
|---|---|---|---|---|
| Lauf aussortieren (Lauf-Tabelle) | ✅ | ✅ `2483c3a` | ✅ `0698b3c` | 🌐 (Auswertung, nicht Aufnahme) |
| Zeitbereich aussortieren (Zuschnitt-Panel) | ✅ | ✅ `2483c3a` | ✅ `0698b3c` | 🌐 |
| Pump-Kadenz als Pumps/Minute (Konto-Einstellung) | ✅ | ✅ | ✅ | 🌐 |
| Melde-/Klassifikations-Knoepfe ganz unten | ✅ | ✅ | ✅ | — |
| Katalog-Kennzeichen „Masse abgeleitet" | ✅ | ❌ | ❌ | — |
| „Fehlt im Katalog?" -> Feedback mit einem Klick | ✅ | ❌ | ❌ | — |

Vertrag fuer das Aussortieren: `excluded_ranges` in `SessionOut` (`[[start_ms, end_ms], …]`, Basis wie
`trim_*`), `POST /api/sessions/{id}/runs/exclude` mit `run_index` ODER `start_ms`+`end_ms`,
`POST …/runs/include` mit `range_index`; Besitzer oder Admin, Server rechnet danach neu, umkehrbar.
Auf den Uhren hat das nichts zu suchen: es ist eine Korrektur der AUSWERTUNG im Nachhinein.

## Stand 2026-07-28 — grosse Paritaets-Runde (Vorbereitung eines gemeinsamen Releases)

Geschlossen auf **Android Phone UND iOS** (je einzeln kompiliert bzw. syntaxgeprueft, Commits in
Klammern): Sportart-Klassifikation inkl. Melden/Einspruch/Home-Hinweis/Karten-Badge
(`1314d78`/`3264394`), Standard-Sportart (`1d06807`/`dc47149`), Ausruestung je Session + Setup-Seite
fuer die Standards (`bbc766c`+`8065078`/`83f3d89`), Chat-Likes (`ecbefb3`/`dc47149`),
eigene Startquoten-Schwelle (`1d06807`/`dc47149`), Uhr-Datenseiten mit drei Zustaenden, gemischten
Seiten, `browse_all_pages` und `layouts_enabled` (`fecea66`/`ad7cac8`).

**Nicht mehr offen, weil bereits vorhanden** (gegen den Code geprueft, aeltere Audit-Eintraege waren
veraltet): die fuenf Sprachen pt/ja/zh/ru/id (alle Apps haben 15 Sprachen), News-Banner,
Session-Uebertragung, Carve-Zaehler. Die Tages-Buendelung fehlt in der EIGENEN Liste auch in der PWA
und die Live-Upload-Karte hat dort ebenfalls keine Mini-Karte -> Paritaet erfuellt, kein Rueckstand.

Recorder-Uhren: **eigene Layouts rendern jetzt auch Wear OS (`bf31da8`) und Apple Watch
(`2fc8d9c`)**, samt Tri-State-Schalter auf der Uhr. Voraussetzung war ein Server-Befund: die
Layout-Auslieferung hing am Garmin-Part-Number-Katalog und erreichte die anderen Plattformen nie
(`a08e67d`). Bei Zepp sind Bridge-Whitelist, Update-Hinweis und ein ehrliches Accel-Meta erledigt
(`fc4c2a6`); Renderer, i18n und Lauf-Erkennung sind dort weiterhin offen (Begruendung in docs/TODO.md).

**Bewusst NICHT portiert:** Lite-Build, Canary-Selbstheilung und halbierte Accel-Chunks von Garmin —
das sind Notloesungen fuer 96-128 KB RAM und haben auf Wear/watchOS/Zepp kein Gegenstueck.
Der strenge Zustandsring (`browseAll=false`) fehlt auf Wear und Apple Watch: beide nutzen einen
linearen Pager mit fester Seitenarithmetik, und ein manuelles Pausieren gibt es dort gar nicht.

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
| Carve-Ansicht (GPS-Turns, farbig nach Lage) | ✅ 🌐 | ❌ | ❌ |
| Öffentlicher Teilen-Link (`/s/<token>`) | ✅ | ✅ (Link→Browser) | ✅ (Link→Browser) |
| Medien (Foto+Video, 2-Spalten-Grid) | ✅ | ✅ | ✅ |
| Foto hochladen/löschen | ✅ | ✅ | ✅ |
| YouTube-Embed | ✅ | ✅ | ✅ |
| Mehrere Videos pro Session (verlinken/löschen) | ✅ | ✅ | ✅ |
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
| Sprache (10 Sprachen) | ✅ | ✅ | ✅ |
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
| i18n | ✅ 10 Sprachen | ✅ 10 (fi/nl/cs via Overlay) | ✅ 10 |
| Social-Age-Gate (<13) | ✅ Flag | ✅ (Debug-Toggle; echte API iOS) | ⚠️ Declared-Age-Range-API-Entitlement offen |
| Push (Zustellung) | ✅ Web-Push | ⚠️ Abo ja, Zustellung offen | ⚠️ |

## B) Recorder-Apps vs. Garmin (`android/wear/` = Wear OS, `watch-apple/Sources/` = watchOS)

**2026-07-13 gegen den Code geprüft: Wear + watchOS sind funktional auf vollem Garmin-Niveau.**
(Die früheren „⚠️/❌"-Einträge hier waren veraltet.)

| Feature | Garmin | Wear OS | watchOS |
|---|---|---|---|
| GPS 1 Hz + Accel 25 Hz | ✅ | ✅ | ✅ |
| Local-first + resumebarer Sync | ✅ | ✅ | ✅ |
| Pairing (Reverse + Forward-Code) | ✅ | ✅ (`Api.pairInit`) | ✅ (`Api.pairInit`) |
| Auto-Start (10 s Vorlauf + GPS-Scharf) | ✅ | ✅ | ✅ |
| Foil/Alarm-Auswahl + Min/Max on-watch | ✅ | ✅ | ✅ |
| Vibrationsmuster | ✅ Waveforms | ✅ Waveforms | ⚠️ System-Haptics (Plattformlimit) |
| Konfigurierbare Datenseiten (Pager) + Color-by-value + Off-Foil | ✅ | ✅ | ✅ |
| Feld-Typen | ✅ 20 (inkl. 8 Lauf-Felder) | ✅ 20 | ✅ 20 |
| Stop = 3-s-Halten mit Ring | ✅ | ✅ `HoldStopButton` | ✅ `onLongPressGesture(3s)` |
| Start-Screen (Version + GPS-Status + Foil/Alarm) | ✅ | ✅ | ✅ |
| Upload/Sync-Screen | ✅ | ✅ | ✅ |

**Einzige Abweichung — bewusst/hardwarebedingt:** Felder **Höhe (10) / Anstieg (13) / Temperatur (11)**
zeigen „–". Temperatur: kein Sensor auf Wear/Apple Watch. Höhe/Anstieg: aus GPS ableitbar, aber für
einen **Wassersport** ~konstant (Wasserlinie) / ~0 → nicht sinnvoll. watchOS-Vibrationsmuster auf
System-Haptics gemappt (kein Plattform-Weg für freie Waveforms). Sonst **keine offenen Recorder-Lücken**.

### Amazfit / Zepp OS (`watch-zepp/`) — LIVE seit 2026-07-21, aber Feature-Rückstand
Vierte Recorder-Plattform, seit 2026-07-21 im Zepp/Amazfit Store (v1.0.2, ~40 Geräte). Schon da:
GPS + Puls, Foil/Alarm-Auswahl + Vibration, konfigurierbare Datenseiten + Off-Foil, Auto-Start,
Reverse-Pairing, Offline-Queue mit Absturz-Recovery. **Offen (Parität nachziehen):**
| Feature | Garmin | Amazfit/Zepp |
|---|---|---|
| Accel 25 Hz → Pump-Erkennung | ✅ | ❌ (nur GPS+Puls → gps_only; Zepp-Accel-API vorhanden, noch nicht verdrahtet) |
| On-Device-Lokalisierung + Systemsprache/EN-Default | ✅ | ❌ (UI hartkodiert Deutsch, kein i18n) |
| Update-Hinweis (`latestVersion` aus `/config`) | ✅ | ❌ |
| Aktivitätstyp Garmin/FIT (nur Garmin relevant) | ✅ | – |
Build/Verify nur auf Jans Mac (Zeus CLI + Balance 2). Details: Memory `zepp-recorder`.
