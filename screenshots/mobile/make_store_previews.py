"""Store-Vorschaubilder (Titel über gerahmtem App-Screenshot, Brand-Hintergrund).

Erzeugt aus kuratierten App-Screenshots gerahmte Store-Previews:
  - Navy-Hintergrund (#020617 -> #0a1f3a) mit dezentem Wellen-Wasserzeichen
  - Titel oben (Montserrat, weiß + Cyan-Akzentbalken)
  - darunter der Screenshot mit runden Ecken, dünnem Rand und Schatten

Ausgabe:
  screenshots/mobile/ios-store/01..08.png     (1290x2796, App Store 6.7")
  screenshots/mobile/android-store/01..08.png (1080x2160, Play 2:1)

Aufruf:  python screenshots/mobile/make_store_previews.py
"""
from __future__ import annotations

import glob
import io
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
WAVES = ROOT / "brand" / "master" / "base" / "waves.svg"

CYAN = (34, 211, 238)
NAVY = (2, 6, 23)
WHITE = (255, 255, 255)

MONT = "/usr/share/fonts/opentype/montserrat/Montserrat-SemiBold.otf"
MONT_BOLD = "/usr/share/fonts/opentype/montserrat/Montserrat-Bold.otf"
FALLBACK = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _font(bold: bool, px: int) -> ImageFont.FreeTypeFont:
    for p in ([MONT_BOLD, MONT] if bold else [MONT, MONT_BOLD]):
        if os.path.exists(p):
            return ImageFont.truetype(p, px)
    return ImageFont.truetype(FALLBACK, px)


def _gradient(w: int, h: int) -> Image.Image:
    top, mid, bot = (2, 6, 23), (6, 18, 38), (10, 31, 58)
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(h - 1, 1)
        if t < 0.5:
            u = t / 0.5
            c = tuple(round(top[i] + (mid[i] - top[i]) * u) for i in range(3))
        else:
            u = (t - 0.5) / 0.5
            c = tuple(round(mid[i] + (bot[i] - mid[i]) * u) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def _waves(width: int) -> Image.Image | None:
    """Wellen-Wasserzeichen (cyan, transparent) in Zielbreite; None wenn cairosvg fehlt."""
    try:
        import cairosvg
    except Exception:
        return None
    if not WAVES.exists():
        return None
    svg = WAVES.read_text().replace("currentColor", "#22d3ee")
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=width, output_height=width)
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    # auf Inhalt zuschneiden
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def _round(img: Image.Image, r: int) -> Image.Image:
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.width, img.height], radius=r, fill=255)
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


def _wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w or not cur:
            cur = t
        else:
            lines.append(cur); cur = w
    if cur:
        lines.append(cur)
    return lines


def make(shot_path: str, title: str, canvas: tuple[int, int], out_path: Path,
         waves_cache: dict):
    W, H = canvas
    bg = _gradient(W, H).convert("RGBA")

    # Wellen-Wasserzeichen dezent unten (~8% Deckkraft), oversized.
    wv = waves_cache.get(W)
    if wv is None and W not in waves_cache:
        wv = _waves(int(W * 1.6))
        waves_cache[W] = wv
    if wv:
        wv2 = wv.copy()
        wv2.putalpha(wv2.getchannel("A").point(lambda a: int(a * 0.09)))
        bg.alpha_composite(wv2, (int((W - wv2.width) / 2), int(H - wv2.height * 0.75)))

    d = ImageDraw.Draw(bg)

    # --- Titel oben ---
    margin = int(W * 0.075)
    title_font = _font(True, int(W * 0.062))
    lines = _wrap(d, title, title_font, W - 2 * margin)
    asc, desc = title_font.getmetrics()
    lh = asc + desc + int(W * 0.012)
    top = int(H * 0.055)
    for i, ln in enumerate(lines):
        tw = d.textlength(ln, font=title_font)
        d.text(((W - tw) / 2, top + i * lh), ln, font=title_font, fill=WHITE)
    # Cyan-Akzentbalken unter dem Titel
    bar_y = top + len(lines) * lh + int(W * 0.02)
    bar_w = int(W * 0.12)
    d.rounded_rectangle([(W - bar_w) / 2, bar_y, (W + bar_w) / 2, bar_y + int(W * 0.012)],
                        radius=int(W * 0.006), fill=CYAN)

    # --- Screenshot gerahmt ---
    shot = Image.open(shot_path).convert("RGB")
    area_top = bar_y + int(H * 0.045)
    area_h = H - area_top - int(H * 0.05)
    max_w = W - 2 * int(W * 0.11)
    scale = min(max_w / shot.width, area_h / shot.height)
    sw, sh = int(shot.width * scale), int(shot.height * scale)
    shot = shot.resize((sw, sh), Image.LANCZOS)
    rad = int(sw * 0.055)
    rounded = _round(shot, rad)

    sx = (W - sw) // 2
    sy = area_top + max((area_h - sh) // 2, 0)

    # Schatten
    shadow = Image.new("RGBA", bg.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    pad = int(sw * 0.03)
    sd.rounded_rectangle([sx - pad, sy - pad + int(sh * 0.02), sx + sw + pad, sy + sh + pad + int(sh * 0.02)],
                         radius=rad + pad, fill=(0, 0, 0, 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(int(sw * 0.03)))
    bg.alpha_composite(shadow)
    bg.alpha_composite(rounded, (sx, sy))
    # dünner Cyan-Rand
    ImageDraw.Draw(bg).rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=rad,
                                         outline=(34, 211, 238, 90), width=max(2, int(sw * 0.004)))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    bg.convert("RGB").save(out_path)
    print(f"  {out_path.name}  <-  {Path(shot_path).name[:42]}  |  {title}")


def sorted_ios():
    return sorted(glob.glob(str(HERE / "ios" / "*2026-07-06*")))


def sorted_android():
    return sorted(glob.glob(str(HERE / "android" / "*")))


# (Index in sortierter Liste [1-basiert], Titel)
IOS = [
    (1,  "Jede Session automatisch getrackt"),
    (13, "Jeder Lauf auf der Karte"),
    (16, "Distanz · Speed · Pumps · Puls"),
    (20, "Dein Fortschritt über Zeit"),
    (76, "Community, Spots & Rekorde"),
    (26, "Chat mit anderen Foilern"),
    (24, "Alle Spots auf der Karte"),
    (34, "Dein Foil-Quiver & Leistung"),
]
ANDROID = [
    (3,  "Jede Session automatisch getrackt"),
    (8,  "Jeder Lauf auf der Karte"),
    (9,  "Distanz · Speed · Pumps · Puls"),
    (13, "Dein Fortschritt über Zeit"),
    (14, "Teile deine Session-Card"),
    (12, "Community, Spots & Rekorde"),
    (5,  "Chat mit anderen Foilern"),
    (32, "Alle Spots auf der Karte"),
]


def main():
    cache: dict = {}
    ios_files, an_files = sorted_ios(), sorted_android()
    print(f"iOS-Quellen: {len(ios_files)} · Android-Quellen: {len(an_files)}")

    print("iOS (1290x2796):")
    for i, (idx, title) in enumerate(IOS, 1):
        make(ios_files[idx - 1], title, (1290, 2796),
             HERE / "ios-store" / f"{i:02d}.png", cache)

    print("Android (1080x2160):")
    for i, (idx, title) in enumerate(ANDROID, 1):
        make(an_files[idx - 1], title, (1080, 2160),
             HERE / "android-store" / f"{i:02d}.png", cache)


if __name__ == "__main__":
    main()
