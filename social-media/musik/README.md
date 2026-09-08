# Musik-Pool für scripts/shorts-musik.py

Der Unterordner bestimmt, für welche Plattform-Variante ein Track wählbar ist:

| Ordner | Plattform | Quelle / Lizenz |
|---|---|---|
| `musik/youtube/` | nur YouTube | YouTube Audio Library (Studio → Audio-Mediathek → MP3-Download). Standard-Lizenz gilt nur für YouTube-Videos. |
| `musik/instagram/` | nur Instagram | Meta Sound Collection (facebook.com/sound/collection → Download). Lizenz gilt nur für FB/Instagram. |
| `musik/` direkt oder jeder andere Unterordner (z. B. `pixabay/` — Name frei, gut um sich die Quelle zu merken) | YouTube + Instagram + TikTok | Pixabay & Co. — überall nutzbar. ⚠️ Auf YouTube mit Content-ID-Restrisiko (ein Pixabay-Track wurde schon beanstandet); die UI warnt am YT-Button. |

## Was im Dateinamen landet

Der Export traegt die Herkunft der Musik als Suffix — er ist damit sein eigener
Lizenznachweis, ohne dass man irgendwo nachschlagen muss:

| Ordner | Suffix im Dateinamen |
|---|---|
| `pixabay/` | `-pixabay-<id>` — die ID fuehrt direkt zur Lizenzseite des Tracks |
| `youtube/` | `-music-yt` |
| `instagram/` | `-music-insta` |
| `marcus-gruenschneder/` | `-music-marcus` |
| unbekannter Ordner | `-music-frei` |
| kein Track gewaehlt | `-no-music` |

`-no-music` ist bei TikTok kein Mangel, sondern das Zeichen: **der Ton kommt beim
Hochladen in der App dazu**, aus der Commercial Music Library. Und der RedNote-Ordner
verlinkt hart auf die TikTok-Fassung, erbt den Suffix also mit.

**Einen neuen Ordner anlegen?** Dann `MUSIK_QUELLE` in `scripts/shorts-musik.py`
ergaenzen. Die Erkennung, die die Plattform-Fassungen wieder zusammenfuehrt, baut sich
aus derselben Zuordnung — sonst zerfaellt ein Export in vier einzelne. Ohne Eintrag
bekommt der Ordner `-music-frei` und funktioniert, sagt aber nichts ueber die Lizenz.

**TikTok:** Der TT-Slot ist optional — leer lassen = O-Ton pur (Musik dann
beim Upload in der App, deren Bibliothek ist nur in-app lizenziert), oder
einen freien Track zuweisen, der direkt eingemischt wird.
