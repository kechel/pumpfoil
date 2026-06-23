# Ideen & Backlog

Sammelstelle für Produktideen — **noch nichts davon umgesetzt**. Gruppiert, mit grober
Einschätzung. Technischer/Plattform-Backlog (Apple/Wear/Connectoren, CI, Error-Tracking,
CSP …) steht in [`ROADMAP.md`](ROADMAP.md).

**Nutzen:** ★ niedrig · ★★ mittel · ★★★ hoch
**Aufwand:** S = Stunden · M = 1–2 Tage · L = mehrere Tage · XL = Wochen

---

## 1 · Foil-Ausrüstung & Physik

| Idee | Nutzen | Aufwand | Notizen / Abhängigkeiten |
|------|:------:|:------:|--------------------------|
| **Foil-Datenbank** (Katalog von Foils/Wings/Mästen) | ★★★ | M | Basis-Schema: **Anhang folgt** (vom Nutzer). Fundament für fast alles hier unten. |
| **Foil je Nutzer** – Standard-Setup im Profil, **überschreibbar je Session, sogar je Lauf** | ★★★ | M | braucht Foil-DB. Feld an Session/Segment; UI in Session-Detail + Labeling. |
| **Community-Stats je Foil** (welche Werte fahren Leute mit welchem Foil) | ★★ | M | braucht Foil-DB + Foil-Zuordnung; spannende Vergleichsseite. |
| **Gewicht je Nutzer** im Profil | ★★ | S | DSGVO: optional/privat halten. Input für Leistungsberechnung. |
| **Leistungsberechnung (Watt)** aus Foil-Daten + Geschwindigkeit (+ Gewicht) | ★★★ | L | braucht Foil-DB (Widerstands-/Auftriebsdaten) + Gewicht. Modell klären (Genauigkeit?). |
| **Foil-Calculator** in die Seite integrieren (eigenes Tool des Nutzers) | ★★ | M | vorhandenen Calculator portieren/einbetten; teilt sich Logik mit Leistungsberechnung. |

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
