# Ideen & Backlog

## 📥 Inbox (unsortiert, später einsortieren)
_Schnell reingeworfene TODOs — keine Priorität, werden nach Ermessen eingeordnet & umgesetzt._

- _(noch leer)_

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
| **Session-Kommentare / Diskussionen** | ★★★ | M | neue Tabelle + API + UI; Moderation/Meldefunktion mitdenken. |
| **Kommentar-Auto-Übersetzung** in die Sprache des Lesers (auf Knopfdruck) | ★★ | M | günstiges Übersetzungsmodell; **Übersetzungen cachen** (pro Ziel-Sprache) und direkt mitladen, wenn vorhanden. Hängt an Kommentaren. |
| **Spot-Chaträume** (mit allen an einem Spot chatten) | ★★ | L | Realtime (WebSocket/SSE) + Moderation + Spam/Abuse; deutlich mehr Betrieb. |

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
