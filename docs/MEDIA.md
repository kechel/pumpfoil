# Media: Video-Overlay und Musik aus dem Lauf

Plan und Stand (Jan, 24.11.2026). Idee: wie „Teilen", aber als **Video statt Bild** — ein durchsichtiges Overlay
(Strecke + Zahlen, ohne Karte), das man über das eigene Video legt; dazu Musik, die aus den Daten des Laufs entsteht
(Strudel). Video und Ton sind getrennte Teile.

## Grundsaetze

- **An der bekannten PWA aendert sich nur ein Knopf:** „Media" links vom Abspielen-Knopf in den Session-Details.
  Alles andere lebt in der eigenen Ansicht `/sessions/<id>/media`: oben Metadaten der Session und Zurueck-Knopf,
  darunter Video- und (spaeter) Audio-Konfiguration.
- **Alles im Browser, nichts auf dem Server.** Das Video wird Bild fuer Bild auf einem Canvas gezeichnet (fester Takt
  `t = frame/fps`, schneller als Echtzeit, keine ausgelassenen Bilder) und mit WebCodecs kodiert; Muxer ist
  `mediabunny` (MPL-2.0, fest 1.65.2, nur in der Media-Ansicht geladen). Der Server liefert nur die Daten, die die
  Session-Ansicht ohnehin holt (Session, `/track-times`, `/carves`). 50 gleichzeitige Nutzer = 50 normale
  Session-Abrufe. Server-seitiges Rendern (ffmpeg) bewusst NICHT: ~1 Kern je Clip, sprengt die 60-%-Grenze.
- **Keine neue Rechnung:** Pumps (`seg.pump_idx`), Gleitphasen (`seg.glides`), Sprints (`analysis.sprints.laeufe_fenster`),
  Carves (`/carves`), Tempo/Puls je Punkt — dieselben Werte wie in der Session-Ansicht.
- **Cliplaenge gedeckelt** (3 min Video), damit kein Handy minutenlang rechnet; ganze Sessions mit hoeherem Tempo.

## Teil A — Video-Overlay

