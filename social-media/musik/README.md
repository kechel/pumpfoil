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

## Musiker nennen

Wer uns Musik gibt, wird genannt. Die Nennung steht in `MUSIK_CREDIT` in
`scripts/shorts-musik.py` und haengt am **Suffix**, also an der Datei: nur die
Plattform-Fassung, die seine Spur wirklich enthaelt, bekommt sie. Wer nur bei Instagram
Musik von ihm nimmt, nennt ihn auch nur dort.

Im Studio taucht sie im Reiter *Texte* ganz unten als eigene Zeile je Plattform auf, zum
Kopieren. Sie gehoert als **Kommentar** unter den Beitrag, nicht in die Beschreibung.

**Warum je Plattform ein anderer Text:** ein `@handle` verlinkt nur auf der eigenen
Plattform von selbst. Auf YouTube ist `@marcusgrun` (Instagram) toter Text — dort steht
deshalb die Adresse. Die eigene Plattform steht zuerst.

**TikTok bekommt nur das Handle** (`🎵 @marcus_gruen`): dort ist bloss ein kurzer Titel
moeglich, und das Handle gehoert in den Titel statt in einen Kommentar. **RedNote**
verlinkt nicht nach draussen, dort steht nur der Name.

**Wie die Erwaehnung wirklich entsteht:** auf YouTube, Instagram und TikTok genuegt das
getippte `@handle` — es wird von selbst zum Link, und der Musiker bekommt eine
Benachrichtigung. **Facebook ist die Ausnahme:** dort muss man den Vorschlag aus der
Liste anklicken, die beim `@` aufgeht; nur getippt bleibt es einfacher Text ohne
Verknuepfung.

Aktuell eingetragen: **Marcus Grün** (Ordner `marcus-gruenschneder/` — Grünschneder ist
der buergerliche Name, Grün der Kuenstlername, unter dem er genannt werden will; beides
ist richtig) — YouTube
`@marcusgrun8545`, Instagram `@marcusgrun`, TikTok `@marcus_gruen`, Facebook
`marcusgruenmusic`. Adressen am 25.09.2026 von Jan bestaetigt.

**Einen neuen Ordner anlegen?** Dann `MUSIK_QUELLE` in `scripts/shorts-musik.py`
ergaenzen. Die Erkennung, die die Plattform-Fassungen wieder zusammenfuehrt, baut sich
aus derselben Zuordnung — sonst zerfaellt ein Export in vier einzelne. Ohne Eintrag
bekommt der Ordner `-music-frei` und funktioniert, sagt aber nichts ueber die Lizenz.

**TikTok:** Der TT-Slot ist optional — leer lassen = O-Ton pur (Musik dann
beim Upload in der App, deren Bibliothek ist nur in-app lizenziert), oder
einen freien Track zuweisen, der direkt eingemischt wird.

## Welches Video hat welche Spur (Stand 20.11.2026)

Aus den Rezepten unter `shorts-mit-musik/rezepte/` erzeugt — dort steht die Spur je
Plattform in `studio.sel`. **Warum das hier steht:** Am 20.11.2026 waren die Renders und
die Rezepte lokal aufgeraeumt, und die Pixabay-ID eines Videos liess sich nirgends mehr
nachschlagen — sie klebte nur am Dateinamen des Renders. Fuer einen Copyright-Einspruch
auf YouTube ist genau diese Nummer der Beleg.

Meist laeuft auf allen vier Plattformen dieselbe Spur; wo Instagram eine eigene hat,
steht sie als zweite Zeile. Drei Videos haben gar keine Spur — dort traegt der O-Ton
das Video (bei 230 ist das Absicht: die Bewegung laeuft auf den Takt der Aufnahme).

