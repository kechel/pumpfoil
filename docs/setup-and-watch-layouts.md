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

### Canary-Meldung: wirkt PRO UHR, nicht global (Entscheidung Jan, 2026-07-26, nachgeschärft)
Der Canary bleibt nicht auf der Uhr: **jede Uhr, die ihren Canary auslöst, meldet das beim nächsten
Config-Abruf an den Server** (`?canary=1` → `DeviceToken.layout_canary_count`).

**Wirkung bewusst begrenzt** (Jans Korrektur, nachdem der erste Entwurf modellweit sperrte): ein
Absturz schaltet die Layouts **nur für die betroffene Uhr** ab — nicht für andere Uhren desselben
Nutzers und erst recht nicht für andere Nutzer desselben Modells. Ein einzelnes Gerät kann aus
vielen Gründen abstürzen; anderen deshalb das Feature wegzunehmen wäre übergriffig. Jans Worte:
„globales sperren machen wir wenn aus der statistik, jeder sperrt sowas nur fuer sich selber bis wir
datenbasiert das entscheiden … aber selbst dann darf ein user das gerne aktivieren und testen".

Daraus die vier Tore in `/api/devices/config` (alle live geprüft):
1. **Gerät** ≥ 512 KB (`mem`).
2. **Diese Uhr** hat keinen Absturz gemeldet. Zurücksetzen kann der Nutzer selbst in der Uhr-Liste
   (`POST /api/devices/{id}/layout-canary/reset`) — er weiß, ob er es nochmal versuchen will.
3. **Nutzer-Schalter** `settings.layouts_enabled` (Default an), jetzt auch mit UI im
   Datenseiten-Tab. Gilt nur für ihn.
4. **Modell-Voreinstellung** `watch_model_flags.layouts_allowed`: NULL = erlaubt, `False` = „für
   dieses Modell liefern wir es per Default nicht aus" (setzen WIR, datenbasiert), `True` =
   erzwungen. Ein `False` greift **nicht**, wenn der Nutzer den Schalter selbst angefasst hat
   (erkannt am Key im gespeicherten `settings_json`) — Testen bleibt erlaubt.

Die Modell-Statistik (`GET /api/admin/layout-health`: Budget, Tauglichkeit, wie viele verschiedene
Uhren gemeldet haben, `default_on`) ist damit **Datenbasis, kein Kill-Switch**.

