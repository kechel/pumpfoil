#!/usr/bin/env python3
"""
ig-download.py — eigene Instagram-Videos zurückholen.

Hintergrund: Die alten Shorts (Nr. 3–98) liegen lokal nur als
shorts-fertig/-Dateien vor, teils mit YouTube-Mediathek-Musik, die nur auf
YouTube lizenziert ist. Auf Instagram liegt dagegen die Fassung mit
Pixabay-Musik — die ist auch auf Facebook nutzbar. Dieses Skript lädt die
eigenen IG-Videos über die offizielle API (media_url) herunter.

Aufruf:  python3 scripts/ig-download.py [--out ORDNER] [--limit N] [--dry-run]

Dateiname: <NNN>-ig-<datum>.mp4, wenn sich die Video-Nummer über die
gecachten Captions zuordnen lässt, sonst nur ig-<datum>-<id>.mp4.
Bereits vorhandene Dateien werden übersprungen (nichts wird überschrieben).
"""

import importlib.util
import json
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)


def main():
    args = sys.argv[1:]
    out = Path(args[args.index("--out") + 1]) if "--out" in args else \
        sm.BASE / "ig-rueckholung"
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else 500
    dry = "--dry-run" in args

    tok = sm.meta_access_token()
    pid = sm.meta_client()["page_id"]
    pg = sm._http_json(f"{sm.GRAPH}/{pid}?fields=access_token,"
                       f"instagram_business_account&access_token={tok}")
    pt = pg["access_token"]
    ig = pg["instagram_business_account"]["id"]

    media = sm._graph_all(
        f"{sm.GRAPH}/{ig}/media?fields=id,timestamp,caption,media_type,media_url"
        f"&limit=100&access_token={pt}", limit)
    videos = [m for m in media if m.get("media_type") == "VIDEO"]
    numbered = sm._posted_numbers(videos, "caption", sm._caption_words())
    by_id = {m["id"]: n for n, m in numbered.items()}

    print(f"{len(videos)} Videos auf Instagram, {len(by_id)} davon einer "
          f"Nummer zuzuordnen → Ziel: {out}")
    if not dry:
        out.mkdir(parents=True, exist_ok=True)

    done = skip = fail = 0
    for m in videos:
        day = m["timestamp"][:10]
        num = by_id.get(m["id"])
        name = (f"{num:03d}-ig-{day}.mp4" if num is not None
                else f"ig-{day}-{m['id']}.mp4")
        target = out / name
        if target.exists():
            skip += 1
            continue
        if not m.get("media_url"):
            print(f"  ✗ {name}: keine media_url (Instagram liefert sie nicht "
                  "für jedes Video)")
            fail += 1
            continue
        if dry:
            print(f"  → {name}")
            done += 1
            continue
        try:
            tmp = target.with_suffix(".part")
            with urllib.request.urlopen(m["media_url"], timeout=300) as r, \
                    tmp.open("wb") as f:
                while chunk := r.read(1 << 20):
                    f.write(chunk)
            tmp.rename(target)
            print(f"  ✓ {name} ({target.stat().st_size / 1048576:.1f} MB)")
            done += 1
        except OSError as e:
            print(f"  ✗ {name}: {str(e)[:120]}")
            fail += 1

    print(f"\n{done} geladen, {skip} schon vorhanden, {fail} fehlgeschlagen")
    if not dry:
        print(f"Ordner: {out}")


if __name__ == "__main__":
    main()
