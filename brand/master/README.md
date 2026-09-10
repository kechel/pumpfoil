# Pumpfoil — Logo-Master (brand/master/)

**Eine Basis, ein Generator, alle Logos.** Sämtliche Logo-Assets für Web, Stores,
Uhren etc. werden hier per Skript aus einer einzigen Basis erzeugt — beliebige Größe,
Padding/Zoom/Offset, immer aus dem identischen Original. Nichts mehr von Hand nachbauen.

## Die 3 Logos × 2 Themes (= 6)

| Typ | Beschreibung | Verwendung |
|---|---|---|
| **icon** | Kachel (Rounded Square) + Wellen | App-/Store-Icon, Favicon, Social-Avatar |
| **stacked** | Wellen **oben**, darunter `pumpfoil.org` + Tagline | großer Hero-Titel |
| **horizontal** | Wellen **links**, daneben `pumpfoil.org` + Tagline | Header/überall, Banner |

**Theme:**
- `dark` → für **dunkle** Flächen: heller Inhalt (weiße Wellen/Text, cyan `.org`).
- `light` → für **helle** Flächen: dunkler Inhalt (navy Text), cyan Wellen/`.org`.

Beim **icon**: `dark` = navy Kachel + cyan Wellen, `light` = cyan Kachel + weiße Wellen.

## Wo die Skripte laufen — VM und Mac

`banner.py`, `endcard.py` und `gen.py` brauchen **numpy** und **cairosvg** (das wiederum
libcairo) sowie **Montserrat SemiBold**. Auf der Dev-VM ist alles da. Auf dem Mac seit
10.09. auch:

    brew install cairo
    brew install --cask font-montserrat
    cd brand/master && python3 -m venv .venv-brand
    ./.venv-brand/bin/pip install numpy cairosvg pillow
    ./.venv-brand/bin/python endcard.py

Das venv liegt gitignored neben den Skripten; `python3 endcard.py` ohne venv schlägt weiter
fehl, das ist Absicht — es soll auffallen, statt still eine Ersatzschrift zu nehmen.

**Eine Feinheit bei der Schrift:** die VM hat den statischen Schnitt
`Montserrat-SemiBold.otf`, der Homebrew-Cask liefert die **variable** Datei
`Montserrat[wght].ttf` mit einer Gewichtsachse von 100 bis 900. `banner.montserrat()` stellt
sie deshalb ausdrücklich auf `SemiBold` — ohne das zeichnet PIL Regular, und alles wirkt
dünner. Die beiden Wege ergeben **kein pixelgleiches** Bild: gemessen am 10.09. gegen die
eingecheckten Endcards liegt die mittlere Abweichung bei 0,4–0,5 von 255, einzelne
Kantenpixel weiter auseinander. Nebeneinander gelegt ist kein Unterschied zu sehen — aber
wer ein bestehendes Asset auf der anderen Maschine neu erzeugt, bekommt eine geänderte
Datei ohne sichtbare Änderung. **Deshalb: nur neu erzeugen, was sich inhaltlich ändert.**

`endcard-band.py` braucht das alles nicht — es nimmt das fertige Lockup-PNG aus `brand/logo/`
und läuft mit dem System-Python auf beiden Maschinen.

## Farben (KEINE Verläufe, überall identisch)

- **Cyan `#22d3ee`** — Wellen, `.org`, Akzent (= Web `brand-400`, Garmin/Android/Apple/Zepp).
- **Navy `#020617`** — dunkler Hintergrund / Kachel-dark.
- **Weiß `#ffffff`** — Text/Wellen auf Dunkel.
- **Grau `#94a3b8`** — Tagline `TRACK EVERY PUMP`.

## Basis (`base/`)

- `waves.svg` — die **kanonischen versetzten Wellen** (aus dem echten Icon vektorisiert,
  `fill=currentColor` → beliebig einfärbbar). Einzige Wellen-Quelle.
- `lockup-text-light.png` / `lockup-text-dark.png` — der **Avenir-Next-Textblock**
  (`pumpfoil.org` + `TRACK EVERY PUMP`), transparent. Light = navy Text, Dark = weißer Text
  (aus dem Light-Master abgeleitet). Schrift ist gerastert (Avenir liegt nicht als Font vor)
  → Basis-Auflösung ist die Obergrenze für scharfe Vergrößerung.

## Generator

```
python gen.py --type {icon|stacked|horizontal} --theme {light|dark} --size WxH [Optionen] --out FILE
```

Größen-/Platzierungs-Optionen (Inhalt wird immer zentriert):
- `--size 1024x1024` oder `--size 512` (quadratisch)
- `--content-width N` — Inhaltsbreite in px (Rest = Rand)
- `--content-height N` — Inhaltshöhe in px
- `--zoom F` — Anteil des Canvas (0..1)
- `--pad F` — Rand als Anteil (Default 0.12; icon 0)
- `--offset dx,dy` — aus der Mitte verschieben
- `--bg transparent|dark|cyan|white|#hex`
- `--no-tagline` — nur `pumpfoil.org` ohne Tagline

**Beispiel** (Jans Fall): 1024×1024, Wellen drüber, Inhalt 300 px breit, Rest Padding, zentriert:
```
python gen.py --type stacked --theme dark --size 1024x1024 --content-width 300 --bg dark --out x.png
```

## Alles neu bauen

`./build.sh` erzeugt aus der Basis den kompletten Satz (Web/PWA-Icons + die 6 Referenz-Logos)
an ihre Zielorte. Nach Änderungen an der Basis einfach neu laufen lassen.

Siehe `docs/BRAND.md` für das Marken-Konzept.