| Nr | Video | Plattform | Spur | Pixabay-ID |
|---:|---|---|---|---|
| 1 | upcoming-event-gps-art-on-the-water | alle | `ebunny-jingle-bells-rock-loop` | [374519](https://pixabay.com/music/-374519) |
| 20 | meter-glide | alle | `45451848-backroads-country-music` | [381194](https://pixabay.com/music/-381194) |
| 177 | water-splashes-cam-too-low-underwater-glimpse-slomotion | rednote, tiktok, youtube | `mrclaps-this-heavy-metal` | [492569](https://pixabay.com/music/-492569) |
| 177 | water-splashes-cam-too-low-underwater-glimpse-slomotion | instagram | `williamsmyname-metal-get-go` | [559289](https://pixabay.com/music/-559289) |
| 178 | never-give-up-4-dropstart-fails-and-one-slomotion | alle | `pilot2kid-in-the-tavern` | [315926](https://pixabay.com/music/-315926) |
| 179 | a-scene-from-the-live-of-a-pumpfoiler-dropstart-test | alle | `aicanvas-bang-a-bop` | [297529](https://pixabay.com/music/-297529) |
| 180 | surfer-dudes-not-listening-to-any-advice-dont-do-that-at-home-trying-to-pumpfoil-for-the-first-time | alle | `hauntsync-aggressive-death-metal-instrumental-with-intense-double-bass` | [230403](https://pixabay.com/music/-230403) |
| 181 | dropstart-clunk-stab-hits-the-dock-during-the-dropstart | alle | `alanajordan-tango` | [249861](https://pixabay.com/music/-249861) |
| 182 | hey-dude-algaeeeeee-blehhhh-c-mon-let-s-gooo | alle | `alexgrohl-motivation-sport-rock-trailer` | [478796](https://pixabay.com/music/-478796) |
| 183 | water-splashes-sunlight-underwater-slomotion | alle | `dreamy_rabbit-classic-party` | [417665](https://pixabay.com/music/-417665) |
| 184 | never-give-up-learning-to-pumpfoil | alle | `lithop-speakeasy-carousel` | [477089](https://pixabay.com/music/-477089) |
| 185 | beach-flag-flapping-in-the-wind | alle | `tunetank-classic-rock-music` | [347516](https://pixabay.com/music/-347516) |
| 186 | 120fps-dive-closeup | alle | `aicanvas-bang-a-bop` | [297529](https://pixabay.com/music/-297529) |
| 187 | dragging-the-cam-through-the-water-slomo-looking-back-through-a-water-tunnel | alle | `dopestuff-cyberpunk-gaming` | [144149](https://pixabay.com/music/-144149) |
| 188 | GPS-accelerometer-and-gyro-directly-attached-to-the-board-new-nerd-analysis-on-pumpfoil.org | alle | `aicanvas-big-big-trouble-rock-n-roll-mix` | [458954](https://pixabay.com/music/-458954) |
| 189 | bad-day-dont-hurry-never-give-up | alle | `absounds-upbeat-summer-latin-bachata-salsa` | [272751](https://pixabay.com/music/-272751) |
| 190 | visiting-the-interboot-standing-wave-wing-skating-and-foils-everywhere | alle | `fresh_morning-love-rock-165` | [179290](https://pixabay.com/music/-179290) |
| 191 | connect-your-ai-to-pumpfoil.org-mcp-connector-to-analyse-your-data | alle | `aicanvas-big-big-trouble-rock-n-roll-mix` | [458954](https://pixabay.com/music/-458954) |
| 192 | remembering-summer-with-chill-music-by-marcus-gruen | alle | `2026_04_20 Akustikpop chillig` | — *(nicht Pixabay)* |
| 193 | visiting-the-interboot-skimboarding | alle | `alexgrohl-energetic-action-sport` | [500409](https://pixabay.com/music/-500409) |
| 194 | submerging the foil submarine mode and rescue mode in slow motion | alle | `badletters-arabian-metal-queen` | [367526](https://pixabay.com/music/-367526) |
| 194 | submerging-the-board-submarine-mode-and-rescue-mode-in-slow-motion | alle | `badletters-arabian-metal-queen` | [367526](https://pixabay.com/music/-367526) |
| 195 | water-hiking-dock-to-dock-illmensee | alle | `eliza_music-zakochani-w-tancu` | [431950](https://pixabay.com/music/-431950) |
| 196 | modern-software-development-developing-pumpfoil.org-with-claude-code | alle | `jakob_welik-la-derniere-chanson-de-lete-jakob-welik` | [570359](https://pixabay.com/music/-570359) |
| 197 | never-give-up | alle | `badletters-arabian-metal-queen` | [367526](https://pixabay.com/music/-367526) |
| 198 | three-dudes-having-a-foil-meeting-in-the-middle-of-the-lake | alle | `brilsmurfmusiceditions-mon-boulanger-epatant` | [359552](https://pixabay.com/music/-359552) |
| 200 | trying-to-pump-on-my-knees-closeup | alle | `36854313-salsa-soleada` | [151637](https://pixabay.com/music/-151637) |
| 201 | the-day | alle | `lokenwarrior-wicked-asphalt` | [471916](https://pixabay.com/music/-471916) |
| 202 | dropstart-is-soooo-easy-let-me-cross-the-lake-quickly | alle | `tunetank-classic-rock-music` | [347516](https://pixabay.com/music/-347516) |
| 203 | just-a-little-glide-to-the-dock | alle | `discomfuse-baila-con-libertad-remix-ver` | [293737](https://pixabay.com/music/-293737) |
| 204 | never-give-up | alle | `emand_edroff-labirinti-instagrammati-algoritmati_storytelling` | [484097](https://pixabay.com/music/-484097) |
| 205 | full-run-crossing-the-lake-in-glassy-water-with-perfect-sunshine | alle | `absolutesound-cinematic-guitar-adventure` | [505779](https://pixabay.com/music/-505779) |
| 206 | the-day-part-2 | alle | `sounovamusic-canon-rock` | [403743](https://pixabay.com/music/-403743) |
| 207 | jan-and-phil-nice-morning-session | alle | `alex-morgan-gypsy-swing-sunny-cafe` | [556683](https://pixabay.com/music/-556683) |
| 208 | garmin-watch-pumpfoil-app-demo-tutorial | alle | `aicanvas-big-big-trouble-rock-n-roll-mix` | [458954](https://pixabay.com/music/-458954) |
| 209 | cool-20-meter-glide | alle | `45451848-backroads-country-music` | [381194](https://pixabay.com/music/-381194) |
| 210 | cool-effect-dropstart-and-wipeout-slomotion-120fps | alle | `dopestuff-cyberpunk-gaming` | [144149](https://pixabay.com/music/-144149) |
| 211 | early-morning-along-the-boats | alle | `alex-morgan-classical-royal-english-music` | [545533](https://pixabay.com/music/-545533) |
| 212 | morning-sun-shines-from-below-the-board | alle | `myshoun-modern-classic-happy-morning` | [345414](https://pixabay.com/music/-345414) |
| 213 | you-always-have-to-swim-back-when-you-fall--terrible | alle | `absolutesound-guitar-guitar-music` | [529764](https://pixabay.com/music/-529764) |
| 214 | we-are-stuck-the-dock-is-winning-dropstarts | alle | `36854313-salsa-soleada` | [151637](https://pixabay.com/music/-151637) |
| 215 | no-towel-dock-start-slipped-fail | alle | `bombinsound-action-travel-get-crazy` | [615508](https://pixabay.com/music/-615508) |
| 216 | live-phone-recording | alle | `aicanvas-bang-a-bop` | [297529](https://pixabay.com/music/-297529) |
| 217 | another-hopeless-lowkite-fail | alle | `lyrium-2025-silver-arbor-classic-instrumental` | [555735](https://pixabay.com/music/-555735) |
| 218 | phil-testing-mobile-dockstart-ladder | alle | `aicanvas-bang-a-bop-pop-a-lock-version` | [298556](https://pixabay.com/music/-298556) |
| 219 | beef-it-up | alle | `dopestuff-cyberpunk-gaming` | [144149](https://pixabay.com/music/-144149) |
| 220 | head-dive | alle | `ebunny-jingle-bells-rock-loop` | [374519](https://pixabay.com/music/-374519) |
| 221 | new-features | alle | `pwlpl-elegant-paris-club-electro-chanson-groove` | [544221](https://pixabay.com/music/-544221) |
| 221 | new-features-october-2026 | alle | `pwlpl-elegant-paris-club-electro-chanson-groove` | [544221](https://pixabay.com/music/-544221) |
| 222 | autumn-is-here-no-pumpfoiling-today-kids-and-kites-instead-call-it-snowkite-training | rednote, tiktok, youtube | `top_sue-rock-and-roll` | [478141](https://pixabay.com/music/-478141) |
| 222 | autumn-is-here-no-pumpfoiling-today-kids-and-kites-instead-call-it-snowkite-training | instagram | `williamsmyname-metal-get-go` | [559289](https://pixabay.com/music/-559289) |
| 224 | sunset-full-run | alle | `juliush-walz-in-f-major-classic-piano-music` | [1573](https://pixabay.com/music/-1573) |
| 225 | rainy-windy-lowkite-experiments-with-ancient-surfboard-and-lowkites | alle | `45451848-backroads-country-music` | [381194](https://pixabay.com/music/-381194) |
| 226 | enough-with-those-lowkite-experiments | alle | `pwlpl-elegant-paris-club-electro-chanson-groove` | [544221](https://pixabay.com/music/-544221) |
| 227 | phil-nice-run-during-sunset | alle | `aurec-electro-swing` | [596999](https://pixabay.com/music/-596999) |
| 228 | using-the-foil-as-a-washing-line | alle | `alanajordan-morning-song` | [296585](https://pixabay.com/music/-296585) |
| 229 | real-skill-too-old-never-give-up | alle | `aicanvas-big-big-trouble-rock-n-roll-mix` | [458954](https://pixabay.com/music/-458954) |
| 231 | atb-kite-season-has-started | alle | `sounovamusic-canon-rock` | [403743](https://pixabay.com/music/-403743) |
| 232 | heavy-metal-dude-dropstarts-and-dockstarts-slomotion | alle | `hauntsync-aggressive-death-metal-instrumental-with-intense-double-bass` | [230403](https://pixabay.com/music/-230403) |
| 233 | jan-and-phil-dropstarts-at-3-degree-celsius-water-was-10-degree-warmer | rednote, tiktok, youtube | `alexgrohl-energetic-action-sport` | [500409](https://pixabay.com/music/-500409) |
| 233 | jan-and-phil-dropstarts-at-3-degree-celsius-water-was-10-degree-warmer | instagram | `williamsmyname-metal-get-go` | [559289](https://pixabay.com/music/-559289) |
| 234 | teams-and-events-first-global-event-7-8-NOV-2026 | alle | `ebunny-jingle-bells-rock-loop` | [374519](https://pixabay.com/music/-374519) |
| 235 | flying-sprint-event-14-15-NOV-2026 | alle | `mrclaps-this-heavy-metal` | [492569](https://pixabay.com/music/-492569) |
| 236 | ongoing-event-14-15-NOV-2026-flying-sprint-100m-and-1minute | alle | `mrclaps-this-heavy-metal` | [492569](https://pixabay.com/music/-492569) |
| 237 | flying-sprint-weekend-15-16-NOV-2026-winners | alle | `mrclaps-this-heavy-metal` | [492569](https://pixabay.com/music/-492569) |
| 239 | upcoming-event-gps-art-on-the-water | alle | `ebunny-jingle-bells-rock-loop` | [374519](https://pixabay.com/music/-374519) |

Ohne Musikspur (O-Ton): **199** (Raw-Foil-Sound-Pure-Ambient-Glassy-Water-Cloud-Mirror), **223** (sunsplashes-slomotion), **230** (jan-dancing)
