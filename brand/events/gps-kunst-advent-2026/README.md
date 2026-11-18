# Event-Grafiken „GPS Art on the Water" — Advent 2026 (29.11.–27.12.2026)

HTML-Vorlagen wie beim Flying Sprint Weekend, gerendert mit Playwright (Headless-Chromium), Schrift Montserrat (lokal).
Motiv passend zur Galerie des GPS-Kunst-Events (web/src/components/KunstBereich.tsx): Winternacht `#0b1a33`, Schnee,
Tannenbaum + Stern als EINE durchgehende, offene GPS-Spur (Ecken als Kurvenboegen, Pump-Wellen) in Marken-Cyan `#22d3ee`. Keine Fotos, keine Verlaeufe.

| Datei | Format | Inhalt |
|---|---|---|
| `banner.html` | 1600×400 | Event-Banner (Event-Seite); `?rahmen=1` zeigt den Sicherheitsrahmen (mittlere 1000 px) |
| `quadrat.html` | 1080×1080 | Social-Post quadratisch |
| `hochkant.html` | 1080×1350 | Social-Post hochkant |
| `streifen.html` | 1080×480 (¼ Short) | Text-Overlay fuers Short, `?stufe=1..4` (aufbauend), `&weiss=1` weisser Grund, sonst transparent |
| `kunst.js` | — | Schnee, Baum, Stern (gemeinsam fuer alle Formate) |

    node render.mjs <zielordner>      # banner, banner-rahmen, quadrat, hochkant, streifen-<1..4>-<transparent|weiss>

## Event (Entwurf, 18.11.2026)

Im offiziellen Team, global, Vorlage GPS-Kunst, Testmodus aus. Start So 29.11. 00:00, Ende So 27.12. 00:00, Runde alle
7 Tage, Abstimmung 7 Tage -> 4 Runden (je Adventswoche), Ergebnis jeden Sonntag, letzte Runde am 3.1.2027.

**Titel:** GPS Art on the Water — Advent 2026

**Beschreibung:** Draw a picture on the water with your track — a tree, a star, a heart, anything you like. One round
for each Advent week: submit one picture from a session of that week, trim it and rotate it, and only your time on the
foil is drawn. Then everyone votes anonymously with 3 hearts. Every Sunday the previous round is revealed, with names
and spots. Have fun, keep pumping!
