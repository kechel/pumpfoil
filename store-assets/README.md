# Store-Assets

Screenshots & Marketing-Material für die App-Stores. **App-Icons** liegen NICHT hier,
sondern als Quell-Assets in den Watch-Projekten (Apple: `watch-apple/Sources/Assets.xcassets/AppIcon`,
Wear: `android/wear/src/main/res/mipmap-*`) und kommen über den Build mit.

## Struktur
```
store-assets/
├── apple-watch/   # App-Store-Connect-Screenshots (watchOS)
└── wear-os/       # Google-Play-Screenshots (Wear OS)
```

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
