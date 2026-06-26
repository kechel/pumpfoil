#!/usr/bin/env python3
"""Erzeugt die vier Watch-Screenshots für die Landing-Page ("Auf der Uhr"-Sektion)
aus den Store-Asset-PNGs (-> WebP nach web/public/).

Neue Screenshots? PNGs in store-assets/{apple-watch,wear-os}/ ablegen, ggf. die
QUELLEN unten anpassen, dann ausführen:

    python3 scripts/make-landing-watch-shots.py
    (danach: cd web && npm run build  — dist wird live ausgeliefert)

Die Apple-Bilder werden rechteckig (rounded-rect im UI), die Wear-Bilder rund
maskiert dargestellt — hier nur konvertieren, das Maskieren macht das CSS.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent

# (Quelle relativ zum Repo-Root, Ziel in web/public) — Liste, da dieselbe Quelle
# mehrfach genutzt werden darf (z. B. Garmin-Start für Landing UND Anleitung).
SOURCES = [
    ("store-assets/apple-watch/ultra3-02.png", "web/public/watch-apple-1.webp"),
    ("store-assets/apple-watch/ultra3-04.png", "web/public/watch-apple-2.webp"),
    ("store-assets/wear-os/wear-02.png",       "web/public/watch-wear-1.webp"),
    ("store-assets/wear-os/wear-04.png",       "web/public/watch-wear-2.webp"),
    # Garmin (fenix, rund) — Landing-Sektion „Auf der Uhr".
    ("screenshots/watch/garmin/garmin-watch-1.0.24-start.png",    "web/public/watch-garmin-1.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-on-foil-1.png", "web/public/watch-garmin-2.webp"),
    # Garmin-Anleitungs-Galerie (WatchGuide, Tab „Anleitung").
    ("screenshots/watch/garmin/garmin-watch-1.0.24-start.png",           "web/public/guide/garmin/start.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-settings.png",        "web/public/guide/garmin/settings.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-pairing-code.png",    "web/public/guide/garmin/pairing-code.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-pairing-success.png", "web/public/guide/garmin/pairing-success.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-alarm-settings-1.png", "web/public/guide/garmin/alarm-1.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-alarm-settings-2.png", "web/public/guide/garmin/alarm-2.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-alarm-settings-3.png", "web/public/guide/garmin/alarm-3.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-on-foil-1.png",       "web/public/guide/garmin/on-foil-1.webp"),
    ("screenshots/watch/garmin/garmin-watch-1.0.24-on-foil-2.png",       "web/public/guide/garmin/on-foil-2.webp"),
    # Apple-Watch-Anleitungs-Galerie (WatchGuide). Quellen: Simulator-Screenshots (Reihenfolge nach Zeit).
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.01.46.png", "web/public/guide/apple/connect.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.01.50.png", "web/public/guide/apple/code.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.02.14.png", "web/public/guide/apple/start.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.02.28.png", "web/public/guide/apple/alarm.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.02.45.png", "web/public/guide/apple/data-1.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.02.50.png", "web/public/guide/apple/data-2.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.02.55.png", "web/public/guide/apple/stop.webp"),
    ("screenshots/watch/apple/Simulator Screenshot - Apple Watch Ultra 3 (49mm) - 2026-06-26 at 12.03.01.png", "web/public/guide/apple/upload.webp"),
]

def main() -> None:
    for src, dst in SOURCES:
        s, d = ROOT / src, ROOT / dst
        if not s.exists():
            print(f"FEHLT: {src} — übersprungen")
            continue
        d.parent.mkdir(parents=True, exist_ok=True)
        Image.open(s).convert("RGB").save(d, "WEBP", quality=88, method=6)
        print(f"ok  {src} -> {dst}")

if __name__ == "__main__":
    main()
