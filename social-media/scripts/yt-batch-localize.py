#!/usr/bin/env python3
"""
yt-batch-localize.py — Titel-Lokalisierungen + Beschreibungen (13 Sprachen)
rückwirkend auf alle Kanal-Videos im Schema "NNN Pumpfoil YYYY <titel>" anwenden.

Aufruf:  python3 yt-batch-localize.py [--limit N] [--retry-failed]

- Captions werden je Video einmal generiert und in .yt-batch-cache.json
  gecacht → ein späterer Lauf (z. B. nach Boilerplate-Update) pusht ohne
  neue Claude-Aufrufe.
- Fortschritt in .yt-batch-progress.json; bereits erfolgreiche Videos werden
  übersprungen (--retry-failed versucht fehlgeschlagene erneut).
"""

import importlib.util
import json
import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sm", HERE / "shorts-musik.py")
sm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sm)

CACHE_FILE = HERE.parent / ".yt-batch-cache.json"
PROGRESS_FILE = HERE.parent / ".yt-batch-progress.json"
TITLE_RE = re.compile(r"^(\d+)\s+[Pp]umpfoil\s+(\d{4})\s*(.*)$")


def load(p, default):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return default


def main():
    limit = None
    retry_failed = "--retry-failed" in sys.argv
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])

    auth = {"Authorization": f"Bearer {sm.yt_access_token()}"}
    ch = sm._http_json("https://www.googleapis.com/youtube/v3/channels"
                       "?part=contentDetails&mine=true", headers=auth)
    uploads = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    videos, page = [], ""
    while True:
        d = sm._http_json("https://www.googleapis.com/youtube/v3/playlistItems"
                          f"?part=snippet&maxResults=50&playlistId={uploads}"
                          + (f"&pageToken={page}" if page else ""), headers=auth)
        for it in d["items"]:
            videos.append({"id": it["snippet"]["resourceId"]["videoId"],
                           "title": it["snippet"]["title"]})
        page = d.get("nextPageToken", "")
        if not page:
            break

    cache = load(CACHE_FILE, {})
    progress = load(PROGRESS_FILE, {})
    todo = []
    skipped = []
    for v in videos:
        m = TITLE_RE.match(v["title"])
        if not m or not m.group(3).strip():
            skipped.append(v["title"])
            continue
        st = progress.get(v["id"], {}).get("status")
        if st == "ok" or (st == "error" and not retry_failed):
            continue
        v["prefix"] = f"{m.group(1)} Pumpfoil {m.group(2)}"
        v["worktitle"] = m.group(3).strip()
        todo.append(v)
    if limit:
        todo = todo[:limit]

    print(f"{len(videos)} Videos gesamt, {len(skipped)} ohne Schema übersprungen, "
          f"{len(todo)} zu verarbeiten", flush=True)
    for t in skipped:
        print(f"  übersprungen: {t}", flush=True)

    workers = 10
    if "--workers" in sys.argv:
        workers = int(sys.argv[sys.argv.index("--workers") + 1])
    lock = threading.Lock()
    counts = {"ok": 0, "err": 0, "done": 0}

    def process(v):
        try:
            with lock:
                caps = cache.get(v["id"])
            if caps is None:
                caps = sm.generate_captions(v["worktitle"], v["prefix"])
                with lock:
                    cache[v["id"]] = caps
                    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False))
            r = sm.yt_localize(v["id"], caps.get("titles") or {},
                               caps.get("descriptions") or {},
                               str(caps.get("hashtags", "")))
            with lock:
                progress[v["id"]] = {"status": "ok", "title": v["title"],
                                     "written": len(r["written"])}
                counts["ok"] += 1
                counts["done"] += 1
                PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False, indent=1))
                print(f"[{counts['done']}/{len(todo)}] ✓ {v['title']}", flush=True)
        except Exception as e:  # noqa: BLE001 — Batch soll weiterlaufen
            with lock:
                progress[v["id"]] = {"status": "error", "title": v["title"],
                                     "error": str(e)[:300]}
                counts["err"] += 1
                counts["done"] += 1
                PROGRESS_FILE.write_text(json.dumps(progress, ensure_ascii=False, indent=1))
                print(f"[{counts['done']}/{len(todo)}] ✗ {v['title']}: {str(e)[:150]}", flush=True)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        list(ex.map(process, todo))
    print(f"fertig: {counts['ok']} ok, {counts['err']} Fehler", flush=True)


if __name__ == "__main__":
    main()