| Bereich | Inhalt |
|---|---|
| Ausschnitt | Lauf / alle Laeufe; Tempo 1×/2×/4×/8×; Vor- und Nachlauf |
| Format | 9:16, 4:5, 1:1, 16:9; 720p/1080p; 30/60 fps |
| Spur | Farbe wie die Karte: Tempo / Puls / Pumpfrequenz / weiss; Ebenen darueber, mit der Zeit animiert (Jan 24.11.): Gleitphasen (cyan Band), Carves (feine Boegen in Kurvenlage-Farbe), Sprints (weisses Band + Magenta-Punkte), Pumps (Punkte). Groesse S = 57 % der kurzen Seite, M = 78 %, L = bildfuellend mit Rand 6 % (~1 cm auf dem Handy, Jan 24.11.) |
| Elemente | Strecke (baut sich auf), Tempo, Pumps, Pumpfrequenz, Puls, Strecke, Laufzeit, Gleiten, Sprints, Carves, pumpfoil.org |
| Platz | je Element einer von neun Ankern (3×3) und eine Groesse; gleiche Anker stapeln sich |
| Stil | Schatten (Lesbarkeit auf hellem Hintergrund: Himmel, Wasser) |
| Hintergrund/Ausgabe | WebM VP9 mit Alpha (echt durchsichtig, nur wo der Browser es kodieren kann), MP4 auf Schwarz (Mischmodus „Screen"), MP4 auf Gruen (Chroma-Key) |

Sprints: im Fenster laeuft die Uhr mit und ein Balken fuellt sich, danach bleibt das Ergebnis als Schild stehen.
Carves: Richtung L/R, Grad zaehlen mit, danach Zaehler.

## Teil B — Musik (Strudel)

- `@strudel/web` als npm-Abhaengigkeit, feste Version, eigener Chunk, von unserem Server ausgeliefert. Lizenz AGPL-3.0
  wie unser Repo — keine neue Pflicht. Samples: zuerst nur Synths; spaeter nur Samples mit geklaerter Lizenz, selbst
  gehostet (keine Abrufe fremder CDNs, CSP).
- **Tempo einfach:** fest je Stil (Jan, 24.11.). Pumps rasten auf das naechste 1/16 ein.
- **Zuordnung (Matrix im Mischpult, je Zeile Ziel + Staerke):** Pump → Bass/Kick/Akkord · Tempo → Filter/Lautstaerke/
  Dichte · Gleiten → Flaeche/Pause · Sprint-Fenster → Drop/Lead · Carve → Stereo-Schwenk nach L/R, Effekt nach g,
  Glide nach Grad, Akzent bei 360° · Puls → Hats.
- **Stile:** Techno, Klavier, Gitarre, 8-Bit, Drum & Bass, Ambient, Herzschlag. Tonart fest aus der Session-ID.
- **Live mixen:** Vorschau in Schleife ueber den Lauf, Spuren mit Regler/Stumm/Solo, Springen (z. B. zum Sprint).
- **Link zu strudel.cc** (Jan, 24.11.): erzeugter Code als `https://strudel.cc/#<base64>`. Oben die groben
  Einstellungen kommentiert (Stil, Tonart, Tempo, Staerken), darunter ein Absatz mit der Datenbasis aus dem Lauf
  (Pump-Zeiten, Tempo-Kurve, Gleit-, Sprint-, Carve-Fenster). Der Teil hinter `#` geht beim Laden nicht an deren
  Server — die Daten verlassen den Browser erst, wenn jemand dort selbst teilt.
- Export: Ton im Video (Opus/WebM, AAC/MP4) und einzeln als WAV. Offline-Rendern, falls superdough es hergibt (offen),
  sonst Echtzeit-Mitschnitt.

## Reihenfolge und Stand

1. **Media-MVP** — Knopf, Ansicht, Elemente inkl. Sprints/Carves, Anker, Formate, Export. *Gebaut 24.11.2026, live
   (Web).* Code: `web/src/pages/SessionMedia.tsx`, `web/src/lib/media/{clip,zeichnen,export}.ts`. Einstellungen bisher
   nur im Browser (localStorage `pumpfoil_media_cfg`, ganzes JSON, ohne Laufwahl). Standard-Ausgabe WebM durchsichtig
   (Jan 24.11.: die meisten schneiden am Rechner), ohne VP9-Encoder automatisch MP4 auf Schwarz. Gemessen in Chromium (headless, VM): 50-s-Lauf 720p/30 fps als MP4 in 3,5 s, als
   durchsichtiges WebM in 4,2 s. **Alpha:** mediabunny legt den Alphakanal als eigenen VP9-Strom ab (`alpha_mode=1`,
   Alpha 0..255 geprueft) — ein VP9-Encoder genuegt, `isConfigSupported({alpha:"keep"})` sagt dort faelschlich nein.
   Der Muxer liegt als `assets/media-*.js` ausserhalb des Precache (+35 KiB statt +790 KiB).
2. Freie Anordnung (Ziehen in der Vorschau), Sync-Versatz, PNG-Folge als ZIP. Einstellungen bleiben im localStorage —
   kein Profil (Jan 24.11.2026: „local storage ist doch prima").
3. **Musik** — *gebaut 24.11.2026.* Reiter Video | Musik in der rechten Spalte, Export darunter gilt fuer beides
   (Jan). Stile Techno, Klavier, Gitarre, 8-Bit, Ambient; Regler je Datenquelle (Pump, Tempo, Gleiten, Sprint, Carve,
   Puls) und je Spur (Bass, Schlagzeug, Melodie, Flaeche); Live-Vorschau mit dem Video, Aenderungen sofort hoerbar;
   Code ansehen + Link zu strudel.cc; Export: Ton im Video (WebM Opus / MP4 AAC) + WAV. Code:
   `web/src/lib/media/{musik,strudel}.ts`.
   - **CSP:** Strudel wertet den Musik-Code zur Laufzeit als JavaScript aus (`unsafe-eval`) — die App-CSP erlaubt das
     NICHT und bleibt so. Strudel laeuft deshalb auf eigener Seite `web/public/strudel-host.html` (+ `.js`) mit
     eigener CSP (`_csp_strudel` in `server/app/main.py`, inkl. `unsafe-eval`, nur fuer diese Seite) als iframe mit
     `sandbox="allow-scripts"` (undurchsichtige Herkunft: kein Zugriff auf App, Cookies, Login), gesteuert per
     postMessage. Dafuer App-CSP `frame-src 'self'`, die `.mjs`-Datei mit `Access-Control-Allow-Origin: *`, Wirt nicht
     im Precache und in der SW-navigateFallbackDenylist. Erster Live-Versuch scheiterte genau daran (Jan 24.11.).
   - Strudel `@strudel/web` 1.3.0 (fest) als fertiges Buendel per `?url` (eigene .mjs-Datei, nicht im Precache).
     Live-Vorschau: ein dauerhafter Wirt. Export-Ton: je Export ein FRISCHER Wirt, `renderPatternAudio` offline —
     Strudel schliesst dabei den Audiokontext und poolt Audio-Knoten ohne Kontext-Trennung (gemessen: zweites Rendern
     in derselben Instanz -> „different audio context"). Den erzwungenen WAV-Download faengt der Wirt ab.
   - Gesamttest 24.11. (headless Chromium, Session-Daten nur gelesen): 51-s-Lauf, Techno, 720p -> WebM VP9 mit Alpha
     + Opus 48 kHz stereo in 40 s, WAV separat.
   - **Safari** (Jan 24.11., mit WebKit nachgestellt): Ton im abgeschotteten iframe erst nach einem Klick IN diesem
     iframe; `resume()` bleibt sonst ewig offen („Loading" ohne Ende). Startet man Strudel trotzdem, haengt seine Uhr
     an der stehenden `currentTime` und blockiert die Seite. Jetzt: Wirt meldet `zustand`, startet nur bei
     „running"; sonst legt die Seite den Wirt kurz sichtbar ueber den Abspielen-Knopf, darin ein Knopf „Musik
     einschalten" -> Klick entsperrt fuer die Sitzung, danach live. Bleibt es gesperrt: Rueckfall auf offline
     gerenderten Ton, den die Seite selbst abspielt (ihr AudioContext wird synchron im Klick entsperrt) — geht,
     dauert aber (Jans Safari: Musik kam „nach langem warten"). Headless-WebKit stuerzt beim AudioContext der Seite
     ab (kein Audiogeraet) — den Knopf-Weg muss ein echtes Safari pruefen.
   - Nur eingebaute Klaenge (Synths, Rauschen, `sbd`), keine Samples — strudel.cc klingt gleich, keine fremden Abrufe.
   - Stille Spuren per `.mask()` statt Lautstaerke 0 (halbiert die Renderzeit); Gesamtpegel je Stil (`PEGEL`),
     gemessen auf aehnliche Spitze 0,6-0,8.
   - **Pump-Zeiten nur sekundengenau:** `pump_idx` ist der GPS-Punkt (1 Hz), zwei Pumps einer Sekunde haben denselben
     Index. Sie werden gleichmaessig ueber ihre Sekunde verteilt (Musik + Zaehler). Exakte Zeiten gaebe es nur aus den
     Rohdaten auf dem Server (offen).
   - **Pump = Bassdrum** (Jan 24.11.: der Beat kam auch in einem Lauf mit kaum erkannten Pumps): jeder Pump schlaegt
     die Kick, das gleichmaessige Raster ist nur noch Regler „Grundbeat" (Standard 0,3). Pump-Zeitpunkt: pg-1 legt den
     Pump auf den ersten GPS-Punkt AB seiner Zeit -> Verteilung ueber die Sekunde DAVOR (bis 24.11. abends danach,
     also ~1 s zu spaet).
   - **Effekte** (einzeln schaltbar): Sprint doppeltes Tempo, Anlauf-Rauschen vor dem Sprint, Carve-Melodie (je 45°
     eine Stufe hoeher), Carve-Rauschen, Einschlag beim Hoechsttempo, Glocke alle 50 m, Trommelwirbel bei
     Pumpfrequenz > 1,25 x Median („Kampf"), Wirbel vor dem Start, fallender Ton am Laufende.
   - **Datenschutz:** Vorschau und Export laufen nur im Browser (Strudel kommt von pumpfoil.org, keine Anfrage an
     strudel.cc). Nur „In Strudel oeffnen" gibt den Code weiter (hinter `#`): abgeleitete Werte, keine GPS-Position,
     kein Name, seit 24.11. auch keine Session-Nummer. Hinweis steht in der Ansicht.
   - **Echte Instrumente** (Jan 24.11.): Strudels Standard-Klaenge mischen Quellen mit unklarer Lizenz
     (tidal-drum-machines, Dirt-Samples, mehrere Soundfonts in `gm_*`, z. B. SBAWE32/JCLive) — nicht uebernommen.
     Stattdessen `scripts/media-klaenge.py`: rendert mit fluidsynth aus FluidR3_GM (MIT, Debian
     `fluid-soundfont-gm`) 16 Instrumente (Toene im Kleinterz-Abstand) + 9 Schlagzeugteile als MP3 nach
     `web/public/klaenge/` (+ `strudel.json`, `LICENSE.txt`), Spitze je Datei auf -5 dBFS. ~18 MB, NICHT im Repo
     (Jan: „repo schlank halten", `.gitignore`), laeuft im `prebuild` und erzeugt nur Fehlendes; ohne fluidsynth
     (CI) nur ein Hinweis. Server: `/klaenge/*` mit CORS + 30 Tage Cache, Strudel-Seite `connect-src` eigene
     Herkunft. Je Spur waehlbar (Bass, Melodie, Flaeche, Schlagzeug synth/akustisch), Stil gibt die Vorgabe
     (Klavier: Klavier + Streicher, Gitarre: Konzertgitarre + E-Bass + akustisch, Ambient: E-Piano + warme Flaeche).
     Im Code: `samples('<origin>/klaenge/strudel.json', '<origin>/klaenge/')` — Basis ausdruecklich, Strudel setzt
     sie sonst ohne Schraegstrich zusammen. Die Media-Ansicht bietet die Auswahl nur, wenn `strudel.json` da ist.
   - Vorschau in Dauerschleife, Musik setzt am Anfang neu auf (Jan 24.11.).
   - **Stimmen statt fester Stile** (Jan 24.11.: „melody ohne flying sprints … mehr freiheiten welche daten was sind,
     auch mehrmals das gleiche"): je Stimme Instrument (Synths, pf-Samples, Schlagzeug elektronisch/akustisch),
     Muster (Ton je Ereignis, Akkord anschlagen, Melodie, Arpeggio, Akkord halten, Bass-Linie, Beat), „spielt wenn"
     (im Lauf, bei jedem Pump, Gleiten, Sprint, Carve, alle 50 m, immer), Tonhoehe aus (feste Akkordfolge, Tempo,
     Pumpfrequenz, Puls, Carve-Grad, Beschleunigung, Verlauf des Laufs — verschiebt um bis zu eine Oktave),
     Lautstaerke/Klangfarbe/Dichte (1/2/4 Noten je Schlag) aus Daten, links/rechts nach Carve, Oktave, Pegel,
     Stumm/Solo/Duplizieren/Loeschen/+Stimme. Melodie = Motiv fest je Session+Stimme (kleine Schritte), Daten
     verschieben es. Die fuenf Stile sind Vorlagen (`vorlage()` in musik.ts). localStorage-Schluessel
     `pumpfoil_media_musik2` (neues Format). UI: `web/src/components/MediaStimmen.tsx`. Getestet: alle Vorlagen +
     Stress mit 49 Stimmen (jedes Muster x jede Zeitquelle) werten aus und rendern.
   - Renderzeit auf der VM (headless, ohne GPU) fuer 50 s Ton: Techno ~30 s, andere 8-11 s.
4. Weitere Stile, Code-Editor in der Ansicht.
5. Native Apps: vorerst auf die Web-Ansicht verweisen.

Offen: welche Schnitt-Apps WebM mit Alpha wirklich lesen (CapCut mobil? iMovie nein) — Standard-Ausgabe danach waehlen.
Uebersetzungen: neue Texte zuerst de/en/de-AT/gsw, die uebrigen Sprachen vor der Freigabe.
