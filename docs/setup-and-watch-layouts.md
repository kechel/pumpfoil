# Detailed Setup + Advanced Watch-Layouts — Design

Ergebnis der Design-Runde vom 2026-07-26 (Jan + Claude). Zwei unabhängige Features, hier
festgehalten, damit die Entscheidungen nicht verloren gehen. Offene Punkte am Ende.

---

## Feature 1 — Detailed Setup (Stab / Mast / Shim / Board)

**Grundentscheidung:** KEIN kombiniertes „Setup"-Objekt. Jede Komponente verhält sich **1:1 wie
Foils heute**: Katalog → „meine" markieren (stehen dann oben) → einen Default setzen → pro Session
umstellen. Begründung Jan: in der Realität wechselt man an einem Tag meist nur Stab oder Shim,
nicht ganze Kombis.

| Komponente | Katalog | Nutzer-Auswahl (`users.settings_json`) | Session-Override |
|---|---|---|---|
| Stab | Tabelle `stabs` + `server/app/data/stabs.json` — **nur Bezeichnung** (brand/model/size); `user_id` NULL = allgemeine Liste, gesetzt = privater Eintrag des Nutzers | `my_stabs[]`, `stab_id` | `Session.stab_id` |
| Mast | keiner (keine Modelle) — nur Länge cm | `my_masts[]` (z. B. `[75, 85]`), `mast_len_cm` | `Session.mast_len_cm` |
| Shim | keiner — nur Gradzahl, 1 Dezimale (`+2`, `+1.5`, `0`, `-0.5`) | `my_shims[]`, `shim_deg` | `Session.shim_deg` |
| Board | kein Katalog (Recherche-Aufwand ≫ Nutzen) → eigene Einträge: Name + optional Volumen/Länge | **Tabelle `boards`** (user-eigene Zeilen) + `board_id` als Default | `Session.board_id` |

**Abweichung vom ersten Entwurf (bewusst, 2026-07-26):** Boards liegen in einer eigenen Tabelle
`boards` (user_id, name, volume_l, length_cm) statt als Liste in `settings_json`. Grund: `Session.
board_id` ist dann ein echter Fremdschlüssel (referenzielle Integrität), und Name/Volumen/Länge sind
Spalten statt verschachteltem JSON. In den Settings steht nur noch der **Default** (`board_id`) —
ein `my_boards[]` braucht es nicht, weil die Tabelle bereits pro Nutzer ist. Beim Löschen eines
Boards werden referenzierende Sessions auf „Standard" zurückgesetzt und ein etwaiger Default geleert.

**Status F1-Server-Layer — ERLEDIGT 2026-07-26:** Modelle `Stab` und `Board`; Session-Spalten
`stab_id`/`mast_len_cm`/`shim_deg`/`board_id` (je NULL = Nutzer-Standard) inkl. Migration;
Settings-Keys `my_stabs`/`stab_id`/`my_masts`/`mast_len_cm`/`my_shims`/`shim_deg`/`board_id` mit
Validierung (Mast 30–130 cm, Shim −5…+5° auf 1 Dezimale, Dedupe, Default impliziert Mitgliedschaft,
Board nur mit Eigentümer-Prüfung); `GET /api/stabs` + `/api/stabs/brands`; Boards-CRUD
(`GET/POST/PUT/DELETE /api/boards`); Session-Meta-Patch akzeptiert alle vier; `setup`-Block in der
Session-Ausgabe mit `*_is_default`-Flags. Live gegen alle Endpunkte verifiziert (inkl.
Müll-/Clamping-/Dedupe-Fälle und Fremd-Board → null); Testdaten wieder entfernt.
**Status F1-PWA — ERLEDIGT 2026-07-26:** Seite **`/setup`** (`web/src/pages/Setup.tsx`, Route
`/setup`), verlinkt per rechtsbündigem Button auf Höhe der „Meine Foils"-Überschrift. Mast + Shim
als Chip-Listen (Klick = Standard, `×` = entfernen; Komma **oder** Punkt als Dezimaltrenner; die UI
übernimmt die Server-Antwort, zeigt also das validierte Ergebnis). Boards anlegen/löschen. Stabs mit
Suche + Markenfilter; eigene Bezeichnungen anlegen/löschen (Marke/Modell/Größe).
**`FoilSelect`** (Session-Detail) zeigt/ändert jetzt Foil **+ Stab + Mast + Shim + Board**;
Auswahlfelder erscheinen nur für Komponenten, die der Nutzer eingerichtet hat (Badge-Zeile bleibt
schlank), Fremde sehen Chips. Leere Auswahl = Nutzer-Standard (geerbt) — live verifiziert über die
`*_is_default`-Flags (geerbt ↔ explizit ↔ zurück).

