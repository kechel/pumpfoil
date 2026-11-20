#!/usr/bin/env python3
"""Performance-Icons aus dem Web nach Android und iOS uebertragen (Jan 20.11.2026: „zieh mal alles nach … auf android
und ios").

Quelle bleibt web/src/components/Icons.tsx. Dieses Skript rendert die Icons dort (render.tsx, ueber esbuild) und schreibt
  * Android: android/app/src/main/res/drawable/perf_<name>.xml (Vector Drawable, im Code mit tint eingefaerbt)
  * iOS:     watch-apple/Sources-iOS/Assets.xcassets/Perf<Name>.imageset (SVG, Template -> foregroundStyle faerbt)
Kreise und abgerundete Rechtecke werden zu Pfaden, gestrichelte Linien zu Einzelstuecken (Vector Drawables kennen keine
Strichelung). Nach einer Aenderung an einem dieser Icons im Web neu laufen lassen:

    python3 scripts/perf-icons/bauen.py
"""
import json
import os
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ANDROID = REPO / "android/app/src/main/res/drawable"
IOS = REPO / "watch-apple/Sources-iOS/Assets.xcassets"


def rendern() -> dict:
    web = REPO / "web"
    with tempfile.TemporaryDirectory() as tmp:
        ziel = Path(tmp) / "render.cjs"
        env = dict(os.environ, NODE_PATH=str(web / "node_modules"))
        subprocess.run(["npx", "esbuild", str(REPO / "scripts/perf-icons/render.tsx"), "--bundle", "--platform=node",
                        "--jsx=automatic", "--log-level=error", f"--outfile={ziel}"], cwd=web, env=env, check=True)
        return json.loads(subprocess.run(["node", str(ziel)], check=True, capture_output=True, text=True).stdout)


def f(x: float) -> str:
    return f"{x:.3f}".rstrip("0").rstrip(".")


def kreis(cx, cy, r) -> str:
    return f"M{f(cx - r)} {f(cy)}a{f(r)} {f(r)} 0 1 0 {f(2 * r)} 0a{f(r)} {f(r)} 0 1 0 {f(-2 * r)} 0Z"


def rechteck(x, y, w, h, rx) -> str:
    if not rx:
        return f"M{f(x)} {f(y)}h{f(w)}v{f(h)}h{f(-w)}Z"
    return (f"M{f(x + rx)} {f(y)}h{f(w - 2 * rx)}a{f(rx)} {f(rx)} 0 0 1 {f(rx)} {f(rx)}v{f(h - 2 * rx)}"
            f"a{f(rx)} {f(rx)} 0 0 1 {f(-rx)} {f(rx)}h{f(-(w - 2 * rx))}a{f(rx)} {f(rx)} 0 0 1 {f(-rx)} {f(-rx)}"
            f"v{f(-(h - 2 * rx))}a{f(rx)} {f(rx)} 0 0 1 {f(rx)} {f(-rx)}Z")


def gestrichelt(d: str, muster: str) -> str:
    """Nur waagerechte/senkrechte Einzelstrecken ("Mx yh…" / "Mx yv…") — mehr braucht kein Icon."""
    m = re.fullmatch(r"M\s*([-\d.]+)[ ,]([-\d.]+)\s*([hv])\s*([-\d.]+)", d.strip())
    if not m:
        raise SystemExit(f"Strichelung nur fuer einfache h/v-Linien: {d}")
    x, y, achse, laenge = float(m[1]), float(m[2]), m[3], float(m[4])
    an, aus = (float(v) for v in muster.replace(",", " ").split()[:2])
    teile, pos = [], 0.0
    while pos < abs(laenge) - 1e-6:
        stueck = min(an, abs(laenge) - pos)
        s = pos if laenge > 0 else -pos
        if achse == "h":
            teile.append(f"M{f(x + s)} {f(y)}h{f(stueck if laenge > 0 else -stueck)}")
        else:
            teile.append(f"M{f(x)} {f(y + s)}v{f(stueck if laenge > 0 else -stueck)}")
        pos += an + aus
    return "".join(teile)


def elemente(svg: str) -> list[tuple[str, bool]]:
    """[(pathData, gefuellt)] — Strich immer (2, rund), Fuellung nur bei fill="currentColor"."""
    wurzel = ET.fromstring(svg)
    out = []
    for e in wurzel:
        tag, a = e.tag.split("}")[-1], e.attrib
        num = lambda k, s=0.0: float(a.get(k, s))  # noqa: E731
        if tag == "path":
            d = a["d"]
            if a.get("stroke-dasharray"):
                d = gestrichelt(d, a["stroke-dasharray"])
        elif tag == "circle":
            d = kreis(num("cx"), num("cy"), num("r"))
        elif tag == "rect":
            d = rechteck(num("x"), num("y"), num("width"), num("height"), num("rx"))
        elif tag == "line":
            d = f"M{a['x1']} {a['y1']}L{a['x2']} {a['y2']}"
        else:
            raise SystemExit(f"unbekanntes Element {tag}")
        out.append((d, a.get("fill") == "currentColor"))
    return out


def schlange(n: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z0-9])", "_", n.removesuffix("Icon")).lower().replace("_1_0_0", "100")


def android(name: str, teile) -> None:
    pfade = "\n".join(
        f'    <path android:pathData="{d}" android:strokeColor="#FF000000" android:strokeWidth="2"\n'
        f'        android:strokeLineCap="round" android:strokeLineJoin="round"'
        f' android:fillColor="{"#FF000000" if voll else "#00000000"}" />'
        for d, voll in teile)
    (ANDROID / f"perf_{schlange(name)}.xml").write_text(
        f'<?xml version="1.0" encoding="utf-8"?>\n<!-- erzeugt von scripts/perf-icons/bauen.py aus web Icons.tsx '
        f'({name}) — nicht von Hand aendern -->\n'
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n'
        '    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">\n'
        f"{pfade}\n</vector>\n")


def ios(name: str, teile) -> None:
    ordner = IOS / f"Perf{name.removesuffix('Icon')}.imageset"
    ordner.mkdir(exist_ok=True)
    datei = f"perf-{schlange(name).replace('_', '-')}.svg"
    pfade = "".join(f'<path d="{d}" fill="{"#000" if voll else "none"}"/>' for d, voll in teile)
    (ordner / datei).write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke="#000" '
        f'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{pfade}</svg>\n')
    (ordner / "Contents.json").write_text(json.dumps({
        "images": [{"idiom": "universal", "filename": datei}],
        "info": {"author": "xcode", "version": 1},
        "properties": {"preserves-vector-representation": True, "template-rendering-intent": "template"},
    }, indent=2) + "\n")


def main() -> None:
    for name, svg in rendern().items():
        teile = elemente(svg)
        android(name, teile)
        ios(name, teile)
        print(f"{name}: {len(teile)} Pfade -> perf_{schlange(name)}.xml, Perf{name.removesuffix('Icon')}.imageset")


if __name__ == "__main__":
    main()
