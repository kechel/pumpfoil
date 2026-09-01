# Zepp / Amazfit — Store-Konsole

Alles, was die Zepp-Konsole (`developer.zepp.com`, appId 1118995) an Bildern verlangt, liegt hier
zum direkten Hochladen. **Vorgaben:** https://docs.zepp.com/docs/distribute/#appic

| Konsolen-Feld | Datei hier | Vorgabe | gemessen |
|---|---|---|---|
| **App Icon** | `app-icon-240.png` | 240×240 PNG, kreisrund, **transparenter** Hintergrund, **kein** Rand | 240×240 RGBA, flach cyan `#22d3ee` (kein Verlauf), Kreis berührt alle vier Ränder (Alpha 255 an jeder Randmitte), Ecken transparent |
| **Screenshots runde Uhren** | `screenshots-rund/` (8×) | 360×360 PNG, transparenter Hintergrund, mittig, **kein** Rand | 360×360 RGBA, Inhalt 360×360 an (0,0) — Rand 0 auf allen Seiten |
| **Screenshots eckige Uhren** | `screenshots-eckig/` (7×) | 360×360 PNG, transparent, mittig, links/rechts **gleicher** Rand, oben/unten keiner | 360×360 RGBA, Inhalt **312**×360 an (24,0) — links 24, rechts **24**, oben/unten 0 |

Quellen (hier nur Kopien, damit ein Feld einer Datei entspricht):
`brand/app-icons/zepp-240-round.png` und `screenshots/watch/zepp/store360/{rund,eckig}/`.

## Warum dieser Ordner existiert

Die Einreichung **1.0.7 wurde am 01.09.2026 abgelehnt**, Begründung wörtlich: „Please modify the
circular preview image and the square preview image", mit Verweis auf den Anker `#appic` — also den
App-Icon-Abschnitt. Die Bilder lagen bis dahin an drei verschiedenen Stellen im Repo und es gab
keinen Zepp-Ordner unter `brand/stores/`, obwohl es einen für apple/garmin/google/suunto gibt.
Beim Hochladen kann so leicht die falsche Datei in ein Feld geraten.

**Nachgemessen (01.09.):** alle Dateien hier erfüllen die Vorgaben, und **keine** der 14
Icon-Dateien im Repo hat einen Farbverlauf. Was in der Konsole angezeigt wurde, hatte einen —
kam also nicht aus dem Repo. Zwischen dem freigegebenen 1.0.6 (24.08.) und 1.0.7 wurde an den
Assets nichts geändert.

## 🔑 Ungeschriebene Regel: rund und eckig muessen INHALTLICH IDENTISCH sein

Dieselben Bildschirme, einmal rund und einmal eckig. **In der Zepp-Doku steht das nicht** — es kam
aus einer Ablehnung (Jan, vor dem 01.09.2026: „es wurde schonmal abgelehnt weil die nicht identisch
waren rund vs. eckig").

**Aktueller Stand: 8 runde, aber nur 7 eckige.** Das ist keine Verarbeitungsluecke — auch die
Rohaufnahmen liegen 8 zu 7 (`screenshots/watch/zepp/raw/{circle,square}/`). Der achte Bildschirm
wurde eckig nie aufgenommen.

→ **Bis das nachgeholt ist: nur 7 runde hochladen**, das achte weglassen (so hat Jan es am 01.09.
gemacht). Wer die fehlende Aufnahme nachholt: im Zepp-Simulator (nur auf Jans Mac) denselben
Bildschirm eckig aufnehmen, dann auf 360×360 mit Inhalt 312 breit und Rand 24/24 bringen — die
Rechnung steht unten.

## Der eine gefundene Regelbruch (behoben 01.09.)

Die eckigen Screenshots hatten Inhalt **311**×360 und damit **links 24, rechts 25** Pixel Rand.
Die Vorgabe sagt ausdruecklich „an **equal** margins on the left and right". Mit 311 ist das
unmoeglich: 360 − 311 = 49 ist ungerade. Der Inhalt ist deshalb jetzt **312** breit (Rand 24/24) —
ein Pixel Breite, unsichtbar, aber die Regel ist erfuellt.

Die runden Screenshots sind **einwandfrei** und waren es auch vorher: echte Kreise (78,2 % Deckung
der Box = π/4, also Durchmesser genau 360), transparente Ecken, Rand 0 auf allen Seiten. Auch das
App-Icon ist regelkonform. Womit die Haelfte der Ablehnung („circular preview image") nicht durch
Messung erklaerbar ist — wenn sie erneut kommt, bei Zepp nachfragen, WELCHE Datei gemeint ist,
statt hier weiter zu raten.

## ⚠️ Falle im Generator

`brand/master/build.sh` erzeugt das **Uhr**-Icon so:

    G --type icon --theme light --size 248 --pad 0 --bg cyan --out watch-zepp/assets/common.r/icon.png

Das ergibt eine **deckende 248×248-Kachel** — kein transparenter Kreis. Die eingecheckte Datei ist
aber 124×124 mit transparenten Ecken, die Zeile ist also veraltet. Wer `build.sh` laufen lässt,
überschreibt das Uhr-Icon mit genau der Art Bild, die Zepp ablehnt. **Vor einem Lauf prüfen.**
(Das Uhr-Icon aus dem Paket ist nicht dasselbe wie das Store-Icon hier — 124 gegen 240.)
