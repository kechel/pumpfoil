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
- **Persönliche Startseite / Dashboard.** Eigene „Mein"-Seite, erreichbar über das **Profilbild im Menü**
  und **direkt nach Login** als erste Ansicht. Inhalt: **3 letzte Sessions**, **Chat an meinem (Home-)Spot**,
  **meine Rekorde**. → Die Rekorde (aktuell links in der Sidebar) **wandern hierher** und kommen aus der Sidebar raus.
  *(IA-Auswirkung: Post-Login-Ziel + Profilbild-Link; ggf. in `UX-IA.md` einarbeiten.)*
  - **Eigenes Icon in der Mobile-Nav** für Home wird vermutlich doch gebraucht → dann 6 Tabs
    (Home · Community · Sessions · Verlauf · Spots · Profil) oder Profil rein über Profilbild/Home-Hub
    lösen. Nav-Aufteilung beim Umsetzen neu abwägen.
  - **Ungelesen-Hinweise:** auf der Home-Ansicht anzeigen, wenn es in **Chats, die ich angesehen habe**,
    seit meinem letzten Lesen **neue Nachrichten** gab (pro Chatraum). Braucht „zuletzt gelesen je Raum/User".
  - **Chatraum verlassen:** Möglichkeit, einen Chatraum zu verlassen (taucht dann nicht mehr in „meine Chats"/Unread auf).
- **Öffentliche Startseite reviewen & um neue Features ergänzen.** Aktuell zeigt sie Track/Analyse,
  FIT-Upload, „immer kostenlos", Datenschutz/Open-Source. Ergänzen, sobald live: **Community-Chat**
  (Spot + Session), **Push-Benachrichtigungen**, **On-Foil-Vibrationsalarme**, **Foil-DB/Stats**,
  **PWA/Offline/Install**, **Spots-Karte**. Wording generisch (Multi-Plattform, nicht nur Garmin).
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
| **Community-Stats je Foil** (welche Werte fahren Leute mit welchem Foil) | ★★ | M | braucht Foil-DB + Foil-Zuordnung; spannende Vergleichsseite. |
| **Gewicht je Nutzer** im Profil | ★★ | S | DSGVO: optional/privat halten. Input für Leistungsberechnung. |
| **Leistungsberechnung (Watt)** aus Foil-Daten + Geschwindigkeit (+ Gewicht) | ★★★ | L | braucht Foil-DB + Gewicht. **Engine existiert schon** im Foil-Calculator (s. u.: Lift/Drag, Reynolds, CL/CD, Mast-Drag, Power, Pump-Inertia-Power). → Logik aus dem Calculator extrahieren und je Lauf mit echtem Speed/Gewicht füttern. |
| **Foil-Calculator** in die Seite integrieren (eigenes Tool des Nutzers) | ★★ | M | Referenz liegt im Repo: [`reference/foilcalculator.html`](reference/foilcalculator.html) (self-contained, ~4170 Zeilen, eigene i18n, `addFoil`/Foil-Liste, Funktionen u. a. `calculateFoilPerformance`, `calculateTotalDrag`, `computeFoilPowerAtSpeed`, `calculateOptimalSpeed`, `calculateReynolds`). Teilt sich Daten/Logik mit Foil-DB + Leistungsberechnung — sinnvoll, die Physik einmal als Modul rauszuziehen. |

## 2 · Community & Social

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| **„Wer foilt jetzt gerade?"** – laufende Sessions live | ★★★ | L | braucht **Live-Upload während der Session** (Teilbasis da: `/ingest/.../analyze`, `status=recording`). Watch müsste periodisch hochladen + „live"-Flag; Privacy-Opt-in! |
| **Session-Diskussion** (Kommentare unter jeder Session) | ★★★ | M | Eher Forum/Diskussion als Chat. **Nur Text.** Nutzt dieselbe Chat-Engine wie der Spot-Chat (gemeinsame Komponente/Tabelle, scope=session). Moderation/Meldefunktion mitdenken. |
| **Spot-Chat** (ein Raum je Spot) | ★★ | L | **Eigener Bereich** (Spots-Tab). Default = **Hauptspot** des Nutzers (= Spot der letzten Session und/oder im Profil als **Homespot** konfigurierbar). Nur Text. Realtime (WebSocket/SSE) + Moderation/Spam-Schutz. |
| **Homespot im Profil** | ★★ | S | konfigurierbarer Default-Spot; Fallback = Spot der letzten Session. Speist Spot-Chat-Default. |
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
