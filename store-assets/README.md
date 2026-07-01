# Store-Assets

Screenshots & Marketing-Material für die App-Stores. **App-Icons** liegen NICHT hier,
sondern als Quell-Assets in den Watch-Projekten (Apple: `watch-apple/Sources/Assets.xcassets/AppIcon`,
Wear: `android/wear/src/main/res/mipmap-*`) und kommen über den Build mit.

## Struktur
```
store-assets/
├── apple-watch/   # App-Store-Connect-Screenshots (watchOS)
├── wear-os/       # Google-Play-Screenshots (Wear OS)
└── garmin/        # Connect-IQ-Store-Listing (Hero 1440×720, Titelbild 500×500, Gerätesymbol 128×128)
```

## Garmin (Connect IQ Store)
Listing-Grafiken (Screenshots macht Jan frisch aus dem Simulator, aktuelles UI mit „Pumpfoil"/v1.0.44):
- `hero-1440x720.png` — Hero-Bild (Wortmarke + TRACK EVERY PUMP, Slate-Hintergrund)
- `store-icon-500x500.png` — Titelbild Internet/Mobil (<300 KB)
- `device-icon-128-24bit.png` / `device-icon-128-64color.png` — Gerätesymbole für den App-Shop auf dem Gerät (2 Felder: 24-Bit-Farbe + reduzierte 64er-Palette), optional

Alle aus dem Marken-Icon (`watch-apple/.../AppIcon/icon-1024.png`) via Pillow generiert.

## Apple Watch (App Store Connect)
Pro Gerätegröße bis zu 10 Screenshots. Mindestens **eine** Größe genügt fürs Review.
Aus dem **Simulator** aufnehmen (Cmd+S) → liefert exakt die richtige Auflösung:

| Gerät | Auflösung(en) |
|------|----------------|
| Ultra 3 | 422 × 514, 410 × 502 |
| Series 11 | 416 × 496 |
| Series 9 | 396 × 484 |
| Series 6 | 368 × 448 |
| Series 3 | 312 × 390 |

Dateien z. B. `apple-watch/ultra3-01-aufnahme.png`.

## Wear OS (Google Play)
Play verlangt Screenshots der Wear-App (rund/eckig). Übliche Größen: **384 × 384** oder
**454 × 454** (rund). Mind. 1, besser 3–8. Aus dem Emulator: *Extended Controls → Screenshot*
(oder `adb exec-out screencap -p > shot.png`). Dateien z. B. `wear-os/01-aufnahme.png`.

## Hinweis
Reine Marketing-PNGs (keine Nutzerdaten) — dürfen ins Git. Builds/Binaries weiterhin nicht.
