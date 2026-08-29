#!/usr/bin/env python3
"""ig-match.py — textlose Instagram-Posts über den Bildinhalt einer Nummer zuordnen.

Die 82 Instagram-Videos aus dem Juli 2026 wurden ohne Caption gepostet (vor dem
Studio). Der Textabgleich, mit dem Coverage- und Auswertungs-Tab sonst arbeiten,
hat dort nichts zum Vergleichen — und die Chronologie hilft nicht weiter,
gepostet wurde nachweislich nicht in Nummernreihenfolge (TikTok 17 %, Facebook
26 % Reihenfolgebrüche).

Also über das Bild: aus jedem Video ein paar Graustufen-Miniaturen, daraus je ein
Wahrnehmungs-Hash, und dann gegen die lokalen Renderfassungen vergleichen. Zwei
Fassungen desselben Videos (andere Musik, andere Kompression, anderer Zuschnitt)
haben sehr ähnliche Hashes, verschiedene Videos nicht.

    ./ig-match.py --verify     # Selbsttest an Posts mit bekannter Nummer
    ./ig-match.py --dry-run    # zuordnen, aber nichts schreiben
    ./ig-match.py              # zuordnen und .ig-numbers.json schreiben

Ergebnis landet in social-media/.ig-numbers.json; shorts-musik.py liest die Datei
und füllt damit die fehlenden Nummern im Auswertungs-Tab auf. Rein additiv —
gelöscht oder überschrieben wird nichts außer dieser einen Zuordnungsdatei.
"""
import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

BASE = sm.BASE
MAP_FILE = BASE / ".ig-numbers.json"
CACHE_FILE = BASE / ".ig-hashes.json"
DOWNLOAD_DIR = BASE / "ig-rueckholung"
# Wo die lokalen Renderfassungen liegen. Der Ordner im Home enthaelt die alten
# Juli-Videos (000-077), die es unter social-media/ nicht mehr gibt.
RENDER_DIRS = [Path.home() / "shorts-fertig", BASE / "shorts-fertig",
               BASE / "shorts-mit-musik"]

N_FRAMES = 10          # Miniaturen je Video
SIDE = 16              # 16x16 Graustufen -> 256-Bit-Hash
# Schwelle: mittlere Bit-Abweichung je Bild. Bei 256 Bit sind zwei Fassungen
# desselben Videos typisch < 25 auseinander, verschiedene Videos > 60.
MAX_DIST = 34


