# Event-Grafiken „Flying Sprint Weekend" (14.–15.11.2026)

HTML-Vorlagen, gerendert mit Playwright (Headless-Chromium) — Schrift Montserrat (lokal installiert).

| Datei | Format | Inhalt |
|---|---|---|
| `banner-clean.html` / `banner.html` | 1600×400 | Event-Banner (Event-Seite), mit/ohne Sicherheitsrahmen |
| `social.html` | 1080×1350 | Social-Post hochkant |
| `quadrat.html` | 1080×1080 | Social-Post quadratisch |
| `streifen.html` | 1080×480 (¼ Short) | Text-Overlay fürs Short, `?stufe=1..4` (aufbauend), `&weiss=1` weißer Grund, sonst transparent |

**Fotos liegen bewusst NICHT im Repo** (Jan, 11.11.2026: „ohne foto ist gut"): `hg.jpg`, `hg-hoch.jpg`, `hg-quadrat.jpg`
sind Ausschnitte eines Fotos vom Steg — vor dem Rendern daneben legen. `streifen.html` braucht kein Foto.

Streifen rendern (transparent + weiß, je 4 Stufen):

    python3 render-streifen.py streifen.html ausgabe/

Für ein neues Event: Texte in den `<div class="t">`-Blöcken anpassen (Titel, Box, Datum), Foto tauschen.
