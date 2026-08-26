# Parität-Audit: Native Apps vs. Web

**Vorgabe Phone/Web:** [pumpfoil.org](https://pumpfoil.org) (`web/`) · **Vorgabe Uhren:** Garmin (`watch/`).

**Stand: 2026-08-18** — gegen den Code nachgeprueft, nicht uebernommen. Vorgabe Jan: alles
nachziehen, auch was frueher schon vergessen wurde, denn was damals fehlte, fehlt heute auch noch.
Dabei kam heraus, dass die Datei selbst der Hauptbefund war: **sechs von sieben offenen Markern
waren veraltet**, die Punkte waren im Paritaets-Port langst geschlossen. Belegt per Volltextsuche:

| Zeile | stand als | ist tatsaechlich | Beleg |
|---|---|---|---|
| Katalog „Masse abgeleitet" | ❌ ❌ | ✅ ✅ | `specs_estimated`/`specsEstimated` in je 3 Dateien |
| „Fehlt im Katalog?" | ❌ ❌ | ✅ ✅ | `foils.missing*` Android 4 / iOS 3 Treffer |
| Carve-Ansicht | ❌ ❌ | ✅ ✅ | `ColorMode.TURNS` + `carve?.arcs` in beiden Detailansichten |
| Farb-Modus an/aus (Uhr) | ⚠️ ⚠️ | ✅ ✅ | `colorByValue` in beiden DataFields-Screens (je 6) |
| Aufnahme autom. starten | ❌ ❌ | ✅ ✅ | `auto_start` in beiden DataFields-Screens (je 6) |
| Zepp Update-Hinweis | ❌ | ✅ | `latestVersion` in `page/index.js` (Vergleich am 18.08. repariert) |
| Per-Session-Diskussion | PWA ✅ | **nirgends** | `sd.discussion` ist ein WAISEN-KEY: in `de.ts`, aber in KEINER `.tsx` benutzt |

Echt offen war genau **ein** Punkt, und der ist jetzt gebaut: die **Vollbild-Karte** in der
Session-Detailansicht (Android + iOS).

**Lehre:** ein ❌ in dieser Datei ist kein Befund, solange es nicht gegen den Code geprueft ist.
Wer hier etwas als fehlend liest, sucht es ZUERST im Code — sonst baut man Vorhandenes nachher
ein zweites Mal.

**Stand 2026-08-26 — Paritaets-Bilanz nach dem Release-Block der letzten Woche** (gegen den Code
geprueft, nicht gegen diese Datei). Alles, was seit dem 18.08. in der PWA dazukam, ist in Android
und iOS NACHGEZOGEN — seit dem Nachzug des Datei-Exports (26.08.) ohne Ausnahme:

| Neu seit 18.08. | Web | Android | iOS | Uhren |
|---|---|---|---|---|
| Spot-Beschreibungen (Text + bis 10 Fotos je Nutzer, Herzchen, Sortierung) | ✅ | ✅ | ✅ | – |
| „Aus meinen Session-Fotos" (Auswahl statt Neu-Upload) | ✅ | ✅ | ✅ | – |
| Spot-Knopf in der Session-Detailansicht | ✅ | ✅ | ✅ | – |
| Spot-Label mit Gewaesser/Steg (Dropdown + Titel) | ✅ | ✅ | ✅ | – |
| Katalog-Suche unabhaengig von der Wortstellung | ✅ | ✅ | ✅ | – |
| Streckungsverhaeltnis (AR) in den Foil-Badges | ✅ | ✅ | ✅ | – |
| Trainingskurve (`/hr-progress`) im Verlauf | ✅ | ✅ | ✅ | – |
| Puls-Zonen im Profil | ✅ | ✅ | ✅ | ✅ (aus `/config`) |
| Wert-Grafiken in Layouts (Rand-Grafik + Balken) | ✅ | ✅ Vorschau | ✅ Vorschau | ✅ alle vier |
| News-Banner | ✅ | ✅ | ✅ | – |
| Session-Datei laden (GPX + FIT) | ✅ | ✅ 26.08. | ✅ 26.08. | – |

Serverseitige Verbesserungen derselben Woche (Ort/Spot direkt nach der Analyse, keine Waisen-Spots,
Spot-Zahl aus einer Quelle, Cache-Stempel nach Re-Analyse, aussortierte Sessions aus Verlauf/Spots)
wirken in ALLEN Clients ohne Portierung — dort ist nichts offen.

Nicht portiert, weil bewusst Web-only: Layout-Editor, Labeling-Editor, FIT-Import, Changelog-Seite.

**Versionsstand:** die Apps sind gebaut und geprueft, aber noch auf der LIVE-Nummer — vor der
Einreichung bumpen: Phone 1.1.23/37 -> 1.1.24/38 · Wear 1.2.23/1033 -> 1.2.24/1034 ·
iOS/Apple Watch 1.1.24/28 -> 1.1.25/29 · Zepp 1.0.6 -> 1.0.7. Garmin 1.0.79 ist live.

**Alter Stand: 2026-08-17** (gegen den Code abgeglichen; die aelteren Abschnitte bleiben als Beleg stehen). Legende: ✅ vorhanden · ⚠️ teilweise/abweichend ·
❌ fehlt · 🌐 bewusst Web-only. Offene Punkte → **[`docs/TODO.md`](TODO.md)**.

Kurzfassung: Android + iOS haben seit dem 06-28-Audit **fast volle Web-Parität** erreicht (Home,
Sessions mit allen Scopes, Community/Leaderboards/Medien, Chat inkl. DM/Push-Abo/Blockieren,
Session-Detail mit Farb-Modi/Glättung/Marker/Lauf-Auswahl/Trim/Löschen/Watt, Vergleich, Datenseiten +
Off-Foil, Einstellungen, i18n 10 Sprachen, Caching). Rein Web-zentriert bleiben Admin, Labeling,
FIT-Import und die „Optimal"-Färbung.

## Stand 2026-08-17 — Rueckstand seit dem letzten Handy-Release (Arbeitsliste fuer die naechste Runde)

**Bezugspunkte** (nur WIRKLICH freigegebene Versionen, s. `appmeta.py`): Android **1.1.20** live
09.08. · Wear **1.2.20** live 09.08. · iOS/Apple **1.1.22** live 13.08. · Garmin 1.0.78 live 17.08.
Gebaut-aber-nicht-live: Android 1.1.21, Wear 1.2.22 (beide eingereicht, warten auf Freigabe).
Die PWA lief seitdem 8 Tage weiter — das ist dieser Rueckstand.

**Jans Beobachtung, am Code geprueft: sie stimmt, aber differenzierter als gedacht.** Die Apps haben
den Uhr-Ansichten-Editor durchaus (`DataFieldsScreen.kt` / `DataFieldsView.swift`), inklusive aller
DREI Seitenlisten (`pages` / `off_foil_pages` / `pause_pages`) und der Schalter `layouts_enabled` +
`browse_all_pages`. Es fehlen **zwei Einstellungen** und **der ganze Weg zu Layouts**:

| Einstellung (PWA `ViewsEditor`) | Feld | Android | iOS | Anmerkung |
|---|---|---|---|---|
| Werte je nach Hoehe einfaerben | `colorByValue` | ✅ 17.08. | ✅ 17.08. | |
| Aufnahme automatisch starten (GPS) | `auto_start` | ❌ | ❌ | ein Schalter. ACHTUNG: Androids `autoStart` in `RecordScreen.kt` ist `phone_autostart`, also der HANDY-Recorder — nicht diese Uhr-Einstellung. Nicht verwechseln. |
| Eigene Layouts an meine Uhren senden | `layouts_enabled` | ✅ | ✅ | |
| In Pause/Off-Foil alle Seiten blaettern | `browse_all_pages` | ✅ | ✅ | |
| Hinweis „Rate jetzt pro Uhr" | — | ✅ 17.08. | ✅ 17.08. | ersetzt durch die Einleitung über der Uhren-Liste (`devicesSettingsIntro`) |
| Link „Layouts der Community" | — | ✅ 17.08. | ✅ 17.08. | Galerie gebaut (ansehen + kopieren) |
| Link „Eigene Layouts" | — | 🌐 | 🌐 | bewusst Web-only: der Editor bleibt am Rechner, die Apps verlinken dorthin |
| Puls-Zonen | `hr_zones` | ✅ 26.08. | ✅ 26.08. | fuenf Zonen im Profil; ohne eigene Einstellung Server-Vorschlag aus dem gemessenen Hoechstpuls. Android Zahlenfelder, iOS Stepper |
| Wert-Grafiken in der Layout-Vorschau | `typ 8/9` | ✅ 26.08. | ✅ 26.08. | lesende Vorschau (Rand-Grafik/Balken), Zonenfarben aus denselben Profil-Zahlen. Gebaut, noch nicht eingereicht |

**ENTSCHEIDUNG Jan (17.08.): Layout-EDITOR bleibt Web-only** („das macht man eh nur am pc") — in
den Apps steht stattdessen ein Hinweis auf den Browser (`datafields.editorInBrowser`).
**Anzeige und Auswahl per Vorschau sind gebaut** (17.08.): lesende Renderer in
`android/.../LayoutRender.kt` und `watch-apple/Sources-iOS/LayoutRender.swift`, beide Spiegel von
`web/src/components/LayoutPreview.tsx` mit denselben ausgerechneten Groessenfaktoren.
**OFFEN bleibt die Community-Galerie** (Browsen + Kopieren) — der Renderer dafuer steht schon.

**Ausgangslage war: Layout-Editor und Community-Galerie gab es nativ
GAR NICHT** (`LayoutGallery`/`LayoutEditor`/`layouts/community`: 0 Treffer in beiden Apps). Nativ
kann man eigene Screens also nur EINBINDEN, nicht erstellen, nicht ansehen und nicht aus der
Community kopieren — und eingebunden werden sie ueber den NAMEN. Das ist derselbe Mangel, den Jan
am 17.08. in der PWA gemeldet hat (dort jetzt Vorschau-Auswahl, `c21159d`): die Apps zeigen in der
Seitenliste `name` bzw. `account.layoutMissing`. Der Renderer waere je Plattform neu zu bauen
(Compose Canvas / SwiftUI Canvas) — deutlich mehr Arbeit als alles andere hier. Zu entscheiden:
komplett bauen, nur eine LESENDE Vorschau (reicht fuer Auswahl + Galerie, kein Editor), oder
bewusst Web-only lassen und in den Apps darauf verlinken.

### Vorgeschlagene Reihenfolge — **ALLE NEUN PUNKTE ERLEDIGT (17.08.)**

Android kompiliert nach jedem Schritt (`:app:compileDebugKotlin`), alle geaenderten
Swift-Dateien mit `~/swift-6.1 -parse` geprueft UND die Member gegen die Deklarationen
abgeglichen — der Parse allein findet solche Fehler nicht (memory `swift-parse-check-limits`).
Damit sind die Handy-Apps wieder auf dem Stand der PWA; der Layout-EDITOR bleibt bewusst
Web-only.

| # | Feature | PWA seit | Android | iOS | Aufwand |
|---|---|---|---|---|---|
| 1 | `colorByValue` + `auto_start` im Ansichten-Editor | laenger | ✅ `5d842c7`+ | ✅ | **ERLEDIGT 17.08.** — beide Schalter, Reihenfolge wie PWA |
| 2 | Uhr-Einstellungen je Uhr: Aufzeichnungsmodus **+ GNSS-Stufe** | `ff05b63` 16.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT** — GNSS-Auswahl je Uhr, nur Garmin |
| 3 | Hilfetexte zu den Uhr-Einstellungen | `06875ee`/`1f8e94d` 17.08. | ✅ 17.08. | ✅ 17.08. | Einleitung + GPS-Warnung + Amazfit-Hinweis. OFFEN: der Hinweis nach dem VERBINDEN (eigene Pair-Screens) |
| 4 | Layout-Vorschau + Community-Galerie | `c21159d` 17.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT** — lesende Renderer + Galerie (ansehen/kopieren). Editor bleibt Web-only |
| 5 | Hoechstpuls je Lauf in der Lauf-Tabelle | `8eca181` 17.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT** — Spalte nur wenn Puls da; "#" schmaler wegen fehlendem Horizontal-Scroll |
| 6 | Trainingskurve: Puls nach 1/2/5 min ueber die Sessions | `b6042d6`+ 17.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT** — in der Verlaufsansicht, bestehender LineChart um `vmin` erweitert |
| 7 | Eigene Rekorde nach Sportart (Default = haeufigste + Auswahl) | `59175be` 17.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT** — Auswahl nur bei mehr als einer Sportart |
| 8 | Zeitraum wirkt auf die REKORDE der Startseite | `82bd931` 10.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT**. KORREKTUR: es gab gar keinen Waehler — die Fenster-Liste beschriftete nur die Carve-Kacheln |
| 9 | Community-Rekord „Meiste Carves >180°" | `d767a1c` 16.08. | ✅ 17.08. | ✅ 17.08. | **ERLEDIGT** — nutzerbezogen, deshalb ohne Link/Datum/Spot |

**Bewusst NICHT portieren:**
- Leaflet-Tastenfehler (`57d15d6`, `3e02a66`) — 🌐 die Apps nutzen keine Leaflet-Karte.
- OAuth-Bruecken/Service-Worker (`dbb7855`) — 🌐 reine Web-Infrastruktur.
- Willkommenstext im leeren Aussortiert-Tab (`99077b2`) — der Fehler existiert nativ NICHT: die
  Apps haben diesen Onboarding-Leerzustand gar nicht (`emptyTitle`/StartHelp: 0 Treffer).
- Datenfeld 21 im Layout-Editor (`0e4fadb`) — der Editor ist Web-only (s. o.). Das FELD selbst
  liegt auf allen vier Uhren, nur der Editor-Eintrag ist Web.
- Amazfit-Layoutgroessen im Editor (`99077b2`) — dito.

**Belegt vs. offen:** Die ❌/0-Treffer-Aussagen oben sind per Volltextsuche ueber
`android/app/src/main/java` und `watch-apple/Sources-iOS` belegt. Die ⚠️ heissen „Grundlage da,
Detail ungeprueft" — dort ist beim Umsetzen zuerst nachzusehen, was genau fehlt, statt es
anzunehmen.

### Durchgang durch die Ansichten (Auftrag Jan: „geh die anderen Ansichten einmal durch zur Kontrolle")

Je Element am **exakten i18n-Key** gesucht, nicht nach Themenwoertern — ein Wort wie „carve" kommt in
beiden Apps vor, die neue Kachel trotzdem nicht.

**Startseite (nativ `HomeScreen.kt` / `HomeView.swift`).** WICHTIG, korrigiert eine Annahme aus der
Tabelle oben: das IST die persoenliche Startseite (`phome.hello`, `phome.latest`, `side.records`),
nicht die Community-Seite — die PWA trennt das in `PersonalHome.tsx` und `Home.tsx`. Vorhanden sind
Begruessung, letzte Sessions, alle **fuenf** Rekord-Kacheln, der Accel/alle-Umschalter, die
Gesamt-Kacheln, Startquote, Klassifikations-Hinweis und der Uebertragungs-Hinweis.
Fehlt: `side.recordsHint` (Erklaertext an den Rekorden) · `home.sortedOut`/`home.sortedOutN` (der
Hinweis-Link auf frisch aussortierte Sessions — in der PWA ein amber Banner) · und der
**Zeitraum-Umschalter existiert** (`HOME_STAT_WINDOWS`, Zeilen 432/448), wirkt aber nur auf den
Statistik-Block, NICHT auf die Rekorde. Genau das war die Aenderung vom 10.08.: derselbe Zeitraum
steuert Rekorde und Gesamtwerte aus einer Abfrage.

**Community.** Die neue Rekord-Kachel „Meiste Carves >180°" fehlt in beiden: `rec.carves180`
→ 0 Treffer. (Die Carve-ZAEHLUNG je Session ist dagegen da, daher stand `carve` mit 4 Treffern in
der Tabelle oben — deshalb am Key pruefen, nicht am Thema.)

**Verlauf/Historie.** Die Trainingskurve fehlt komplett: `hr.progressTitle`, `hr.progressHint`,
`hr.afterMinutes`, `hr.fromRuns` → alle 0 in beiden Apps. Das ist der aufwendigste Punkt der Liste,
weil dort ein Diagramm neu entsteht und `hr_by_min` bisher nirgends nativ gelesen wird.

**Session-Detail.** Die Lauf-Tabelle existiert in beiden, die neue Spalte Hoechstpuls nicht:
`sd.colMaxHr` → 0 Treffer. Kleiner Zusatz an einer bestehenden Tabelle.

**Nicht betroffen** (geprueft, kein Rueckstand): Sessions-Liste, Chat/DM, Vergleich, Spots, Foils/
Katalog, Impressum. Der Willkommens-Leerzustand, den ich heute in der PWA repariert habe, existiert
nativ gar nicht — dort ist also nichts nachzuziehen.

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
| Katalog-Kennzeichen „Masse abgeleitet" | ✅ | ✅ | ✅ | — |
| „Fehlt im Katalog?" -> Feedback mit einem Klick | ✅ | ✅ | ✅ | — |

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
| Carve-Ansicht (GPS-Turns, farbig nach Lage) | ✅ | ✅ | ✅ |
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
| Vollbild-Karte | ✅ | ✅ | ✅ |
| Session-Datei laden (GPX + FIT, nur eigene) | ✅ | ✅ 26.08. | ✅ 26.08. |
| Spot-Beschreibungen (Text + Fotos je Nutzer, Herzchen) | ✅ | ✅ | ✅ |
| Per-Session-Diskussion (session-Chat) | ❌ | ❌ | ❌ |

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
| Farb-Modus an/aus (Uhr) | ✅ | ✅ | ✅ |
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
| Accel 25 Hz → Pump-Erkennung | ✅ | ✅ seit 1.0.6 (live 24.08.; `Accelerometer` aus `@zos/sensor`, Chunks wie Garmin) |
| On-Device-Lokalisierung + Systemsprache/EN-Default | ✅ | ✅ (`setLang` aus der Profil-Sprache, Rückfall Englisch) |
| Wert-Grafiken in Layouts (`typ 8/9`) | ✅ 1.0.79 | ✅ gebaut (CANVAS statt ARC, s. TODO) — Version noch nicht gebumpt |
| Update-Hinweis (`latestVersion` aus `/config`) | ✅ | ✅ |
| Aktivitätstyp Garmin/FIT (nur Garmin relevant) | ✅ | – |
Build/Verify nur auf Jans Mac (Zeus CLI + Balance 2). Details: Memory `zepp-recorder`.
