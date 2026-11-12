# GPS-Luecke am Lauf-Ende — Simulator-Screenshots (12.11.2026)

Jans Simulator-Test (fenix 7X Pro, Connect IQ 5.2.0) des Garmin-Fixes `watch/source/LaufLuecke.mc`, mit GPX aus einer
eigenen Session, in die Luecken geschnitten wurden. Aufgehoben fuers Changelog (Jan: „die waren cool im changelog").

| Fall | Server | Testbuild -ta (erster Stand) | Testbuild -tb (abgenommen) |
|---|---|---|---|
| 1 s Luecke mitten im Lauf | 37 s | 0:39 / 170 m (unveraendert, richtig) | — |
| 10 s Luecke ab 1 s vor Laufende | 51 s | 1:03 / 243 m (alter Fehler, Tempo-Ausreisser nach der Luecke) | **0:50 / 226 m** |
| 36 s Luecke ab 5 s vor Ende (Sturz) | 42 s (mit Luecke ~37 s) | — | **0:36 / 182 m** (alt ~0:58) |

Fuers Changelog taugen am besten: `fall3-10s-ta-last-run-1-03-alt.webp` neben `fall3-10s-tb-last-run-0-50-neu.webp`,
und `fall4-sturz-tb-in-der-luecke-2.webp` (Timer laeuft in der Luecke weiter) neben `fall4-sturz-tb-last-run-0-36-neu.webp`.
Fuer die Seite in `web/public/changelog/` zuschneiden (nur die Uhr) — die Originale zeigen den Download-Pfad im Simulator.
