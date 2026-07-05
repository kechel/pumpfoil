# Brand-Assets (`brand/`)

**Ein Ort für alles Marken-/Store-/Social-Material** — sortiert danach, *wohin* es hochgeladen
wird. Logos/Icons werden aus **einer Basis** per Skript erzeugt (`master/`), nichts von Hand
nachbauen. Marken-Konzept & Farben: [`docs/BRAND.md`](../docs/BRAND.md).

> Farben (keine Verläufe): Cyan **#22d3ee** (hell) / **#0e7490** (dunkel), Navy **#020617**,
> Weiß, Grau **#94a3b8**. Alles identisch über Web/Garmin/Android/Apple/Zepp/COROS.

## Struktur

```
brand/
├─ master/        Generator: base/ (waves.svg + Avenir-Textblock) + gen.py + build.sh
├─ logo/          Kanonischer Referenz-Satz: 6 Logos (icon/horizontal/stacked × light|dark) + Wortmarke-SVGs
├─ app-icons/     App-Icon-Master (1024 light|dark) + plattform-spezifische (COROS, Zepp, Android-512)
├─ stores/        Store-Listing-Grafiken + Screenshots (pro Store)
├─ social/        YouTube-Banner, …
└─ _old/          abgelöste/duplizierte Dateien (Sicherheitsnetz, nicht gelöscht)
```

## Neu erzeugen

```
cd brand/master && ./build.sh
```
Schreibt: die Web-Runtime-Icons nach `web/public/`, die 6 Logos nach `logo/`, die App-Icon-Master
nach `app-icons/`. Nach Änderungen an `master/base/` einfach neu laufen lassen.

## Was gehört wohin (Zuordnung)

| Ziel / Plattform | Datei(en) | Größe/Format |
|---|---|---|
| **Web / PWA** (live, `web/public/`) | `icon-512/192`, `apple-touch-icon`, `favicon-16/32`, `oauth-logo-512/120`, `wordmark-h-{dark,light}` | von `master/build.sh` erzeugt — **nicht** in `brand/` (App lädt sie per Pfad) |
| **Connect IQ Store** (Garmin) | `stores/garmin/hero-1440x720.png`, `store-icon-500x500.png`, `device-icon-128-24bit.png`, `device-icon-128-64color.png` | Hero 1440×720, Titelbild 500×500 (<300 KB), Gerätesymbol 128 |
| ↳ Screenshots (aus Sim) | `stores/garmin/` (Jan legt ab) | — |
| **Google Play** (Phone) | `stores/google/feature-graphic-1024x500.png`, `app-icons/android-512.png`, `stores/google/phone/*.png` | Feature-Grafik 1024×500, Icon 512, Phone-Screenshots |
| **Google Play** (Wear) | `stores/google/wear-os/*.png` | 384×384 oder 454×454 (rund) |
| **App Store** (iPhone) | `app-icons/icon-1024-light.png`, `stores/apple/iphone-6.5/*.png` | Icon 1024, 6.5″-Screenshots |
| **App Store** (Apple Watch) | `stores/apple/apple-watch/*.png` | watchOS-Screenshots (Sim) |
| **COROS** | `app-icons/coros/pumpfoil-102.png`, `pumpfoil-144.png` | 102 / 144 |
| **Zepp / Amazfit** | `app-icons/zepp-240-round.png` | 240 rund |
| **YouTube** | `social/youtube-banner-2560x1440.png` (+ `.svg`) | 2560×1440 |
| **Instagram / Avatar** | `logo/logo-icon-light.png` (Kreis-Icon) | 1024 |

## App-Icon-Master → in den Projekten eingebettet

Die App-Icons in den Projekten werden aus dem Master (`app-icons/icon-1024-*.png`) abgeleitet und
liegen dort, wo der jeweilige Build sie erwartet (bewusst NICHT hier verschieben):
- **Apple** (iOS + Watch): `watch-apple/Sources*/Assets.xcassets/AppIcon.appiconset/icon-1024.png`
- **Android/Wear**: `android/wear/src/main/res/mipmap-*/`
- **Garmin**: `watch/resources/drawables/launcher_icon.png`
