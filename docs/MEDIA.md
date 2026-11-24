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
   nur im Browser (localStorage). Gemessen in Chromium (headless, VM): 50-s-Lauf 720p/30 fps als MP4 in 3,5 s, als
   durchsichtiges WebM in 4,2 s. **Alpha:** mediabunny legt den Alphakanal als eigenen VP9-Strom ab (`alpha_mode=1`,
   Alpha 0..255 geprueft) — ein VP9-Encoder genuegt, `isConfigSupported({alpha:"keep"})` sagt dort faelschlich nein.
   Der Muxer liegt als `assets/media-*.js` ausserhalb des Precache (+35 KiB statt +790 KiB).
2. Freie Anordnung (Ziehen in der Vorschau), Vorlagen im Profil (`settings.media`), Sync-Versatz, PNG-Folge als ZIP.
3. Musik: Techno + Klavier, Mischpult, Strudel-Link, Export mit Ton.
4. Weitere Stile, Code-Editor in der Ansicht.
5. Native Apps: vorerst auf die Web-Ansicht verweisen.

Offen: welche Schnitt-Apps WebM mit Alpha wirklich lesen (CapCut mobil? iMovie nein) — Standard-Ausgabe danach waehlen.
Uebersetzungen: neue Texte zuerst de/en/de-AT/gsw, die uebrigen Sprachen vor der Freigabe.
