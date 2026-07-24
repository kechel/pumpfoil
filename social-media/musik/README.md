# Musik-Pool für scripts/shorts-musik.py

Der Unterordner bestimmt, für welche Plattform-Variante ein Track wählbar ist:

| Ordner | Plattform | Quelle / Lizenz |
|---|---|---|
| `musik/youtube/` | nur YouTube | YouTube Audio Library (Studio → Audio-Mediathek → MP3-Download). Standard-Lizenz gilt nur für YouTube-Videos. |
| `musik/instagram/` | nur Instagram | Meta Sound Collection (facebook.com/sound/collection → Download). Lizenz gilt nur für FB/Instagram. |
| `musik/` direkt oder jeder andere Unterordner (z. B. `pixabay/` — Name frei, gut um sich die Quelle zu merken) | YouTube + Instagram + TikTok | Pixabay & Co. — überall nutzbar. ⚠️ Auf YouTube mit Content-ID-Restrisiko (ein Pixabay-Track wurde schon beanstandet); die UI warnt am YT-Button. |

**TikTok:** Der TT-Slot ist optional — leer lassen = O-Ton pur (Musik dann
beim Upload in der App, deren Bibliothek ist nur in-app lizenziert), oder
einen freien Track zuweisen, der direkt eingemischt wird.