**Anzeige-Konvention (Jan, 2026-07-26 nachgeschärft):** immer **Marke + Modell + Größe**
ausschreiben, auch in Auswahllisten (z. B. „GONG Stab Trail L") — **und sonst nichts.** Die
Größenbezeichnung ist herstellereigen: GONGs S/M/L ist *nicht* die Schaftlänge, sondern die
Kombination aus Schaftlänge und Fläche (abgestimmt auf die gleichnamigen Trail-Foils L/XL/XXL).
Deshalb wird sie **wörtlich übernommen und nie umgerechnet oder interpretiert**. Maße (span/area)
pflegen wir gar nicht mehr: es rechnet nichts damit, und geraten wäre schlechter als weglassen.
Die Spalten bleiben in der DB, werden aber nicht mehr geseedet/angezeigt.

**Status F1-Bezeichnungen — ERLEDIGT 2026-07-26:** `stabs.json` enthält nur noch Bezeichnungen
(GONG Stab Trail S/M/L + Sabfoil/AXIS/North wie recherchiert). Fehlt eine Bezeichnung, legt der
Nutzer sie über `POST /api/stabs` **privat** an (`Stab.user_id`) — sichtbar nur für ihn, fremde
private Einträge sind weder in der Liste noch als Default/Session-Override wählbar (409 bei
gleichlautender Bezeichnung, weil die Variante DB-weit eindeutig ist). Gute private Einträge
übernehmen wir später von Hand in die allgemeine Liste bzw. recherchieren dann gezielt nach.
`DELETE /api/stabs/{id}` nur für eigene Einträge; referenzierende Sessions und ein etwaiger Default
fallen auf „Standard" zurück. Live verifiziert (Sichtbarkeit, 409, Fremd-ID → null, Delete-Cleanup).
Nebenbefund: der Seeder lief in 4 Workern in `uq_stab_variant` → `IntegrityError` wird jetzt
abgefangen (Worker-Rennen, harmlos).

- **Neue Seite `/setup`** („Detailed Setup"), verlinkt per rechtsbündigem Button auf Höhe der
  Überschrift „Meine Foils" (`web/src/pages/Foils.tsx:87-93` → Flex-Wrapper um das `h2`).
- **Session-Auswahl:** `web/src/components/FoilSelect.tsx` um Stab/Mast/Shim/Board erweitern
  (eigene markierte oben in der Liste).
- **Stats mitnehmen**, wo auffindbar — aber zunächst **rein informativ**: die Analyse-Pipeline nutzt
  Foil-Geometrie ohnehin nicht (nur `foil_physics.alarm_speeds` für die Uhr-Alarme).
- **Scope:** erst PWA + DB. Uhren/native Apps später.

**Stolpersteine (verifiziert):**
- `PUT /api/settings` ist eine **Whitelist** (`server/app/api/settings.py:86-186`) — unbekannte Keys
  werden still verworfen. Alle neuen Keys müssen dort ergänzt + validiert werden.
- `_seed_foils()` (`server/app/db.py:101-132`) **aktualisiert bestehende Zeilen nicht**, nur Inserts.
  Der Stab-Seeder macht es genauso — es gibt nichts zu korrigieren, weil nur Bezeichnungen drinstehen.
- Migration: kein Alembic → `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in `server/app/db.py:43-92`;
  neue Tabellen kommen über `Base.metadata.create_all`.

---

## Feature 2 — Advanced Datenfeld-Layouts (frei positionierbar)

### Was der Nutzer bekommt
Felder + Labels frei positionieren, Größe (Stufen) und Farbe wählen, **Hintergrundfarbe** setzen,
**Trennlinien** ziehen — in wählbarer Form (rund/eckig, je nach Uhr). Plus **Community**: Layouts
`publish`en, fremde Layouts in der Galerie ansehen, ins eigene Profil **kopieren**, anpassen, neu
publishen.

### Drei Kategorien (jedes Layout hat eine)
| Kategorie | UI-Name | Anzahl | ersetzt heute |
|---|---|---|---|
| `on_foil` | „Während des Laufs" | beliebig viele (wischbare Seiten) | `views[]` |
| `off_foil` | „Nach dem Lauf" | genau eine | `off_foil_view` |
| `pause` | „Pause zwischen den Läufen" | genau eine | `pauseView` — **heute auf allen 4 Plattformen hartcodiert** und nicht mal in `/api/devices/config` enthalten |

⚠️ Nicht verwechseln: `pauseView` = Dümpeln **zwischen** Läufen (Übersichtsseite nach der 8-s-Lauf-
Zusammenfassung). Der harte **Aufnahme-pausiert**-Screen (`RecordView._drawPaused`, Feature aus
1.0.63) bleibt funktional wie er ist (muss „Pausiert" + Fortsetzen zeigen) und übernimmt nur die
Hintergrundfarbe/Palette.

### Datenmodell
Neue Tabelle `watch_layouts`: `id, user_id, name, category (on_foil|off_foil|pause),
shape (round|rect), bg_color, elements, published, copied_from_id, created_at, updated_at`
+ **Entstehungs-Display** `authored_w, authored_h, authored_shape` (Entscheidung Jan): auf welcher
Displaygröße/Form das Layout **entworfen** wurde.

**Der Entstehungs-Wert ist ein Hinweis, keine Schranke** (ausdrücklich Jan): In der Galerie kann man
damit **filtern/sortieren** („passt zu meiner Uhr") und jedes Layout trägt ein Badge à la
„entworfen für 240×240 rund". Aber **kopieren darf man jedes Layout** — auch von einer anderen
Größe/Form — und es dann anpassen. Kein Gate, keine Pflicht. Da die Koordinaten relativ (0…1000)
sind, rendert jedes Layout überall; die Größe sagt nur, wo es garantiert gut aussieht.

**Galerie-Vorschau standardmäßig in der Größe der EIGENEN Uhr** (so sieht man sofort, was es für
einen selbst bedeutet), umschaltbar auf „wie der Autor es entworfen hat" — nutzt denselben
Größen-/Form-Umschalter wie der Editor.

**Ein Layout = eine Seite.** Die Seitenliste des Nutzers ist eine Mischung aus klassischen
3-Slot-Views und Advanced-Layouts → Wischen bleibt unverändert.

**Zuordnung — UMGESETZT 2026-07-26** (Jan: „frei mischbar ja, off-foil & pause unter den on-foil
screens jeweils als eigener abschnitt mit entweder datenfeld oder auswahl eines custom screens"):
- `settings.pages` = EINE geordnete Liste; ein Eintrag ist `[a,b,c]` (3-Feld-Seite) **oder** eine
  Zahl (`watch_layouts.id`, Kategorie `on_foil`). Sortieren/Löschen/Einfügen im Datenseiten-Tab.
- `settings.views` bleibt daneben die reine 3-Feld-Liste und wird beim Speichern daraus
  **abgeleitet** — alte Uhr-Apps (Garmin/Wear/Apple) lesen weiter nur `views` und sehen dadurch
  nie eine halbe Seite. Nie konfiguriert -> `pages` wird beim GET aus `views` erzeugt.
- Off-Foil und Pause sind eigene Abschnitte mit Umschalter **Datenfelder ↔ eigener Screen**
  (`off_foil_layout_id` / `pause_layout_id`, null = Felder). Die 3-Feld-Variante bleibt gespeichert,
  Zurückschalten verliert also nichts. Layout-IDs werden serverseitig gegen **Eigentümer UND
  Kategorie** geprüft (ein `on_foil`-Layout ist als Off-Foil-Screen nicht wählbar).
- Beim Löschen eines Layouts räumt der Delete-Endpoint die Verweise mit auf (`pages`-Eintrag raus,
  Off-Foil-/Pausen-Wahl auf null) — sonst zeigte eine Seite auf ein gelöschtes Layout.
- `/api/devices/config` liefert weiterhin NUR die 3-Feld-Views: die Uhr kann Layouts noch nicht,
  und ein zusätzlicher Key ohne Renderer wäre nur Ballast. Das kommt mit P2.

### Vorschau auf echten Uhren-Größen (Entscheidung Jan)
Die Vorschau/Platzierung ist auf **Uhren-Größe + Form umschaltbar** — man baut das Layout also für
die Uhr, die man wirklich trägt, und kann gegenprüfen, wie es auf anderen wirkt.

**Datenlage (geprüft 2026-07-26):**
- **Garmin: vollständig vorhanden** — `watch/bin/catalog.json` (aus dem SDK erzeugt,
  `watch/build-all.sh:52-89`) liefert je Gerät `w`/`h` + `family` (= Form). Verteilung: **108 round,
  8 semioctagon** (Instinct-Klasse!), **5 rectangle**, 2 unbekannt. Auflösungen **176×176 … 454×454**,
  häufigste 240×240 (36 Geräte), dann 390×390 (22). Ausgeliefert via `GET /api/app/devices`
  (`server/app/main.py:101-111`). TODO nebenbei: die 2 Einträge mit `w/h = null` (fehlende
  `compiler.json` im Build-Dir) reparieren; `memoryLimit` mit aufnehmen (s. Geräte-Gating).
- **Apple Watch + Wear OS: keine Daten im Repo.** Statt Modell-Listen zu pflegen (Apple ~9 Größen,
  Wear Wildwuchs, jährlich neue) **meldet die Uhr ihre Maße selbst** beim Config-Abruf — analog zur
  heute schon gemeldeten `part_number` (`server/app/api/devices.py:73-84`, Query `?v=&p=&pn=`).
  Neue Felder auf `DeviceToken`: `screen_w`, `screen_h`, `shape (round|rect|semioctagon)`.
  Alle drei Plattformen können das liefern: Apple `WKInterfaceDevice.screenBounds`, Wear
  DisplayMetrics, Garmin `dc.getWidth/getHeight`. Immer korrekt, auch für künftige Modelle,
  null Pflegeaufwand.

**Editor-Geräteauswahl:** zuerst die **eigenen gepairten Uhren** (echte Maße/Form aus `DeviceToken`,
über `/api/devices/list` ausgeliefert), dazu generische Größen als Fallback (Garmin aus dem Katalog;
für Apple/Wear eine kleine Auswahl gängiger Größen, bis eine Uhr ihre Maße gemeldet hat). Da die
Koordinaten relativ (0…1000) sind, skalieren Layouts automatisch — die Auswahl ist ein **Prüf- und
Formwerkzeug**, kein zweiter Datensatz.

**Overflow-Warnung:** der Editor prüft das Layout gegen die **kleinste relevante Größe** (176×176,
Instinct-Klasse) und warnt, wenn Werte/Labels kollidieren oder rauslaufen — Textbreiten und
Font-Stufen unterscheiden sich zwischen 176×176 und 454×454 drastisch.

**Vorschau mit Umschalter** (Entscheidung Jan): die Editor-/Galerie-Vorschau kann zwischen
**Feldnamen** (Struktur-Ansicht — beim Anordnen sieht man, welches Feld wo liegt) und
**Beispieldaten** (realistische Werte wie `34,2 km/h`, `142 bpm`, `1:12:44` → zeigt, wie es im
Einsatz wirklich aussieht, inkl. Textbreiten und Farb-Buckets) umschalten. Mock-Werte gibt es schon:
`web/src/pages/Account.tsx:465-478` (`WatchPreview` + Farb-Buckets) — von dort übernehmen, damit
Editor, Galerie-Vorschau und bestehende Mini-Vorschau dieselbe Quelle nutzen.

**Vorschau in der Sprache des Nutzers** (Entscheidung Jan) — deckt eine bestehende Lücke auf:
- Die Uhr zieht ihre Feld-Labels **lokalisiert** aus `watch/source/Strings.mc` (Keys `f.*`,
  13 Sprachen), die Web-UI nutzt dagegen **hartcodierte deutsche** Labels
  (`web/src/lib/fields.ts:3-26`) — betrifft heute schon die Dropdowns im einfachen Views-Editor.
  → `fields.ts` auf i18n-Keys umstellen und die **kurzen Uhr-Formulierungen** übernehmen
  (`km/h Ø`, `letzter Lauf`, …), nicht längere Web-Wordings. Sonst lügt die Vorschau bei den
  Textbreiten und die Overflow-Warnung ist wertlos.
- **Fallback-Wahrheit zeigen:** Garmin kann **ja/zh nicht darstellen** (keine CJK-Glyphen in den
  Built-in-Fonts, s. Kommentar in `Strings.mc:10-13`) und weicht auf System-/Englisch aus; der
  Lite-Build (96-KB-Uhren) ist **immer Englisch**. Die Vorschau muss also die Sprache anzeigen, die
  die Uhr **tatsächlich** rendern würde — inkl. kurzem Hinweis, wenn das nicht die Profilsprache ist.

### Element-Typen
| Typ | Inhalt | frei positionierbar |
|---|---|---|
| **Wert** | Live-Wert eines Datenfelds (IDs 0–20) | ✅ Position, Größenstufe, Farbe |
| **Übersetztes Label** | die Bezeichnung eines Datenfelds — referenziert den i18n-Key (`f.*`), wird **in der Sprache der Uhr gerendert** | ✅ **unabhängig vom Wert** platzierbar |
| **Freitext-Label** | eigener Text des Nutzers | ✅ — wird **nicht übersetzt** (s. u.) |
| **Trennlinie** | Linie mit 2 Punkten + Dicke/Farbe | ✅ |
| **REC-Indikator** | roter Punkt + „REC" | ✅ verschiebbar/einfärbbar/löschbar |
| **Seiten-Punkte** | Pagination (Anzahl dynamisch) | ✅ verschiebbar/einfärbbar/löschbar |

**Label und Wert sind entkoppelt** (Entscheidung Jan): heute zeichnet die Uhr das Label starr
`cy+30` unter den Wert (`RecordView.mc:360`). Künftig ist das Label ein **eigenes Element** — man
kann es woanders hinsetzen, kleiner/größer machen, anders färben oder ganz weglassen.

**Freitext-Labels** (Entscheidung Jan): frei eintippbarer Text, wird **as-is gespeichert und nie
übersetzt** — kopiert ein Nutzer mit anderer Sprache das Layout, bleibt der Text in der
Originalsprache (naturgemäß). Konsequenzen, die ich mitbaue:
- **Zeichensatz-Warnung:** die Uhr rendert mit Built-in-Fonts → **CJK und Emoji erscheinen als
  Kästchen** (Garmin hat keine CJK-Glyphen, s. `Strings.mc:10-13`); Latein + Kyrillisch gehen.
  Der Editor warnt bei nicht darstellbaren Zeichen.
- **Längen-/Anzahl-Limit** (z. B. ~12 Zeichen, wenige pro Layout): Strings landen im Object Store der
  Uhr, und Object-Store-Volllauf ist ein bekannter Fehlerpfad.
- **Galerie-Hinweis:** ein geteiltes Layout mit Freitexten zeigt ein Badge à la „enthält eigene Texte
  (Deutsch)", damit klar ist, dass man die nach dem Kopieren evtl. anpassen will.

**Element-Format kompakt** — `[typ, x, y, size, color, flags]` (+ Zusatzfeld: 2. Punkt bei Linien,
Feld-ID bei Wert/Label, Text bei Freitext). **Keine Dicts mit String-Keys**: die Uhr cached das Server-JSON im Object Store
(`SessionRecorder.setScreensFromConfig`), und Object-Store-Volllauf ist ein bekannter Fehlerpfad.
**Koordinaten 0…1000 relativ** (die Garmin-App rechnet alles aus `dc.getWidth/getHeight` → über
alle Auflösungen und Formen tragfähig; im Katalog: 108 round, 5 rectangle, 8 semioctagon).

### Harte Constraints
- **Apple hat einen strikten Decoder** (`watch-apple/Sources/Api.swift:68`, `views: [[Int]]`) → das
  Layout kommt als **zusätzlicher, optionaler Key**; `views` bleibt unverändert. Sonst brechen alte
  Clients hart.
- **Garmin-Fonts sind diskret** (`FONT_XTINY … FONT_NUMBER_THAI_HOT`) → Größe als **Stufe**
  modellieren, nicht in px. Label-Abstand über `dc.getFontHeight()` statt des heutigen fixen `+30`.
  **Umsetzung (2026-07-26, Jans Wunsch „Schriftgröße je Element einstellbar"):** 9 Stufen =
  1:1 die eingebauten Fonts (`SIZE_STEPS` in `web/src/lib/watchLayout.ts`), je Element frei
  wählbar, mit Stufen-Name UND Font-Konstante im Editor. **Ab Stufe 5 sind es NUMBER-Fonts, die
  nur Ziffern enthalten** → nur Wert-Elemente dürfen dorthin; Labels/Freitexte kappt der Server
  auf `FONT_LARGE` (sonst wären sie auf der Uhr unsichtbar), die UI erklärt das.
- **Farbpalette kuratiert** — MIP-Displays können nicht beliebige Farben.
- **Kontrast**: heute geht die Uhr von dunklem Grund aus (Werte weiß, Labels hellgrau,
  `colorByValue`-Buckets ebenso). Editor warnt bei schlechtem Kontrast; Default-Hintergrund bleibt
  schwarz (= heutiges Verhalten).
- **Chrome sind normale Elemente** (Entscheidung Jan): der **REC-Punkt + „REC"** (heute fix
  `h*0.085`, `RecordView.mc:136-139`) und die **Seiten-Punkte** (heute fix `h*0.92`,
  `RecordView.mc:128-133`) werden **eigene Element-Typen** — also genauso frei **verschiebbar,
  einfärbbar und löschbar** wie Felder/Linien. Kein Sonderfall „reservierte Zone" im Editor.
  **Neue Layouts werden mit beiden vorbelegt**, an den heutigen Positionen → sieht per Default aus
  wie bisher, kann aber komplett umgebaut oder entfernt werden (z. B. für einen bildschirmfüllenden
  Speed-Wert). Die Seiten-Punkte bleiben dabei dynamisch (Anzahl = Seitenzahl); gespeichert werden
  nur Position + Farbe.

### Sicherheitsnetz (dreistufig) — Voraussetzung für den Rollout
1. **Schalter auf der Uhr** (Einstellungs-Menü: „Dynamische Layouts An/Aus"). Muss **ohne
   Handy/Server** erreichbar sein. Funktioniert auch im Crash-Fall, weil dynamische Layouts nur
   *während der Aufnahme* greifen — Start-Screen und Menü zeichnen die alte statische Logik.
2. **Canary / Selbstheilung**: beim Start einer Aufnahme mit dynamischem Layout ein Storage-Flag
   setzen, beim sauberen Beenden löschen. Ist es beim App-Start noch gesetzt → letzte Session ist
   abgestürzt → **automatisch** auf die statische Ansicht zurückfallen + Hinweis zeigen.
   Kosten: ein Storage-Write pro Session-Start/-Ende (NICHT pro Frame).
3. **Server-Kill-Switch**: pro Nutzer (Config-Key) und **pro Uhrenmodell** (deaktiviert das Feature
   für alle Nutzer eines Modells ohne App-Release). Muster existiert: `recordMode`-Kappung +
   `_is_low_accel_model` (`server/app/api/devices.py:41-58`).

Renderer liegt hinter `(:full)` → die 96-KB-Lite-Uhren bekommen den Code gar nicht.

### Geräte-Gating — MESSWERTE (2026-07-26, `mem` jetzt im Katalog)
`DeviceToken.part_number` → `watch/bin/partmap.json` → `watch/bin/catalog.json` → Tier.
`build-all.sh` übernimmt jetzt `appTypes[type=="watchApp"].memoryLimit` als `mem` in den Katalog.

**Es gibt kein 256-KB-Tier.** Ist-Verteilung der 121 Geräte:

| Budget | Geräte | kleinste Auflösung | Layouts? |
|---|---|---|---|
| 96 KB | 5 (Instinct 2/2S/2X, Crossover, Descent G1) | 163×163 | **nein** — Lite-Build, Renderer wird gar nicht mitkompiliert |
| 128 KB | 16 (fēnix 5/6, FR 55/245/645/935, Instinct 3/E …) | 166×166 | **nein** — genau hier crashte 1.0.64 unter Dauerlast |
| ≥512 KB | 100 | **218×218** (FR 255S) | **ja** |

Daraus folgt zweierlei:
- Die Schwelle ist faktisch **≥512 KB** (nicht 256 KB) → 100 von 121 Geräten.
- **Kein semioctagon-Gerät bekommt Layouts** (die Instinct-Klasse ist komplett ≤128 KB). Die
  Overflow-Prüfung im Editor lief anfangs gegen 176×176 — falsch, das Gerät kriegt den Renderer
  nie. Sie prüft jetzt gegen **218×218 round** (`SMALLEST` in `web/src/lib/watchLayout.ts`);
  176×176 und 208×208 bleiben als Vorschau-Größen mit dem Zusatz „kein Layout-Support".
- **Testplan-Konsequenz:** Jans fēnix 5 (128 KB) und die Instinct (96 KB) können den Renderer NICHT
  testen. Testgeräte sind FR 255S (218×218, kleinste taugliche) und z. B. fēnix 7X Pro (280×280).

`/api/devices/list` liefert bereits `screen_w`/`screen_h`/`shape`; `mem` kommt beim Editor-Gating dazu.

### Selbstlernender Kill-Switch je Modell (Entscheidung Jan, 2026-07-26)
Der Canary bleibt nicht auf der Uhr: **jede Uhr, die ihren Canary auslöst, meldet das beim nächsten
Config-Abruf an den Server.** Der Server zählt das je **Uhrenmodell** — und liefert Layouts für
dieses Modell künftig per Default nicht mehr aus. Damit heilt sich das Feature flotten-weit, ohne
dass ein Mensch eingreift, und neue Uhren desselben Typs bekommen von Anfang an die richtige
Voreinstellung.

Umsetzung (P2):
- Uhr: Canary-Flag im Storage beim Aufnahme-Start setzen, beim sauberen Ende löschen. Beim App-Start
  noch gesetzt → statisch fahren, Hinweis zeigen UND `canary=1` beim nächsten `/config` mitsenden.
- Server: Zähler je Modell (ausgelöst / sauber beendet). Auto-Aus für ein Modell, wenn mindestens
  **zwei verschiedene Uhren** dieses Modells ausgelöst haben (eine einzelne kann andere Ursachen
  haben) — plus Admin-Override in beide Richtungen, damit ein Fehlalarm ein Modell nicht dauerhaft
  aussperrt. Sichtbar im Admin-Bereich mit Zähler.

### Phasen
- **P0 — ERLEDIGT 2026-07-26** (bis auf Garmin, s. u.): `pause_view` in den Settings (Default
  `[12,20,2]` = Uhrzeit/Läufe/Puls, gemeinsamer Validator `_clean_view3` für Off-Foil + Pause),
  `pauseView` in `/api/devices/config` (live verifiziert), PWA-Block „Pausen-Ansicht" im
  Views-Editor (`Account.tsx`, i18n de+en), **Wear** liest `pauseView`, **Apple** liest es über einen
  **optionalen** Codable-Key. Fehlt der Key → alter hartcodierter Default. Nebenbei: Hinweistexte im
  Views-Editor von `text-xs` auf `text-sm` (stehende Regel: Hinweise nie winziger als normal).
  ✅ **Garmin nachgezogen 2026-07-26 (1.0.66):** `SessionRecorder` liest `pauseView` aus `/config`
  und cacht es in `pause_config` (Muster wie Off-Foil); beim App-Start kommt der Wert aus dem Cache.
  Fehlt Key ODER Cache, bleibt der hartcodierte Default `[Uhrzeit, Läufe, Puls]`. Der Zeichen-Teil
  brauchte nichts: `RecordView` nutzte schon `_rec.pauseView`. Damit ist **P0 auf allen vier
  Plattformen** durch. Build: 121 ok / 0 fehlgeschlagen, Lite-Build (96 KB) unverändert tragfähig
  (instinct2 54,8 KB).
- **P0 (Original-Beschreibung):** `pauseView` im **einfachen** 3-Slot-System konfigurierbar machen —
  Server liefert den Key, die 4 Clients lesen ihn (fehlt er → alter hartcodierter Default). Schließt
  eine Parität-Lücke, funktioniert auch auf speicherarmen Uhren, und testet genau den Config-Pfad,
  den die Advanced-Layouts danach brauchen.
- **P1:** Server + PWA komplett (Tabelle, API, Editor, Vorschau, Community-Galerie, Kopieren).
  **Keine** Uhr-Änderung.
  - **P1a Server — ERLEDIGT 2026-07-26:** Tabelle `watch_layouts` (Modell `WatchLayout`, kommt über
    `Base.metadata.create_all`) + `server/app/api/layouts.py`:
    `GET /api/layouts/meta` (Palette + Grenzen als **eine** Quelle für PWA/Uhr),
    `GET /api/layouts` (eigene, optional je Kategorie), `POST`/`PUT`/`DELETE`,
    `POST /{id}/publish?published=`, `POST /{id}/copy`, `GET /api/layouts/community`
    (veröffentlichte + Autor + `copies`-Zähler + `has_freetext`-Badge, Filter Kategorie/Form/Größe).
    Elemente werden **serverseitig normalisiert**: unbekannte Typen und leere Freitexte fliegen raus,
    unvollständige Linien (kein 2. Punkt) fliegen raus, x/y auf 0…1000, Größe 0…4, Farbe auf den
    Palette-Index, Freitext auf 12 Zeichen (Steuerzeichen weg), max. 24 Elemente pro Layout und
    40 Layouts pro Nutzer. Live verifiziert: Müll-Elemente, Fremdzugriff (PUT/DELETE/publish auf
    fremdes Layout → 404), Kopieren eines **unveröffentlichten** fremden Layouts → 404, Kopie behält
    Elemente + Herkunft + Entstehungs-Größe, `copies`-Zähler, Größenfilter, und beim Löschen des
    Originals bleibt die Kopie (nur `copied_from_id` → NULL). Testdaten wieder entfernt.
  - **P1b Vorschau-Fundament — ERLEDIGT 2026-07-26:** `web/src/lib/watchLayout.ts` ist die
    **gemeinsame Quelle** für alle Uhr-Vorschauen (Element-Typen, Palette als Spiegel des Servers,
    Größenstufen als Faktoren, Beispieldaten + Farb-Buckets, Displaygrößen-Liste inkl.
    176×176-Instinct als kleinste relevante Größe, Default-Elemente für neue Layouts mit REC-Punkt
    und Seiten-Punkten an den heutigen Positionen, Zeichensatz-Prüfung für Freitexte).
    Die **Label-Lücke ist geschlossen**: `fw.<Feld-ID>` in **allen 13 Uhr-Sprachen** direkt aus
    `watch/source/Strings.mc` erzeugt (Spaltenreihenfolge de/gsw/de-AT/en/fr/it/es/pt/id/ru/nl/fi/cs,
    Distanzfelder inkl. Einheit+Wort wie `RecordView._drawField` sie zusammensetzt) — die Vorschau
    zeigt jetzt dieselben kurzen Texte und damit dieselben Breiten wie das Gerät. ja/zh haben
    absichtlich keine Keys und fallen auf Englisch zurück: genau das rendert die Uhr auch (keine
    CJK-Glyphen). Der bestehende 3-Slot-`WatchPreview` in `Account.tsx` nutzt jetzt dieselbe Quelle
    (vorher hartcodiert deutsch). Dazu die API-Bindings in `web/src/lib/api.ts`.
  - **P1b Editor — ERLEDIGT 2026-07-26:** `components/LayoutPreview.tsx` rendert ein Layout
    formgetreu (round / rect / semioctagon per `clip-path`), mit Hintergrundfarbe, allen sechs
    Element-Typen, Ausrichtung, Palette-Farben und dem Umschalter **Feldnamen ↔ Beispieldaten**.
    Seite **`/layouts`** listet die eigenen Layouts je Kategorie (neu anlegen, kopieren,
    veröffentlichen/zurückziehen, löschen) mit Badges „entworfen für", „enthält eigene Texte",
    „Kopie". Editor **`/layouts/:id`**: Elemente per **Ziehen** platzieren (Pointer-Events →
    0…1000-Skala, funktioniert auch auf Touch), Eigenschaften-Panel (Datenfeld, Größenstufe,
    Palette-Farbe, Ausrichtung, „Farbe nach Wert", Freitext, Linien-Endpunkt), Hintergrundfarbe,
    Kategorie, Uhrengrößen-Umschalter (12 Größen inkl. Instinct-Semioctagon, Apple, Wear) und
    **Warnblock**: Überlauf gegen die kleinste Uhr (176×176, Textbreite grob geschätzt) plus
    Zeichen, die die Built-in-Fonts nicht können. Beim Speichern werden `authored_w/h/shape` auf die
    gewählte Uhrengröße gesetzt — die Größe ist also Prüfwerkzeug UND Entstehungs-Angabe, kein
    zweiter Datensatz. Jede Seite sagt deutlich, dass die **Uhr die Layouts noch nicht zeigt**.
    Nebenbefund beim Build-Gate: das App-Bundle riss die Workbox-Grenze von 2 MiB → Build brach ab
    und der SW wäre ohne App-Shell rausgegangen. Grenze in `vite.config.ts` hochgezogen; das Bundle
    per Code-Splitting zu verkleinern ist als TODO notiert.
  - **P1c Galerie — ERLEDIGT 2026-07-26:** `/layouts/community` (Route VOR `layouts/:id`) zeigt
    veröffentlichte Layouts mit Autor, `copies`-Zähler, „enthält eigene Texte"-Badge und
    Entstehungs-Größe. Vorschau **standardmäßig in der Größe der eigenen Uhr**, je Karte umschaltbar
    auf „wie der Autor es entworfen hat"; Filter Kategorie/Form + Größen-Umschalter sind Komfort,
    kopieren darf man jedes Layout. Dafür liefert `/api/devices/list` jetzt `screen_w`/`screen_h`/
    `shape` mit — aufgelöst über `part_number` → `partmap.json` → `catalog.json` (`family` →
    round/rect/semioctagon). Damit ist die im Design offene Frage „woher kennt die PWA die Maße der
    Uhr?" für **Garmin** beantwortet; Apple/Wear melden ihre Maße weiterhin nicht (dort greift die
    Größen-Auswahl), das bleibt für P3.
    Live verifiziert: Galerie-Sichtbarkeit erst nach `publish`, Filter, Kopieren durch einen anderen
    Nutzer, `copies`-Zähler, SPA-Route. Testdaten wieder entfernt.

**F2 P1 ist damit abgeschlossen** (Server + PWA vollständig, KEINE Uhr-Änderung). Changelog-Eintrag
für Nutzer steht (26.07.).
- **P2:** Garmin-Renderer + Gating + Sicherheitsnetz.
  - **P2a Server-Auslieferung — ERLEDIGT 2026-07-26:** `/api/devices/config` liefert die Layouts
    kompakt und positionell aus — `[0,a,b,c]` = klassische 3-Feld-Seite, `[1,bg,[elements]]` =
    freies Layout; ein Tag-Byte vorneweg macht beides unterscheidbar, ohne String-Keys im
    Object Store. Keys: `layoutsOn` (die EINE Wahrheit für die Uhr), `pages`, `offFoil`, `pause`.
    `views`/`offFoilView`/`pauseView` bleiben unverändert daneben → alte Uhr-Apps merken nichts.
    Die Layout-Keys kommen **nur** mit, wenn `layoutsOn` — sonst bleibt die Payload klein.
    Drei Tore, alle live geprüft:
    1. **Gerät** ≥ 512 KB (`mem` aus dem Katalog). fēnix 5 (128 KB) bekommt `layoutsOn:false` und
       gar keine `pages` — verifiziert.
    2. **Modell** unauffällig: `?canary=1` am Config-Abruf zählt auf `DeviceToken.layout_canary_count`;
       sobald **zwei verschiedene** Uhren eines Modells gemeldet haben, ist das Modell aus
       (verifiziert: nach der ersten Meldung noch an, nach der zweiten aus). Admin-Override in
       `watch_model_flags` (`on|off|auto`) sticht die Automatik — verifiziert.
    3. **Nutzer**: `settings.layouts_enabled` (Default an) — verifiziert.
    Admin: `GET /api/admin/layout-health` (je Modell: Budget, taugliche Uhr?, Canary-Uhren/Limit,
    Canary-Events, Override, effektiver Zustand) + `POST /api/admin/layout-health/{model_id}?allowed=on|off|auto&note=`.
    Alle Tests mit dem Testkonto `emu-test` und Wegwerf-Gerätetoken; danach alles zurückgesetzt
    (Zähler 0, Flags weg, Testlayouts gelöscht).
  - **P2b Renderer — ERLEDIGT 2026-07-26 (1.0.66):** `RecordView` zeichnet freie Seiten.
    - `_drawLayoutPage(dc, [1,bg,[els]], …)`: Hintergrundfarbe, dann Trennlinien (liegen hinter
      Text, wie in der Web-Vorschau), dann der Rest. `_drawElement` deckt alle sechs Typen ab;
      Position aus `x/y ÷ 1000 × dc.getWidth()/getHeight()`, Ausrichtung aus den Flags,
      „Farbe nach Wert" über Bit 2.
    - `_layoutFont(step, typ)` mappt die Stufe auf den echten Garmin-Font und **kappt Labels/
      Freitexte bei `FONT_LARGE`** (NUMBER-Fonts haben nur Ziffern) — dieselbe Grenze wie im Server.
      `_layoutColor(idx, fallback)` spiegelt die Palette-Reihenfolge von Server und Vorschau.
    - **`_fieldParts(type)` herausgezogen**: Wert, Label und Farb-Bucket kommen jetzt aus EINER
      Quelle für die klassische 3-Feld-Ansicht und den Renderer — sonst driften Formatierung und
      Farben auseinander. Label-Abstand aus `dc.getFontHeight()` statt fixer 30 px (hilft auch der
      klassischen Ansicht auf 176-px-Uhren).
    - `SessionRecorder`: `layoutsOn`/`pages`/`offFoilPage`/`pausePage` aus `/config`, gecacht in
      **EINEM** Storage-Key `layouts_config` (Object Store nicht zerfasern), plus `layouts_off`
      für den On-Watch-Not-Aus — der sticht alles, auch ohne Handy/Server. Alles defensiv: was
      nicht wie erwartet aussieht, wird verworfen und die Uhr fährt statisch weiter.
    - **`(:full)`-Gating verifiziert an der Release-Größe:** Renderer UND Layout-Verwaltung sind
      annotiert (mit leeren `(:lite)`-Gegenstücken). Instinct 2 (Lite, 96 KB Budget): 54,8 → **55,6 KB**
      (erster Wurf war 56,4 KB, weil die Recorder-Seite noch ungated war). fēnix 7X Pro: 70,5 →
      **73,1 KB**. Build 121 ok / 0 fehlgeschlagen.
  - **P2b Sicherheitsnetz — ERLEDIGT 2026-07-26 (1.0.66):** alle drei Stufen verdrahtet, jede
    hinter `(:full)` mit leerem `(:lite)`-Gegenstück.
    1. **On-Watch-Schalter:** Menüpunkt „Eigene Layouts An/Aus" im Idle-Menü (dort, wo Verbinden/
       Upload/Auto-Start liegen) → `SessionRecorder.toggleLayouts()`, Storage-Flag `layouts_off`.
       Rein lokal, wirkt ohne Handy und ohne Server und sticht die Server-Auslieferung.
    2. **Canary:** `_armCanary()` beim Aufnahme-Start (nur wenn wirklich ein Layout aktiv ist),
       `_clearCanary()` bei `stop()` UND `discard()` — ein Storage-Write je Session, nicht je Frame.
       Liegt das Flag beim App-Start noch da (`_layoutsFromCache`), fährt die Uhr **diese Sitzung**
       statisch (`layoutCrash` sticht `layoutsOn`), zeigt ~6 s „Layout aus (Absturz)" in Orange auf
       dem Start-Screen und löscht das Flag — ein einzelner Absturz hallt also nicht ewig nach. Ob
       ein Modell dauerhaft aussetzt, entscheidet der Server.
    3. **Meldung:** `fetchConfig()` hängt `canary=1` an, solange `canaryPending`; erst im
       Erfolgspfad von `onConfig` gilt sie als abgesetzt. Damit greift der selbstlernende
       Kill-Switch (zwei verschiedene Uhren eines Modells → Modell aus).
    Menüpunkt (`menu.layouts`) und Hinweis (`lay.fallback`) in **allen 13 Uhr-Sprachen**;
    StringsLite braucht sie nicht (Lite hat keine Layouts). Build 121 ok / 0 fehlgeschlagen,
    Release-Größen: instinct2 (Lite) **55,8 KB**, fr255s **74,2 KB**, fenix7xpro **74,5 KB**.
  - **P2b offen:** Font-Kalibrierung gegen `dc.getFontHeight()` (danach die geschätzten
    `SIZE_STEPS`-Faktoren in der PWA nachziehen), Testpakete für fr255s + fenix7xpro.
- **P3:** Wear OS + Apple Watch.

---

## Entschieden (2026-07-26)
- **Reihenfolge:** P0 (`pauseView` konfigurierbar) → F1 (Setup) → F2 P1 (Editor + Community).
  Risikoarm zuerst; P0 testet den Config-Pfad, den F2 P2 später braucht.
- **Chrome** = normale, verschiebbare/einfärbbare/löschbare Elemente, in neuen Layouts vorbelegt.
- **Vorschau-Umschalter** Feldnamen ↔ Beispieldaten.
- **Recherche-Vorgehen** (gilt generell): bei tiefen Recherchen erst 2-3 Marken als Probe, Jan prüft
  Format/Quellen/Unsicherheiten, dann skalieren. Geschätzte Werte immer als geschätzt markieren.

## Offene Entscheidungen
- keine mehr — bereit zur Umsetzung (F2 P2 = Uhren-Renderer braucht Jans Simulator-Tests).