def frame_hashes(path: Path) -> list:
    """Bis zu N_FRAMES Wahrnehmungs-Hashes (aHash) über das Video verteilt."""
    n = SIDE * SIDE
    try:
        out = subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(path),
             "-vf", f"fps=1,scale={SIDE}:{SIDE},format=gray",
             "-frames:v", str(N_FRAMES), "-f", "rawvideo", "-"],
            capture_output=True, timeout=180).stdout
    except (OSError, subprocess.TimeoutExpired):
        return []
    hashes = []
    for i in range(len(out) // n):
        px = out[i * n:(i + 1) * n]
        avg = sum(px) / n
        bits = 0
        for j, v in enumerate(px):
            if v > avg:
                bits |= 1 << j
        hashes.append(bits)
    return hashes


def distance(a: list, b: list) -> float:
    """Mittlere Bit-Abweichung: je Bild aus a das ähnlichste aus b.

    So bleibt der Vergleich robust, wenn die Fassungen unterschiedlich
    beschnitten sind und die Bilder gegeneinander verschoben liegen."""
    if not a or not b:
        return 1e9
    return sum(min(bin(x ^ y).count("1") for y in b) for x in a) / len(a)


def local_renders() -> dict:
    """Nummer → Liste lokaler Dateien."""
    out = {}
    for d in RENDER_DIRS:
        if not d.is_dir():
            continue
        for p in sorted(d.rglob("*.mp4")):
            m = sm.NUM_RE.match(p.name)
            if m:
                out.setdefault(int(m.group(1)), []).append(p)
    return out


def load_cache() -> dict:
    return json.loads(CACHE_FILE.read_text()) if CACHE_FILE.is_file() else {}


def hashes_for(path: Path, cache: dict) -> list:
    key = f"{path}:{path.stat().st_mtime_ns}"
    if key not in cache:
        cache[key] = frame_hashes(path)
    return cache[key]


def ig_videos():
    tok = sm.meta_access_token()
    pid = sm.meta_client()["page_id"]
    pg = sm._http_json(f"{sm.GRAPH}/{pid}?fields=access_token,"
                       f"instagram_business_account&access_token={tok}")
    med = sm._graph_all(
        f"{sm.GRAPH}/{pg['instagram_business_account']['id']}/media"
        f"?fields=id,timestamp,caption,media_type,media_url,permalink"
        f"&limit=100&access_token={pg['access_token']}", 600)
    return [m for m in med if m.get("media_type") == "VIDEO"]


def fetch(m, quiet=False) -> Path | None:
    """Video herunterladen, falls noch nicht da. Vorhandenes bleibt unangetastet."""
    target = DOWNLOAD_DIR / f"ig-{m['timestamp'][:10]}-{m['id']}.mp4"
    if target.exists():
        return target
    if not m.get("media_url"):
        return None
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(".part")
    try:
        with urllib.request.urlopen(m["media_url"], timeout=300) as r, tmp.open("wb") as f:
            while chunk := r.read(1 << 20):
                f.write(chunk)
        tmp.rename(target)
        if not quiet:
            print(f"    geladen: {target.name} ({target.stat().st_size/1048576:.1f} MB)")
        return target
    except OSError as e:
        tmp.unlink(missing_ok=True)
        print(f"    Download fehlgeschlagen: {str(e)[:100]}")
        return None


def best_match(h, renders, cache):
    """Beste Nummer, ihr Abstand, und der Abstand der besten ANDEREN Nummer.

    Der zweite Wert muss von einer anderen Nummer stammen: zu einer Nummer
    liegen oft mehrere Dateien (YouTube-, Instagram-, TikTok-Fassung), die
    naturgemaess alle passen. Nimmt man die als "zweitbesten", sieht jeder
    richtige Treffer wie ein knapper aus."""
    per_num = {}
    for num, paths in renders.items():
        per_num[num] = min(distance(h, hashes_for(p, cache)) for p in paths)
    if not per_num:
        return None, 1e9, 1e9
    order = sorted(per_num.items(), key=lambda kv: kv[1])
    best, bd = order[0]
    second = order[1][1] if len(order) > 1 else 1e9
    return best, bd, second


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--verify", action="store_true",
                    help="Selbsttest an Posts, deren Nummer über die Caption bekannt ist")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()

    renders = local_renders()
    print(f"{sum(len(v) for v in renders.values())} lokale Renderdateien zu "
          f"{len(renders)} Nummern")
    vids = ig_videos()
    known = sm._posted_numbers(vids, "caption", sm._caption_words())
    by_id = {m["id"]: n for n, m in known.items()}
    cache = load_cache()

    if a.verify:
        # Gegenprobe: Posts mit bekannter Nummer, deren Rendering lokal liegt.
        test = [m for m in vids if by_id.get(m["id"]) in renders][:8]
        print(f"\nSelbsttest an {len(test)} Posts mit bekannter Nummer:\n")
        hit = 0
        for m in test:
            truth = by_id[m["id"]]
            p = fetch(m, quiet=True)
            if not p:
                print(f"  {truth:>3}  — kein Download möglich")
                continue
            h = hashes_for(p, cache)
            # Das eigene Rendering ausschliessen waere zu streng: gesucht ist
            # ja genau, ob es als naechstes gefunden wird.
            g, d, second = best_match(h, renders, cache)
            ok = g == truth
            hit += ok
            print(f"  {truth:>3}  gefunden {g:>3}  Abstand {d:5.1f}  "
                  f"zweitbester {second:5.1f}  {'✓' if ok else '✗'}")
        CACHE_FILE.write_text(json.dumps(cache))
        print(f"\n{hit}/{len(test)} richtig zugeordnet. Schwelle steht auf {MAX_DIST}.")
        return

    todo = [m for m in vids if m["id"] not in by_id]
    if a.limit:
        todo = todo[:a.limit]
    print(f"{len(todo)} Videos ohne Nummer aus der Caption\n")
    result, unclear = {}, []
    for i, m in enumerate(todo, 1):
        p = fetch(m)
        if not p:
            unclear.append((m, "kein Download (Instagram liefert keine media_url)"))
            continue
        h = hashes_for(p, cache)
        g, d, second = best_match(h, renders, cache)
        tag = f"[{i}/{len(todo)}] {m['timestamp'][:10]}"
        if g is not None and d <= MAX_DIST and second - d >= 8:
            result[m["id"]] = {"number": g, "distance": round(d, 1),
                               "runner_up": round(second, 1),
                               "timestamp": m["timestamp"], "permalink": m.get("permalink")}
            print(f"  {tag}  → {g:03d}   Abstand {d:.1f} (zweitbester {second:.1f})")
        else:
            unclear.append((m, f"bester {g} bei {d:.1f}, zweitbester {second:.1f}"))
            print(f"  {tag}  ? unklar — {unclear[-1][1]}")
        if i % 10 == 0:
            CACHE_FILE.write_text(json.dumps(cache))

    CACHE_FILE.write_text(json.dumps(cache))
    print(f"\n{len(result)} zugeordnet, {len(unclear)} unklar")
    if not a.dry_run:
        old = json.loads(MAP_FILE.read_text()) if MAP_FILE.is_file() else {}
        old.update(result)
        MAP_FILE.write_text(json.dumps(old, indent=1, ensure_ascii=False))
        print(f"→ {MAP_FILE} ({len(old)} Einträge)")
    else:
        print("(--dry-run: nichts geschrieben)")


if __name__ == "__main__":
    main()
