# Tanz-Marke (`brand-dance/`)

Eigene Marke fuer die Tanz-App (`watch-dance/`, Jan, 21.10.2026: „eigene Farbe als App-Icon auf der Uhr,
anderes Icon, eigenes Brand anfangen"). Bewusst getrennt von `brand/` (Pumpfoil) — nichts davon
wandert in die Pumpfoil-Marke oder -Apps (Regel „nur Pumpfoil -> Tanz", CLAUDE.md).

Arbeitsname: **Dance** (Name auf der Uhr). Ein endgueltiger Name ist offen.

## Farben (keine Verlaeufe)

| Rolle | Wert |
|---|---|
| Akzent / Icon-Grund | Fuchsia **#e879f9** |
| Dunkel / Hintergrund | Pflaume **#1a0b1f** |
| Inhalt | Weiss **#ffffff** |

## Icon

Zwei Figuren (Kopf + Bogen), die sich umeinander drehen — Paartanz in Drehung.

| Datei | Wofuer |
|---|---|
| `icon.svg` / `icon-1024.png` | Master: dunkle Kachel, Fuchsia + Weiss |
| `icon-uhr.svg` / `icon-uhr-1024.png` | Uhr: Fuchsia-Kreis, Pflaume + Weiss |
| `watch-dance/resources/drawables/launcher_icon.png` | 108x108 fuer die fēnix 7X Pro, aus `icon-uhr.svg` |

Neu erzeugen:

    rsvg-convert -w 108 -h 108 brand-dance/icon-uhr.svg -o /tmp/uhr108.png
    convert /tmp/uhr108.png -background black -flatten -type TrueColor PNG24:watch-dance/resources/drawables/launcher_icon.png
    rsvg-convert -w 1024 -h 1024 brand-dance/icon.svg -o brand-dance/icon-1024.png
    rsvg-convert -w 1024 -h 1024 brand-dance/icon-uhr.svg -o brand-dance/icon-uhr-1024.png

In der App ist der Akzent ueber `Config.BRAND_CYAN` / `Farbe.FARBE_CYAN` auf Fuchsia gesetzt (Name
bleibt, damit die Pumpfoil-Uebernahme dort nicht staendig Konflikte erzeugt).