Verifiziert mit zwei Wegwerf-Uhren auf dem Testkonto: Uhr A meldet → nur A aus, B bleibt an; beide
melden → beide aus, während ein anderes Konto mit demselben Modell weiter `default_on=true` hat;
Reset für A → sofort wieder an.

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
  - **P2b Font-Kalibrierung — ERLEDIGT 2026-07-26, aus dem SDK gemessen:** die Faktoren mussten
    nicht geraten (und nicht im Simulator abgelesen) werden — das SDK legt sie offen. In
    `~/.Garmin/ConnectIQ/Devices/<id>/simulator.json` steht je Gerät die Font-Datei pro Stufe, und
    der Dateiname trägt die Pixelgröße (`FNT_FENIX6X_CDPG_ROBOTO_13B` = 13 px,
    `..._BIONIC_BOLD_NUMBER_62` = 62 px). Über **42 layout-fähige Geräte** ausgewertet (Höhe ÷
    Displaybreite, Median; Geräte mit Dateinamen ohne erkennbare Größe verworfen statt geschätzt):

    | Stufe | Font | gemessen | Streuung | vorher geschätzt |
    |---|---|---|---|---|
    | 0 | FONT_XTINY | 0.050 | .038–.060 | 0.055 |
    | 1 | FONT_TINY | 0.069 | .048–.071 | 0.070 |
    | 2 | FONT_SMALL | 0.078 | .058–.079 | 0.085 |
    | 3 | FONT_MEDIUM | 0.092 | .070–.092 | 0.100 |
    | 4 | FONT_LARGE | 0.096 | .079–.100 | 0.120 |
    | 5 | FONT_NUMBER_MILD | 0.115 | .094–.119 | 0.150 |
    | 6 | FONT_NUMBER_MEDIUM | 0.139 | .125–.147 | 0.190 |
    | 7 | FONT_NUMBER_HOT | 0.192 | .166–.193 | 0.240 |
    | 8 | FONT_NUMBER_THAI_HOT | 0.221 | .166–.221 | 0.300 |

    Die Schätzung lag am oberen Ende **36 % zu hoch** — die Vorschau zeigte Werte also deutlich
    größer als die Uhr, und die Overflow-Warnung schlug zu früh Alarm. Jetzt stimmen beide.
  - **P2b Testpakete — GELIEFERT 2026-07-26:** Release-`.prg` für **fr255s** (218×218, kleinste
    taugliche) und **fenix7xpro** (280×280) an Jan; bewusst aus dem Scratchpad, NICHT aus
    `watch/bin` (s. Regel unten). Offen ist damit nur noch Jans Simulator-Test.

  - **P2d Jans Simulator-Tests (fenix7xpro) — Rückmeldungen 2026-07-26:**
    - Rendering, Farbe-nach-Wert, Canary-Selbstheilung: bestätigt („die custom anzeigen sind super").
      Der Canary schlägt auch beim **Abwürgen des Simulators während der Aufnahme** an — für die App
      nicht von einem Absturz zu unterscheiden, also korrektes Verhalten, beim Testen aber lästig:
      Aufnahme regulär beenden, dann den Simulator schließen.
    - Seiten 3/4 vertauscht + Punkte-Anzahl: gefixt (`summaryIdx = _pageCount() - 1`, `pageCount`
      an die Vorschau).
    - **Label-Abstand klassische Seiten:** in drei Anläufen geometrisch gelöst — `getFontHeight/2`
      klebte am Wert, `slot*0.75` rutschte ins nächste Feld, `slot*0.42` war noch zu tief. Jetzt
      `slot*0.33`, gekappt auf 10 % der Displayhöhe (280 px/3 Felder = 23 px). Von Jan bestätigt.
    - **Fontmessung — ERLEDIGT 2026-07-26 (Jans Sim-Ausgabe):** fenix7xpro, 280×280,
      `dc.getFontHeight()` / `dc.getTextWidthInPixels("18.5")` je Stufe:
      19/29 · 31/46 · 34/50 · 40/61 · 43/64 · 64/82 · 79/99 · 107/146 · 122/166.
      **Bezugsgröße ist die BREITE**, nicht die Höhe: die Breite ist reine Tinte, `getFontHeight`
      ist die Zeilenbox mit Reserve — Zeilenbox ÷ em = 1,29–1,34 bei den Textfonts, aber 1,45–1,57
      bei den NUMBER-Fonts (FONT_NUMBER_THAI_HOT hält Platz für Thai-Ober-/Unterlängen vor). Die
      Zeilenbox als Fontgröße zu nehmen, hätte die Vorschau um bis zu 50 % zu groß gemacht.
      Neue Faktoren (Breite ÷ Vorschub ÷ 280): .0525 .0833 .0905 .1104 .1158 .1484 .1792 .2643 .3005
      — die alten lagen **16–38 % zu klein**, genau Jans Befund („labels ein klein bisschen zu
      gross", Stufe SMALL: +16 %). Der Vorschub des Mess-Strings wird im Browser per Canvas
      gemessen, damit die Umrechnung nicht an einer angenommenen Roboto-Metrik hängt.
      **Damit ist der frühere „gemessene" Weg widerlegt:** die Pixelzahlen in den Font-Dateinamen
      aus `simulator.json` (`ROBOTO_13B` …) sind nicht die em-Größe. Der ursprüngliche Schätzwert
      0,300 für numThaiHot war näher an der Wahrheit (0,3005) als seine „Korrektur" auf 0,221 —
      Lehre: eine Quelle, die man nicht gegenprüfen kann, ist keine Messung.
      Die Overflow-Warnung rechnet jetzt mit den gemessenen UHR-Breiten (`watchTextWidthRatio`)
      statt mit einer Monospace-Annahme in der Vorschau-Schrift.
    - **Erledigt statt offen: ehemals „echte Fonthöhen".** Die Faktoren in `SIZE_STEPS` stammen aus den Dateinamen in
      `simulator.json` (`ROBOTO_13B` = 13 px …) — die Uhr zeichnet aber sichtbar größer, d. h. im
      Editor wählt man systematisch zu groß („die schriftart der labels ist ein klein bisschen zu
      gross"). Das SDK gibt nichts Besseres her: kein `.fnt` für die eingebauten Fonts, keine
      Metriken unter `~/.Garmin/ConnectIQ/Devices/<id>/`, `strings` auf der Device-`.bin` findet
      die Font-Namen nicht. **Einzige belastbare Quelle ist `dc.getFontHeight()` im Simulator** →
      Wegwerf-Debug-Build (`System.println` für alle 9 Stufen + `getTextWidthInPixels("18.5")`)
      an Jan geliefert; Kalibrierung erst mit diesen Zahlen, **nicht** über einen geschätzten
      Korrekturfaktor. Der Mess-Code ist absichtlich nicht committet.
    - **Trennlinien (Jan-Wunsch, ERLEDIGT):** waagerecht/senkrecht per Knopf (rechnet um die Mitte,
      damit die Linie beim Umschalten nicht wegwandert), Länge in %, Ziehen am Körper verschiebt
      beide Punkte, zwei Griffe an den Enden für frei/diagonal. Das Format konnte das immer
      (`[6]`/`[7]` = zweiter Punkt) — greifbar war die Linie im Editor nur nicht, weil die
      SVG-Ebene `pointer-events: none` trug.
  - **P2e Nutzungs-Ranking (Jan-Wunsch, ERLEDIGT 2026-07-26):** kein Zähler, keine Buchführung —
    `layouts._usage_stats` leitet alles aus vorhandenen Daten ab: `used_by` = verschiedene **fremde**
    Nutzer, die das Original oder eine Kopie davon wirklich eingebunden haben (Seitenliste,
    Off-Foil, Pause — eine bloß gespeicherte Kopie zählt nicht), `unchanged_copies` = wie viele
    Kopien unverändert sind (gleiche Elemente + gleicher Hintergrund). `GET /api/layouts/community`
    sortiert per Standard `sort=used` danach (`sort=new` bleibt), Galerie-Badge „von N Foilern
    genutzt". Bewusst in Python: `users.settings_json` ist TEXT, nicht JSONB — wird das je teuer,
    ist der Umstieg auf JSONB + Index die Stelle.

  - **P2f Wer entscheidet: die UHR — Korrektur 2026-07-26 (Jan):** „egal was der server sagt, an der
    uhr will ich es umstellen koennen, nur bei app-start soll es auf den wert des servers einmal
    vorinitialisiert werden". Vorher war `layoutsOn` ein Veto des Servers, gegen das der
    On-Watch-Schalter nicht ankam — und weil die Seiten nur bei `layoutsOn=true` mitkamen, hätte er
    auch gar nichts anzuzeigen gehabt. Jetzt:
    - `/config` liefert `pages`/`offFoil`/`pause`, sobald die Uhr **genug Speicher** hat (≥ 512 KB;
      das ist Physik, keine Politik — die 96-KB-Uhren haben den Renderer nicht einmal im Build).
      `layoutsOn` ist nur noch die **Voreinstellung**.
    - Die Uhr hält den Schalter als **Dreizustand** in `layouts_pref`: `null` = nie angefasst → es
      gilt der Server-Wert (bei jedem App-Start neu), `true`/`false` = Wille des Nutzers und sticht
      den Server dauerhaft. Altbestand `layouts_off` wird einmal übernommen.
    - `layoutCrash` bleibt eine Sitzungs-Sperre (Selbstheilung) und wird durch bewusstes
      Einschalten sofort aufgehoben; der Menüpunkt zeigt „Layout aus Absturz", solange sie greift.
    - Serverseitig gilt ein einzelner gemeldeter Absturz nicht mehr als Sperre
      (`CANARY_BLOCK_AT = 2`). Vorher war `== 0` verlangt, die Uhr meldet aber genau einmal → der
      Zähler stand danach dauerhaft auf 1 und die Uhr bekam nie wieder Layouts (Jan lief genau da
      fest, sein Profil-Reset wurde vom nächsten App-Start überschrieben).
    - `GET /api/devices/list` liefert je Uhr `layout_state` (on | off_user | off_memory |
      off_canary | off_model | off_nolayout) aus demselben Gate-Baum; die Profilseite zeigt den
      Grund im Klartext. Ohne das bleibt bei „Schalter steht auf An, es kommt aber nichts" nur Raten.
    Verifiziert mit Wegwerf-Token auf emu-test (canary=5, kein Opt-in): `layoutsOn:false`, `pages`
    trotzdem im Payload → die Uhr kann selbst einschalten. Testdaten danach gelöscht.

  - **P2g Schalter mit DREI Zuständen — 2026-07-26:** Jan: „ob die initialisierung vom server
    geklappt hat beim ersten aufruf … kann ich ja nie wieder testen oder?" — richtig, und das war ein
    Produkt-Mangel, kein Test-Problem: „nie angefasst" war nur der interne Anfangswert und nach dem
    ersten Umschalten nicht wieder erreichbar (nur durch Löschen des App-Speichers). Der Menüpunkt
    schaltet jetzt **Automatisch → An → Aus → Automatisch** und zeigt bei „Automatisch" in Klammern,
    was daraus gerade folgt (`Automatisch (An)`), damit man den Server-Wert nicht raten muss.
    „Automatisch" ist genau der Zustand einer frisch installierten Uhr — es testet also den echten
    Erstinstallations-Fall. Neuer String `common.auto` in allen 13 Sprachspalten.
  - **Offen / später (Jans Modell, zurückgestellt bis der Dreizustand getestet ist):** „letzte
    Änderung gewinnt" über beide Orte — stellt man auf der Uhr um, gilt das, bis man am Server
    umstellt, und umgekehrt. Umsetzung wäre eine **Änderungs-Nummer** (`layouts_rev` in den
    Settings, bei jeder echten Änderung von `layouts_enabled` erhöht, in `/config` mitgeliefert) und
    auf der Uhr ein `layouts_rev_seen`: ist die Server-Nummer höher als die gesehene, ist die
    Server-Änderung die jüngere und sticht die lokale Wahl. Bewusst KEIN Uhrzeit-Vergleich zwischen
    Uhr und Server (zwei unabhängige Uhren, Offline-Fälle).

  - **P2h Jans Testrunde bestätigt (fenix7xpro, 2026-07-26):** mehrere Sessions gestartet/beendet,
    Schalter in allen drei Zuständen bespielt („funktioniert"), klassische Labels sitzen richtig,
    Trennlinien frei positioniert inkl. vier verschieden gefärbter Diagonalen („geht auch perfekt").
    **Offen bleibt:** FR 255S (218×218, kleinste taugliche — Überlauf-Verhalten), Off-Foil-/Pausen-
    Screen aus einem Custom-Layout, und der Store-Weg für 1.0.66 (Einreichung + appmeta-Bump +
    Changelog-Eintrag: alles Jans Entscheidung, nichts davon vorwegnehmen).

  - **P2i fēnix 5 / Instinct 2 getestet — zwei Befunde, beide gefixt (2026-07-26):**
    - **Label lief in die Seiten-Punkte** (240 px, 3 Felder): `drawText` ohne VCENTER setzt die
      Textkante OBEN an, also stand das Label mit seiner ganzen Fonthöhe in der Punktreihe bei
      `h*0.92`. Jetzt Boden bei `h*0.92 − 5 − getFontHeight(lblFont)`; auf 280 px fiel es nie auf,
      weil dort 26 px Luft bleiben, auf 176 px greift die Kappung ebenfalls.
    - **Umschalten auf der Uhr zeigte nichts (fēnix 5, 128 KB):** der Server liefert das Layout-Paket
      erst ab 512 KB, der Schalter hatte also nichts anzuzeigen. Neu: die Uhr **fordert** es an
      (`lay=1` am `/config`, gesetzt nur bei ausdrücklichem „An", nicht bei „Automatisch"), und der
      Server liefert ab `LAYOUT_MIN_ON_REQUEST` = 128 KB auf Anfrage. Voreinstellung für diese
      Klasse bleibt aus (sie ist die absturzanfällige, s. Örni/FR55) — aber wer testen will, darf.
      Unter 128 KB (Lite) ist es unmöglich, dort existiert der Renderer nicht.
      Der Menüpunkt sagt jetzt auch „An (keine Seiten)", solange nichts geliefert wurde, statt „An"
      zu behaupten; `/api/devices/list` unterscheidet `off_memory` (Lite, unmöglich) von
      `off_memory_optin` (128–512 KB, per Uhr-Schalter möglich).
    - Instinct 2 (96 KB, Lite) verhält sich wie vorgesehen: statisch, englisch, kein Layout-Menü.
      Kosmetik-Notiz: auf dem Instinct-Display überdeckt das runde Teilfenster oben rechts einen Teil
      des ersten Wertes — von Jan gesehen und als „passt" bewertet, nicht angefasst.

  - **Datenpunkt: der Renderer läuft auf der 128-KB-Klasse** (fēnix 5 im Simulator, angefordert per
    `lay=1`, Jan 2026-07-26: „jo, sehen beide gut aus"). Die **Voreinstellung bleibt trotzdem aus**:
    der Simulator ist keine echte Uhr, und ausgerechnet auf dieser Klasse ist ein Absturz belegt
    (Örnis fēnix 5 bei 25 Hz). Umstellen erst mit Belegen von echter Hardware — bis dahin ist es ein
    bewusster Opt-in-Test, den der Canary absichert.

  - **F2 P2 RELEASED — Garmin 1.0.66 live im Connect-IQ-Store (2026-07-26 abends).** Von Jan auf der
    echten fēnix aus dem Store bestätigt („sieht super duper aus auf meiner garmin!!"). Damit erledigt:
    `appmeta.garmin.latest` 1.0.66, `watch/bin` neu gebaut (121 ok / 0 fehlgeschlagen, Katalog
    durchgehend 1.0.66, Direkt-Download gegen `/api/app/latest` + `/api/app/devices` + `download/
    fenix7xpro` geprüft), Changelog-Eintrag geschrieben und der überholte Satz „Watches don't show
    these layouts yet" im Vormittags-Eintrag ersetzt.
    **Offen als Idee, nicht gebaut:** „letzte Änderung gewinnt" zwischen Uhr und Server (Skizze oben).
    **VERWORFEN (Jan, 2026-07-27): Warnung bei sich überlappenden Elementen** — „da das nicht 100 %
    exakt ist muss man das auf der uhr entscheiden". Eine Überlappung ließe sich nur schätzen (Garmins
    Buchstabenbreiten kennen wir nicht, nur die gemessene Ziffernbreite), und eine Warnung, die
    manchmal falsch liegt, ist beim Gestalten schlimmer als keine: sie hält von Anordnungen ab, die auf
    der Uhr passen. Nicht wieder vorschlagen.
    **Karussell — ERLEDIGT 2026-07-27:** `LayoutTeaser` in `Home.tsx` (= /community), unter den Spots,
    max. 5 on_foil-Layouts in Server-Reihenfolge (`sort=used`), Scroll-Snap statt Bibliothek, auf dem
    Handy eine Karte pro Ansicht, Klick irgendwo → Galerie.
    **VERWORFEN (Jan, 2026-07-27): „Änderungen des Autors übernehmen"-Abo für Kopien** — „brauchen wir
    nicht, ich kann ja erneut kopieren". Nicht wieder vorschlagen: ein Abo müsste festlegen, was mit
    den eigenen Anpassungen passiert, wenn sich das Original ändert; erneut kopieren beantwortet das
    ohne jede Regel.

## F3 — Beliebig viele Screens JE ZUSTAND (Entscheidung Jan, 2026-07-27)

Auslöser: Tom Petr hatte **zwei** „between rides"-Screens gebaut und fand nicht, warum der zweite
nirgends auftaucht — Off-Foil und Pause nahmen je genau einen. Jan: „bitte gleich beide generisch
machen, pause und off-foil, so dass man ueberall beliebig viele einfuegen kann."

**Das neue Modell (Jans Wortlaut):** „pausen-screens nur wenn man die session manuell pausiert hat (da
wo man auch speichern/verwerfen kann), je nach status (pause oder on-foil oder off-foil) soll man
durch jeweils alle zugehoerigen screens blaettern koennen und durch keine anderen."

Damit wird aus der heutigen Zeitregel eine **Zustandsmaschine**:

| Zustand | wann | Seiten-Satz | Blättern |
|---|---|---|---|
| **on_foil** | Lauf läuft | `pages` | UP/DOWN nur durch on_foil |
| **off_foil** | Aufnahme läuft, aber gerade kein Lauf (inkl. Dümpeln zwischen Läufen) | `off_foil_pages` | nur durch off_foil |
| **pause** | Aufnahme **manuell pausiert** (Stopp-Menü → Pausieren) | `pause_pages` | nur durch pause |

Was das **abschafft**: die 8-Sekunden-Regel (nach Lauf-Ende erst Off-Foil-Screen, dann Pausen-Screen)
und den Übersichts-Slot als letzte Seite im Ring. Beides war zeit- statt zustandsgesteuert und passt
nicht mehr — „Dümpeln zwischen den Läufen" ist nach dem neuen Modell **off_foil**, denn die Aufnahme
läuft ja. Wer heute eine Lauf-Zusammenfassung direkt nach dem Lauf will, macht sie zum **ersten**
Off-Foil-Screen.

**Semantik-Verschiebung, die Nutzer betrifft (bewusst NICHT automatisch migriert):** ein heute unter
„Pause zwischen den Läufen" konfigurierter Screen erscheint künftig nur noch beim manuellen Pausieren.
Betrifft aktuell Jan und Tom (je 1–2 Screens) — sie sortieren das in einer halben Minute selbst um.
Automatisches Umschreiben fremder Einstellungen wäre der falsche Preis für die Bequemlichkeit
([[never-touch-db-unasked]]).

**Harte Randbedingung: 1.0.66 ist im Store** und liest `offFoil`/`pause` als je EINEN Eintrag
(`[0,a,b,c]` oder `[1,bg,[…]]`). Eine Liste dorthin zu schicken würde dort als Feld-ID gelesen →
Müll auf dem Display. Also **additiv**: alte Schlüssel bleiben und tragen den ERSTEN Screen des
jeweiligen Satzes, neu kommen `offFoilPages`/`pausePages` als Arrays hinzu. Alte Uhren zeigen weiter
genau einen Screen, neue alle.

**Sicherheitsnetz beim manuellen Pausieren:** der bisherige `_drawPaused`-Screen sagt „Pausiert" und
wie man fortsetzt. Ein eigenes Pausen-Layout weiß das nicht. Damit niemand in einer pausierten
Aufnahme festsitzt, muss die Uhr über einem Pausen-Layout **weiterhin einen kleinen „Pausiert"-Hinweis
einblenden** (Chrome, nicht verhandelbar) — nicht in die Freiheit des Layouts eingreifen, aber
sichtbar bleiben.

**Reihenfolge der Umsetzung:** (1) Server ✅, (2) PWA ✅, (3) Uhr 1.0.67 ✅ gebaut — Simulator-Tests
durch Jan und Store-Release offen.

**Uhr-Umsetzung (1.0.67), Stand 2026-07-27:**
- `RecordView._state()` liefert `:paused | :onFoil | :offFoil` (manuell pausiert sticht alles),
  `_setFor(state)` den Seiten-Satz, `_ring(state)` den Ring: bei `browseAll` erst der eigene Satz,
  dann die anderen in FESTER Reihenfolge (vorhersehbar statt clever). Zustandswechsel setzt
  `screenIdx = 0` und vibriert einmal.
- **Entfernt:** Übersichts-Slot als letzte Seite, `_summaryShownAtMs`/`RUNEND_SHOW_MS` (8-s-Regel),
  `_prevFoiling`/`_lastDataIdx` und der eigene `_drawPaused`-Screen (11 Zeilen toter Code).
  `_pageCount()` ist jetzt die Ringgröße des aktuellen Zustands — davon hängen auch Seiten-Punkte
  und der Label-Boden ab.
- Klassische Ansichten laufen durch dieselbe Maschine (`[0,a,b,c]`-Einträge), damit Lite-Uhren
  nichts anderes tun als die großen.
- **Pausiert-Anzeige:** Typ 7 zeichnet der Renderer (klein, Stufe ≤ 2, Palette-Farbe, Ausrichtung wie
  andere Textelemente). Fehlt er (Layout von vor F3), blendet die Uhr „Pausiert" zusätzlich oben ein.
  Der **Fortsetzen-Hinweis** („ENTER: …") steht auf klassischen Seiten dauerhaft unten, über einem
  eigenen Layout nur **6 Sekunden** nach dem Pausieren — man braucht ihn genau dann, danach bleibt
  das Layout frei. Ohne diese Regel hätte ein Layout mit Typ 7 nirgends gesagt, wie man fortsetzt.
- Größen (Release): fenix7xpro 75,1 KB · fr255s 74,7 KB · fenix5 92,3 KB · instinct2 (Lite) 55,3 KB.
- **Von Jan im Simulator bestätigt (fenix7xpro, 2026-07-27): „funktioniert perfekt".** Offen: Store-
  Einreichung 1.0.67 + `appmeta`-Bump + `watch/bin` + Changelog — alles erst nach der Freigabe, wie
  bei 1.0.66 (Regel unten). **Lite-Gegenprobe (instinct2) 2026-07-27 ebenfalls in
  Ordnung.** Jans erster Eindruck „nach dem Beenden schwarzer Bildschirm" war Ungeduld, kein Fehler —
  ein Diagnose-Build (System.println je Frame) zeigte den Ablauf sauber: Upload läuft (`busy, total=1,
  sent=0`), wird fertig (`sent=1, pending=0`), Upload-Screen im „fertig"-Zweig, danach wieder
  RecordView. Nebenbefund aus dem Log: `_showUploadIfConnected()` setzt `stopped=false`, bevor es den
  Upload-Screen öffnet — in diesem Weg gibt es also ABSICHTLICH keinen „Gespeichert"-Screen, BACK führt
  auf den Start-Screen, der auf dem Instinct sehr karg ist. Kein F3-Thema (Pfade unverändert), aber die
  Quelle des Eindrucks. Ebenso notiert: der Lite-Tabelle fehlen 4 Strings (`common.auto`,
  `lay.fallback`, `lay.none`, `menu.layouts`) — alle nur in `(:full)`-Code verwendet, also harmlos und
  bewusst NICHT nachzupflegen (kostet nur Bytes).

---

**Regel, hart gelernt (2026-07-26): Entwicklungsbuilds gehören NIE in `watch/bin`.**
Der Server liest `watch/bin` live: `/api/app/devices` + `/api/app/download/<id>` liefern genau das,
was dort liegt. Als 1.0.66 dort landete, bewarb die Website prompt ein „Update verfügbar: v1.0.66",
das nicht einmal eingereicht war (von Jan gemeldet). Zwei Konsequenzen:
- `_latest_garmin_version()` liest jetzt **`appmeta.garmin.latest`** (= im Store freigegeben) statt
  der Katalog-Version. Beworben wird nur Freigegebenes.
- Testbuilds werden mit `monkeyc -r` ins Scratchpad gebaut und direkt geschickt; `watch/bin` bleibt
  auf dem Release-Stand. Zurückrollen geht per `git worktree add <tmp> <release-commit>` + dort
  `build-all.sh` + `.prg`/`catalog.json`/`partmap.json` zurückkopieren.
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
