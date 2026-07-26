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
| Stab | neue Tabelle `stabs` + `server/app/data/stabs.json` (brand/model/size, span_cm/area_cm2 wo auffindbar, `*_estimated`-Flag wie bei Foils) | `my_stabs[]`, `stab_id` | `Session.stab_id` |
| Mast | keiner (keine Modelle) — nur Länge cm | `my_masts[]` (z. B. `[75, 85]`), `mast_len_cm` | `Session.mast_len_cm` |
| Shim | keiner — nur Gradzahl, 1 Dezimale (`+2`, `+1.5`, `0`, `-0.5`) | `my_shims[]`, `shim_deg` | `Session.shim_deg` |
| Board | kein Katalog (Recherche-Aufwand ≫ Nutzen) → eigene Einträge: Name + optional Volumen/Länge | `my_boards[]`, `board_id` | `Session.board_id` |

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
  Der Stab-Seeder wird mit Update-Fähigkeit gebaut (sonst greifen Korrekturen in Prod nie).
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
shape (round|rect), bg_color, elements, published, copied_from_id, created_at, updated_at`.

**Ein Layout = eine Seite.** Die Seitenliste des Nutzers ist eine Mischung aus klassischen
3-Slot-Views und Advanced-Layouts → Wischen bleibt unverändert.

**Element-Format kompakt** — `[typ, x, y, size, color, flags]`, Trennlinien als eigener Typ mit
2 Punkten. **Keine Dicts mit String-Keys**: die Uhr cached das Server-JSON im Object Store
(`SessionRecorder.setScreensFromConfig`), und Object-Store-Volllauf ist ein bekannter Fehlerpfad.
**Koordinaten 0…1000 relativ** (die Garmin-App rechnet alles aus `dc.getWidth/getHeight` → über
alle Auflösungen und Formen tragfähig; im Katalog: 108 round, 5 rectangle, 8 semioctagon).

### Harte Constraints
- **Apple hat einen strikten Decoder** (`watch-apple/Sources/Api.swift:68`, `views: [[Int]]`) → das
  Layout kommt als **zusätzlicher, optionaler Key**; `views` bleibt unverändert. Sonst brechen alte
  Clients hart.
- **Garmin-Fonts sind diskret** (`FONT_XTINY … FONT_NUMBER_THAI_HOT`) → Größe als Stufe S/M/L/XL
  modellieren, nicht in px. Label-Abstand über `dc.getFontHeight()` statt des heutigen fixen `+30`.
- **Farbpalette kuratiert** — MIP-Displays können nicht beliebige Farben.
- **Kontrast**: heute geht die Uhr von dunklem Grund aus (Werte weiß, Labels hellgrau,
  `colorByValue`-Buckets ebenso). Editor warnt bei schlechtem Kontrast; Default-Hintergrund bleibt
  schwarz (= heutiges Verhalten).
- **Chrome**: REC-Punkt (`h*0.085`) und Seiten-Punkte (`h*0.92`) kollidieren mit freier
  Positionierung → als reservierte Zone modellieren **oder** abschaltbar (→ offene Frage).

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

### Geräte-Gating
`DeviceToken.part_number` → `watch/bin/partmap.json` → `watch/bin/catalog.json` → Tier.
**Fehlt nur `memoryLimit` im Katalog** — `watch/build-all.sh:63-68` liest die SDK-`compiler.json`
bereits, der Wert wird nur nicht übernommen (Einzeiler). Ist-Verteilung: 96 KB = 5 Geräte,
128 KB = 16, ≥512 KB = 100. Dynamische Layouts ab ≥256 KB; mit Netz 1+2 ggf. mutiger.
`/api/devices/list` sollte künftig `family`/`w`/`h`/`mem` mitliefern, damit die PWA den Editor nur
für taugliche Uhren anbietet und in der richtigen Form zeichnet.

### Phasen
- **P0 (klein, vorziehen):** `pauseView` im **einfachen** 3-Slot-System konfigurierbar machen —
  Server liefert den Key, die 4 Clients lesen ihn (fehlt er → alter hartcodierter Default). Schließt
  eine Parität-Lücke, funktioniert auch auf speicherarmen Uhren, und testet genau den Config-Pfad,
  den die Advanced-Layouts danach brauchen.
- **P1:** Server + PWA komplett (Tabelle, API, Editor, Vorschau, Community-Galerie, Kopieren).
  **Keine** Uhr-Änderung.
- **P2:** Garmin-Renderer + Gating + Sicherheitsnetz.
- **P3:** Wear OS + Apple Watch.

---

## Offene Entscheidungen
1. **Stab-Recherche:** erst ~5 große Marken als Qualitätsprobe (Jan prüft), dann die restlichen 20?
2. **Reihenfolge:** Feature 1 (Setup) zuerst oder Feature 2 (Layouts, P0 vorab)?
3. **Chrome im Advanced-Layout** (REC-Punkt + Seiten-Punkte) abschaltbar oder feste reservierte Zone?
