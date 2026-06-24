# Ideen & Backlog

## 📥 Inbox (unsortiert, später einsortieren)
_Schnell reingeworfene TODOs — keine Priorität, werden nach Ermessen eingeordnet & umgesetzt._

- **Foil-DB um weitere Marken erweitern.** Aktuell 6 (AXIS, Duotone, F-One, Gong, Sabfoil, TAKOON).
  Kandidaten: Armstrong, Lift, Unifoil, Code, Naish, North, Cabrinha, Slingshot, KT, Takuma,
  Levitaz, Mike's Lab, GoFoil, Appletree, Ensis, RRD, Moses, Horue, Indiana, Starboard/Fanatic.
  **Datenlücke:** `span_cm` + `area_cm2` meist publiziert (Naming oft = Fläche, z. B. „HA 980" = 980 cm²,
  oder = Breite in mm, z. B. AXIS „ART 999" = 999 mm), **`thickness_mm` aber praktisch nie** → muss
  pro Foil aus Quelle/Schätzung kommen (sonst Calculator-Werte unzuverlässig). Plan: nur **verifizierte**
  Einträge übernehmen; Dicke ggf. via Dickenverhältnis (t/c) grob schätzen + als „geschätzt" markieren.
  Falls Jan eine Tabelle/Quelle hat, ist das der schnellste Weg.
- **Spot-Sessions → Direktlink zum Spot-Chat.** In der Sessions-Ansicht eines Spots (`/alle-sessions?spot=…`
  bzw. Spot-Seite) ein Button/Link direkt in den zugehörigen Spot-Chatraum.
- **Chat-Moderation & Anti-Spam** (Teil der Chat-Engine):
  - **Duplikatserkennung** — verhindert versehentliches Doppelposten (gleicher Text kurz hintereinander).
  - **Melden-Icon** je Nachricht (klein).
  - **Auto-Ausblenden** ab **3+ Meldungen** (kein Auto-Löschen); Admin kann ausgeblendete wieder **freigeben**.
  - **Admin:** gemeldete Nachrichten einsehen; Nutzer im Chat **blockieren** bzw. auf **read-only** setzen.
- ✅ **Persönliche Startseite / Dashboard** — *umgesetzt: /home (Rekorde + 3 letzte Sessions + Homespot),
  Home als 1. Bottom-Tab (6 Tabs), Profilbild + Post-Login -> /home, Rekorde aus Sidebar entfernt.*
  **Offen:** Homespot-**Chat**-Sektion einbauen (sobald Chat live), ggf. mehr Widgets.
  - **Ungelesen-Hinweise:** auf der Home-Ansicht anzeigen, wenn es in **Chats, die ich angesehen habe**,
    seit meinem letzten Lesen **neue Nachrichten** gab (pro Chatraum). Braucht „zuletzt gelesen je Raum/User".
  - **Chatraum verlassen:** Möglichkeit, einen Chatraum zu verlassen (taucht dann nicht mehr in „meine Chats"/Unread auf).
- **Light-Mode + Theme-Schalter.** Helles Design erstellen (aktuell nur Dark). Im Profil Schalter
  **Dark / Light / Auto** (System-`prefers-color-scheme`). Öffentliche Startseite (vor Login) immer **Auto**.
  Größeres Theming: Tailwind `dark:`-Strategie umstellen (class-based), Farb-Tokens, alle Seiten prüfen.
- **Einheitliches Icon-Set (Material).** Alle aktuell handgemalten Inline-SVG-Icons durch ein
  konsistentes, schönes Set ersetzen. Option A: selbst im Material-Stil designen. Option B:
  **Google Material Symbols** — Lizenz **Apache-2.0**, also erlaubt; **müssen self-hosted** sein
  (SVGs/Variable-Font lokal bündeln) wegen CSP/Offline, **kein** Remote-Zugriff der Nutzer zu Google.
  → vermutlich B (self-hosted Material Symbols) als gemeinsame `<Icon name=…>`-Komponente.
- **Sessions-Seite vereinheitlichen.** Eine `/sessions`-Seite mit Überschrift **„Sessions"**, darunter in
  **einer Zeile**: Umschalter **Meine / \<Homespot\> / Alle** + **Spotsuche**. Hauptüberschrift dynamisch:
  „Sessions \<mein Name\>" | „Sessions 📍\<Spot\>" | „Sessions Alle". Merge der heutigen Sessions+AllSessions
  (statt zwei Routen/Tabs). Braucht **Homespot** (s. o.). Spot-Auswahl steuert Filter + Titel.
- **Öffentliche Startseite** — *teilweise erledigt:* Feature-Kacheln für **Foil-DB/Stats, On-Foil-Alarm,
  Push, PWA/Offline** ergänzt; Wording generisch. **Noch offen:** **Community-Chat** + **Spots-Karte**
  als Kacheln ergänzen, sobald Chat live ist; ggf. Slider-Screenshots der neuen Features.
- **Chatraum per Push abonnieren.** Je Chatraum aktivierbare Push-Benachrichtigung bei neuen Nachrichten
  (nutzt die bestehende Web-Push-Infra; neuer Notify-Typ je Raum, Opt-in). Sinnvoll mit Unread + „verlassen" verzahnt.

---


Sammelstelle für Produktideen — **noch nichts davon umgesetzt**. Gruppiert, mit grober
Einschätzung. Technischer/Plattform-Backlog (Apple/Wear/Connectoren, CI, Error-Tracking,
CSP …) steht in [`ROADMAP.md`](ROADMAP.md).

**Nutzen:** ★ niedrig · ★★ mittel · ★★★ hoch
**Aufwand:** S = Stunden · M = 1–2 Tage · L = mehrere Tage · XL = Wochen

---

## 1 · Foil-Ausrüstung & Physik

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| ✅ **Foil-Datenbank** (Katalog von Foils) — *umgesetzt: Tabelle+Seed (123) + /api/foils* | ★★★ | M | **Schema + Daten existieren** im Calculator (`reference/foilcalculator.html`, `const foilData`): 123 Foils / 6 Marken (AXIS, Duotone, F-One, Gong, Sabfoil, TAKOON). Pro Foil nur Stammwerte: `{ brand, model, size, span_cm, area_cm2, thickness_mm }` (+ `isBaseline`). AR/Chord/CL/CD/Reynolds/Drag/Power werden **berechnet**, nicht gespeichert. → DB-Tabelle 1:1 nach diesen 6 Feldern, Seed aus `foilData`. |
| ✅ **Foil je Nutzer/Session** — *umgesetzt: „Meine Foils" (mehrere + Default ★), Foil-Select je Session* | ★★★ | M | **Noch offen: je Lauf** (Labeling) — Segmente liegen in segments_json, braucht eigene Ablage. |
| ✅ **Community-Stats je Foil** — *umgesetzt: /foil-stats (Sessions/Foiler/Top-Speed/weitester Lauf/Ø Pump), von Community verlinkt* | ★★ | M | |
| ✅ **Gewicht im Profil** — *umgesetzt: Settings.weight_kg (optional, privat)* | ★★ | S | Input für Leistungsberechnung. |
| **Leistungsberechnung (Watt)** aus Foil-Daten + Geschwindigkeit (+ Gewicht) | ★★★ | L | braucht Foil-DB + Gewicht. **Engine existiert schon** im Foil-Calculator (s. u.: Lift/Drag, Reynolds, CL/CD, Mast-Drag, Power, Pump-Inertia-Power). → Logik aus dem Calculator extrahieren und je Lauf mit echtem Speed/Gewicht füttern. |
| ✅ **Foil-Calculator eingebunden** — *self-contained `/foilcalculator.html` + Profil-Link* (Physik-Modul-Extraktion bleibt offen für Watt) | ★★ | M | Referenz liegt im Repo: [`reference/foilcalculator.html`](reference/foilcalculator.html) (self-contained, ~4170 Zeilen, eigene i18n, `addFoil`/Foil-Liste, Funktionen u. a. `calculateFoilPerformance`, `calculateTotalDrag`, `computeFoilPowerAtSpeed`, `calculateOptimalSpeed`, `calculateReynolds`). Teilt sich Daten/Logik mit Foil-DB + Leistungsberechnung — sinnvoll, die Physik einmal als Modul rauszuziehen. |

## 2 · Community & Social

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| **„Wer foilt jetzt gerade?"** – laufende Sessions live | ★★★ | L | braucht **Live-Upload während der Session** (Teilbasis da: `/ingest/.../analyze`, `status=recording`). Watch müsste periodisch hochladen + „live"-Flag; Privacy-Opt-in! |
| **Session-Diskussion** (Kommentare unter jeder Session) | ★★★ | M | Eher Forum/Diskussion als Chat. **Nur Text.** Nutzt dieselbe Chat-Engine wie der Spot-Chat (gemeinsame Komponente/Tabelle, scope=session). Moderation/Meldefunktion mitdenken. |
| **Spot-Chat** (ein Raum je Spot) | ★★ | L | **Eigener Bereich** (Spots-Tab). Default = **Hauptspot** des Nutzers (= Spot der letzten Session und/oder im Profil als **Homespot** konfigurierbar). Nur Text. Realtime (WebSocket/SSE) + Moderation/Spam-Schutz. |
| ✅ **Homespot im Profil** — *umgesetzt: Settings.homespot, Auswahl aus Spots, „" = letzte Session* | ★★ | S | speist später Spot-Chat-Default + Sessions-Merge. |
| **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck) | ★★ | M | günstiges Übersetzungsmodell; **Übersetzungen cachen** (pro Ziel-Sprache) und direkt mitladen, wenn vorhanden. Hängt an den Texten der Chat-Engine. |

**Chat-Engine (gemeinsam für Session-Diskussion + Spot-Chat):** nur **Textnachrichten**, simple **URL-Erkennung** (Links klickbar → öffnen in neuem Browser-Tab). Eine Engine/Tabelle mit `scope` (`session:<id>` | `spot:<name>`), wiederverwendbare UI-Komponente.

## 3 · Medien

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| **Video direkt in der App aufnehmen** + klein skaliert **selbst hosten** | ★★ | XL | Aufnahme (MediaRecorder), serverseitige Transkodierung/Skalierung (ffmpeg), Storage/Bandbreite, Moderation. Bisher: nur YouTube-Verlinkung. |

---

## Einordnung / empfohlene Reihenfolge

**Schnelle Wins (S–M, hoher/mittlerer Nutzen), bauen aufeinander auf:**
1. **Foil-Datenbank** (Fundament) → 2. **Foil je Nutzer/Session/Lauf** → 3. **Gewicht im Profil**.
   Danach werden **Community-Stats je Foil** und **Leistungsberechnung** möglich.
4. **Session-Kommentare** (eigenständig, hoher Social-Nutzen) → später **Auto-Übersetzung** drauf.

**Größere Brocken (L–XL) – bewusst später / gut planen:**
- „Wer foilt gerade" (Live-Upload + Privacy-Opt-in).
- Spot-Chaträume (Realtime + Moderation).
- Video-Aufnahme & Self-Hosting (Transkodierung/Storage).

**Querschnitt zu beachten:** Privacy/Opt-in (Live-Status, Gewicht), Moderation (Kommentare/Chat),
Betriebskosten (Video/Chat) — passt zur „immer kostenlos, ggf. Affiliate"-Linie.
