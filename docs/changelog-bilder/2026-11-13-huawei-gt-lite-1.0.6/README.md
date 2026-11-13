# HUAWEI WATCH GT / Fit / D (Lite) 1.0.6 — Simulator-Screenshots (13.11.2026)

Jans DevEco-Simulator (liteWearable, Build-Modus Release), Lite-App 1.0.6 vor der Einreichung (Wear Engine am 13.11.
freigegeben). Echte Fahrt per `./sim.sh an sim-konfig.json` + `./sim-fahrt.py sim-fahrt.gpx` (GPS-Attrappe mit echtem
Tempo je Sekunde). Aufgehoben fuers Changelog (Jan: „bilder wieder speichern fuers changelog").

| Datei | Was |
|---|---|
| `start-1.0.6.webp` | Startbildschirm, Version, „open app on phone" (noch keine Verbindung) |
| `aufnahme-gps-suchen.webp` | Aufnahme laeuft, Stopp 2 s halten, „Waiting for GPS" |
| `datenseite-echte-fahrt.webp` | Datenseite (Dst/Dur/Hr/Avg) mit echter Fahrt, Farben nach Wert |
| `last-run-echte-fahrt.webp` | LAST RUN: 1:02 / 272 m / 17,0 km/h max — Lauf-Erkennung mit echtem Tempo |
| `fertig-open-app-on-phone.webp` | Abschluss: 2:24 / 0,34 km / 1 Lauf, „4/13 · open app on phone" (Rest bleibt auf der Uhr) |
| `summen-abgeschnitten-vorher.webp` | VORHER: „all runs dist/time" am Rand abgeschnitten (Lite kennt nur 30/38 px) |
| `summen-gekuerzt-zwischenstand-deveco.webp` | Zwischenstand mit DevEco daneben („m total di.") — danach Rand-Rechnung fuer runde Uhren |

Fuers Changelog am besten: `last-run-echte-fahrt` und `fertig-open-app-on-phone` (Punkt „GT/Fit/D: Aufnahme mit
Upload ueber die Android-App"). Fuer `web/public/changelog/` auf die Uhr zuschneiden. Bekannt: „1 Runs" statt „1 Run".
