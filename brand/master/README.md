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
