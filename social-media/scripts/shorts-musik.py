#!/usr/bin/env python3
"""
shorts-musik.py — Server für das Shorts-Studio: Musik/Overlay/Texte/Trim auf
Rohvideos rendern (3 Plattform-Varianten) + Uploads-Verwaltung mit
Titel-Übersetzung (claude-CLI, 10 Sprachen).

UI:      React + Vite + TS in scripts/shorts-ui/ — bauen mit `npm run build`
         (Server liefert shorts-ui/dist/ aus); Dev-Modus: `npm run dev` (proxyt hierher).
Start:   python3 scripts/shorts-musik.py [video-ordner]   → http://localhost:8765
         (läuft als launchd-Agent org.pumpfoil.shorts-musik; Neustart nach
         Server-Änderungen: launchctl kickstart -k gui/501/org.pumpfoil.shorts-musik)
CLI:     python3 scripts/shorts-musik.py --render <video> <track> <out.mp4> [gain_dB]

Ordner (relativ zu social-media/):
  neue-videos-ungesichtet/  Eingabe-Default; in der UI frei umschaltbar (Pfad-Feld/📁 links)
  musik/                Musik-Pool. Unterordner steuern die Lizenz-Zuordnung:
                          musik/youtube/    nur YouTube (YT Audio Library Standard-Lizenz)
                          musik/instagram/  nur Instagram (Meta Sound Collection)
                          musik/alle/ oder musik/ direkt → beide (Pixabay, CC-BY, …)
  shorts-mit-musik/     Ausgabe: youtube/ + instagram/ (mit Musik) und
                        tiktok/ (ohne Musik, O-Ton pur — Musik wird dort
                        beim Upload in der App hinzugefügt, Lizenz nur in-app);
                        Overlay/Texte/Trim sind in allen drei identisch.

Render: Video-Stream wird kopiert (kein Re-Encode), nur Audio wird neu gemischt:
O-Ton unverändert + Musik mit wählbarem Pegel, 1 s Fade-in, 2 s Fade-out,
Musik wird bei Bedarf geloopt und auf Videolänge geschnitten.
"""

import base64
import datetime
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent  # scripts/ → social-media/
VIDEO_DIR = BASE / "neue-videos-ungesichtet"
MUSIC_DIR = BASE / "musik"
OVERLAY_DIR = BASE / "overlays"
OUT_DIR = BASE / "shorts-mit-musik"
PROCESSED_DIR = BASE / "videos-verarbeitet"  # Quellvideos nach erfolgreichem Render
INBOX_DIR = BASE / "neue-videos-ungesichtet"  # Ziel beim Verwerfen eines Exports
DIST = Path(__file__).resolve().parent / "shorts-ui" / "dist"  # React-Build
CLAUDE_BIN = shutil.which("claude") or str(Path.home() / ".local/bin/claude")
CAPTION_LANGS = ["de", "gsw", "de-AT", "en", "fr", "it", "es", "fi", "nl", "cs"]
PORT = 8765
PLATFORMS = ("youtube", "instagram")
AUDIO_EXT = {".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"}
FADE_IN = 1.0
FADE_OUT = 2.0
# Text-Overlays: der Browser rendert den Text (inkl. Emojis) als transparentes
# PNG in Videogröße; ffmpeg blendet es mit fade alpha ein/aus.
TEXT_FADE = 0.5
TEXT_HOLD = 2.0
OUTRO_SECS = 2.5       # Like/Follow-Icons: sichtbar in den letzten x Sekunden …
OUTRO_SECS_LONG = 4.0  # … bzw. bei Videos über 20 s
OUTRO_LONG_AB = 20.0
PROGRESS = {"active": False, "label": "", "pct": 0.0}  # Render-Fortschritt fürs UI
STARS_FILE = BASE / ".shorts-musik-stars.json"  # gemerkte Videos (⭐ in der Sidebar)
MOVES = []  # Undo-Historie der Eimer-Verschiebungen: {"src":…, "dest":…}
QUICK_DIRS = [  # Schnellzugriff-Chips in der Sidebar: (Label, Pfad)
    ("janhandy", "/Users/jan/bilder/20260606-janhandy/2026/mp4"),
    ("shorts-fertig", "/Users/jan/shorts-fertig"),
    ("neue-videos-ungesichtet", "/Users/jan/neue-videos-ungesichtet"),
]


def load_stars():
    try:
        return set(json.loads(STARS_FILE.read_text()))
    except (OSError, ValueError):
        return set()


def save_stars(stars):
    STARS_FILE.write_text(json.dumps(sorted(stars)))


def unstar(name):
    stars = load_stars()
    if name in stars:
        stars.discard(name)
        save_stars(stars)


# ---------------------------------------------------------------- ffmpeg ----

def ffprobe(path, *args):
    out = subprocess.run(
        ["ffprobe", "-v", "error", *args, str(path)],
        capture_output=True, text=True, check=True,
    )
    return out.stdout.strip()


def duration_of(path):
    return float(ffprobe(path, "-show_entries", "format=duration", "-of", "csv=p=0"))


_DUR_CACHE = {}


def track_duration(p: Path):
    key = (str(p), p.stat().st_mtime)
    if key not in _DUR_CACHE:
        try:
            _DUR_CACHE[key] = round(duration_of(p), 1)
        except (subprocess.CalledProcessError, ValueError):
            _DUR_CACHE[key] = None
    return _DUR_CACHE[key]


def has_audio(path):
    streams = ffprobe(path, "-show_entries", "stream=codec_type", "-of", "csv=p=0")
    return "audio" in streams


THUMB_DIR = BASE / ".thumbs-cache"


def make_thumb(video: Path, t: float) -> Path:
    out = THUMB_DIR / (hashlib.md5(
        f"{video}|{video.stat().st_mtime}|{t}".encode()).hexdigest() + ".jpg")
    if out.exists():
        return out
    THUMB_DIR.mkdir(exist_ok=True)
    for pos in (t, 0):  # Fallback auf Videoanfang, falls t hinter dem Ende liegt
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-ss", str(pos), "-i", str(video),
             "-frames:v", "1", "-vf", "scale=270:-2", "-q:v", "4", str(out)],
            capture_output=True)
        if out.exists() and out.stat().st_size > 0:
            return out
    raise FileNotFoundError(video)


def video_dims(path):
    """Anzeige-Maße: Handy-Videos tragen oft ein Rotations-Flag (quer
    gespeichert, hochkant angezeigt) — ffmpeg dreht beim Dekodieren
    automatisch, also müssen wir hier mitdrehen."""
    line = ffprobe(path, "-select_streams", "v:0", "-show_entries",
                   "stream=width,height", "-of", "csv=p=0").splitlines()[0]
    w, h = (int(x) for x in line.split(",")[:2])
    rot = ffprobe(path, "-select_streams", "v:0", "-show_entries",
                  "stream_side_data=rotation", "-of", "csv=p=0")
    if any(abs(int(float(r))) % 180 == 90
           for r in re.findall(r"-?\d+(?:\.\d+)?", rot)):
        w, h = h, w
    return w, h


def render(video: Path, track: Path, out: Path, gain_db: float,
           fade_out: float = FADE_OUT, overlay: Path = None,
           trim_start: float = 0.0, trim_end: float = None,
           texts: list = None, outro: Path = None):
    full = duration_of(video)
    start = max(0.0, min(trim_start or 0.0, full))
    end = min(trim_end, full) if trim_end else full
    if end - start < 0.5:
        raise ValueError("Trim-Bereich zu kurz (unter 0,5 s)")
    dur = end - start
    trimmed = start > 0.01 or end < full - 0.01
    fade_out = max(0.001, min(fade_out, dur / 2))
    inputs = []
    if trimmed:
        inputs += ["-ss", f"{start:.3f}", "-to", f"{end:.3f}"]
    inputs += ["-i", str(video)]
    n_inputs = 1
    fc_parts = []
    # Audio: mit Track → Musik über O-Ton mischen; ohne Track (TikTok) → O-Ton pur
    if track is not None:
        inputs += ["-stream_loop", "-1", "-i", str(track)]
        n_inputs += 1
        music = (
            f"volume={gain_db}dB,"
            f"afade=t=in:d={min(FADE_IN, dur / 4):.3f},"
            f"afade=t=out:st={dur - fade_out:.3f}:d={fade_out:.3f}"
        )
        if has_audio(video):
            fc_parts.append(f"[1:a]{music}[m];"
                            "[0:a][m]amix=inputs=2:duration=first:normalize=0[a]")
        else:
            fc_parts.append(f"[1:a]{music}[a]")
        amap = ["-map", "[a]"]
        acodec = ["-c:a", "aac", "-b:a", "192k"]
    elif has_audio(video):
        amap = ["-map", "0:a"]
        acodec = ["-c:a", "copy"] if not trimmed else ["-c:a", "aac", "-b:a", "192k"]
    else:
        amap, acodec = [], []
    vsrc = "[0:v]"
    if overlay:
        w, h = video_dims(video)
        inputs += ["-i", str(overlay)]
        ov_idx = n_inputs
        n_inputs += 1
        fc_parts.append(f"[{ov_idx}:v]scale={w}:{h}[ov];"
                        "[0:v][ov]overlay=0:0:format=auto[vo]")
        vsrc = "[vo]"
    # Text-PNGs: Zeiten beziehen sich aufs Original, nach Trim verschiebt
    # sich die Output-Zeitachse um -start
    for i, tx in enumerate(texts or []):
        s = float(tx.get("start", 0)) - start
        try:
            hold = max(0.0, float(tx.get("hold", TEXT_HOLD)))
        except (TypeError, ValueError):
            hold = TEXT_HOLD
        e = s + 2 * TEXT_FADE + hold
        inputs += ["-loop", "1", "-i", str(tx["png"])]
        idx = n_inputs
        n_inputs += 1
        fc_parts.append(
            f"[{idx}:v]format=rgba"
            f",fade=t=in:st={s:.3f}:d={TEXT_FADE}:alpha=1"
            f",fade=t=out:st={e - TEXT_FADE:.3f}:d={TEXT_FADE}:alpha=1[t{i}];"
            f"{vsrc}[t{i}]overlay=0:0:format=auto[v{i}]")
        vsrc = f"[v{i}]"
    if outro:
        # Plattform-Icons (Like/Follow/…) in den letzten Sekunden einblenden
        inputs += ["-loop", "1", "-i", str(outro)]
        idx = n_inputs
        n_inputs += 1
        st = max(0.0, dur - (OUTRO_SECS_LONG if dur > OUTRO_LONG_AB else OUTRO_SECS))
        fc_parts.append(
            f"[{idx}:v]format=rgba"
            f",fade=t=in:st={st:.3f}:d={TEXT_FADE}:alpha=1[outro];"
            f"{vsrc}[outro]overlay=0:0:format=auto[vout]")
        vsrc = "[vout]"
    if vsrc != "[0:v]":
        vmap, reencode = vsrc, True
    else:
        vmap, reencode = "0:v", trimmed  # Schnitt braucht Re-Encode (Copy = nur Keyframes)
    vcodec = (["-c:v", "libx264", "-crf", "20", "-preset", "medium",
               "-pix_fmt", "yuv420p"] if reencode else ["-c:v", "copy"])
    out.parent.mkdir(parents=True, exist_ok=True)
    fc = [] if not fc_parts else ["-filter_complex", ";".join(fc_parts)]
    cmd = [
        "ffmpeg", "-y", "-nostats", "-progress", "pipe:1", *inputs,
        *fc, "-map", vmap, *amap, *vcodec, *acodec,
        "-t", f"{dur:.3f}", "-movflags", "+faststart", str(out),
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, text=True)
    tail = []
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("out_time_us=") or line.startswith("out_time_ms="):
            try:
                # beide Keys tragen Mikrosekunden (ffmpeg-Eigenheit)
                PROGRESS["pct"] = min(100.0, int(line.split("=")[1]) / 1e6 / dur * 100)
            except ValueError:
                pass
        elif not re.match(r"^[a-z_0-9.]+=", line):
            tail.append(line)
            if len(tail) > 50:
                del tail[0]
    if proc.wait() != 0:
        raise subprocess.CalledProcessError(proc.returncode, cmd,
                                            stderr="\n".join(tail))
    PROGRESS["pct"] = 100.0


# ------------------------------------------------------------- Dateilisten --

# max. 3 Stellen: Datums-Präfixe wie "20260714-" sind KEINE laufende Nummer
NUM_RE = re.compile(r"^(\d{1,3})-")


def name_prefix():
    return f"Pumpfoil-{datetime.date.today().year}-"


def next_number():
    """Höchste Short-Nummer über alle relevanten Ordner + 1 (fortlaufend)."""
    n = 0
    for d in (BASE / "shorts-fertig", OUT_DIR / "youtube",
              OUT_DIR / "instagram", OUT_DIR / "tiktok"):
        if d.is_dir():
            for p in d.iterdir():
                m = NUM_RE.match(p.name)
                if m:
                    n = max(n, int(m.group(1)))
    # Fallback: verschobene Quellvideos heißen <orig>-NNN-<name>.mp4
    if PROCESSED_DIR.is_dir():
        for p in PROCESSED_DIR.iterdir():
            m = re.search(r"-(\d{1,3})-", p.name)
            if m:
                n = max(n, int(m.group(1)))
    return n + 1


def track_platforms(rel: Path):
    # YouTube nur mit Tracks aus der YT Audio Library (musik/youtube/) —
    # Pixabay & Co. lösen dort Content-ID-Sperren aus. Rest → nur Instagram.
    top = rel.parts[0] if len(rel.parts) > 1 else ""
    if top == "youtube":
        return ["youtube"]
    return ["instagram"]


def list_state():
    videos = sorted(
        p.name for p in VIDEO_DIR.glob("*.mp4") if not p.name.startswith(".")
    )
    video_dir = str(VIDEO_DIR)
    # Videolängen parallel proben (gecacht über _DUR_CACHE)
    with ThreadPoolExecutor(8) as ex:
        vdurs = dict(zip(videos, ex.map(
            lambda n, d=VIDEO_DIR: track_duration(d / n), videos)))
    subdirs = []
    try:
        for p in sorted(VIDEO_DIR.iterdir()):
            if p.is_dir() and not p.name.startswith("."):
                subdirs.append({"name": p.name,
                                "mp4s": sum(1 for _ in p.glob("*.mp4"))})
    except PermissionError:
        pass
    tracks = []
    for p in sorted(MUSIC_DIR.rglob("*")):
        if p.suffix.lower() in AUDIO_EXT and not p.name.startswith("."):
            rel = p.relative_to(MUSIC_DIR)
            tracks.append({
                "rel": str(rel),
                "folder": str(rel.parent) if str(rel.parent) != "." else "alle",
                "platforms": track_platforms(rel),
                "dur": track_duration(p),
            })
    rendered = {
        v: [pf for pf in (*PLATFORMS, "tiktok") if (OUT_DIR / pf / v).exists()]
        for v in videos
    }
    overlays = sorted(
        p.name for p in OVERLAY_DIR.glob("*.png") if not p.name.startswith(".")
    ) if OVERLAY_DIR.is_dir() else []
    return {"videos": videos, "tracks": tracks, "rendered": rendered,
            "platforms": PLATFORMS, "video_dir": video_dir,
            "parent": str(VIDEO_DIR.parent), "subdirs": subdirs,
            "overlays": overlays, "next_number": next_number(),
            "name_prefix": name_prefix(), "stars": sorted(load_stars()),
            "quick_dirs": [{"label": lbl, "dir": str(Path(d).resolve())}
                           for lbl, d in QUICK_DIRS if Path(d).is_dir()],
            "vdurs": vdurs}


def exports_state():
    """Fertige Renders, gruppiert über die drei Plattform-Ordner."""
    groups = {}
    for pf in (*PLATFORMS, "tiktok"):
        d = OUT_DIR / pf
        if not d.is_dir():
            continue
        for p in d.glob("*.mp4"):
            g = groups.setdefault(p.name, {"name": p.name, "platforms": [], "mtime": 0})
            g["platforms"].append(pf)
            g["mtime"] = max(g["mtime"], p.stat().st_mtime)
    result = sorted(groups.values(), key=lambda g: -g["mtime"])[:100]
    for g in result:
        stem = Path(g["name"]).stem
        src = next(PROCESSED_DIR.glob(f"*-{stem}.mp4"), None)
        g["source"] = src.name if src else None
    return result


def caption_prompt(title: str) -> str:
    return f"""Du bist Social-Media-Redakteur für pumpfoil.org (Pumpfoiling/Dockstart-Wassersport, Tracking-App).
Für ein kurzes Hochkant-Video (YouTube Short / Instagram Reel / TikTok) mit dem Arbeitstitel "{title}" erzeuge Metadaten.

Antworte AUSSCHLIESSLICH mit gültigem JSON (kein Markdown, keine Code-Fences) in exakt dieser Struktur:
{{"titles": {{{", ".join(f'"{lang}": "..."' for lang in CAPTION_LANGS)}}},
 "yt_description": "...", "instagram": "...", "tiktok": "..."}}

Regeln:
- titles: knackiger Video-Titel je Sprache, max. 80 Zeichen. gsw = Schweizerdeutsch (Mundart), de-AT = österreichisches Deutsch (darf sich von de unterscheiden, z.B. Austriazismen).
- yt_description: 1-2 Sätze Deutsch, dann 1-2 Sätze Englisch, dann eine Zeile mit 6-8 Hashtags (#pumpfoil #pumpfoiling #dockstart #foil ...), dann "🌊 https://pumpfoil.org – track every pump".
- instagram: lockere Caption, 1-2 Sätze Deutsch + 1-2 Sätze Englisch mit passenden Emojis, Leerzeile, dann 8-12 Hashtags.
- tiktok: 1 kurzer englischer Satz (+ optional deutsch), 4-6 Hashtags.
"""


def generate_captions(title: str) -> dict:
    env = {"HOME": str(Path.home()),
           "USER": Path.home().name,  # ohne USER findet die CLI ihre Keychain-Anmeldung nicht
           "PATH": "/opt/homebrew/bin:/usr/bin:/bin:" + str(Path.home() / ".local/bin")}
    proc = subprocess.run([CLAUDE_BIN, "-p", caption_prompt(title)],
                          capture_output=True, text=True, timeout=300, env=env)
    if proc.returncode != 0:
        raise RuntimeError(f"claude-CLI fehlgeschlagen: {(proc.stderr or proc.stdout)[-300:]}")
    out = proc.stdout.strip()
    # evtl. Code-Fences oder Text drumherum entfernen
    start, end = out.find("{"), out.rfind("}")
    if start < 0 or end < 0:
        raise RuntimeError(f"keine JSON-Antwort: {out[:200]}")
    return json.loads(out[start:end + 1])


def safe_child(base: Path, rel: str) -> Path:
    p = (base / rel).resolve()
    if not p.is_file() or base.resolve() not in p.parents:
        raise FileNotFoundError(rel)
    return p


# ---------------------------------------------------------------- HTTP ------

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _file(self, path: Path):
        """Datei mit Range-Support ausliefern (Safari braucht das für <video>)."""
        size = path.stat().st_size
        ctype = {"mp4": "video/mp4", "mp3": "audio/mpeg", "m4a": "audio/mp4",
                 "wav": "audio/wav", "flac": "audio/flac", "ogg": "audio/ogg",
                 "opus": "audio/ogg", "aac": "audio/aac", "png": "image/png",
                 "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp",
                 "html": "text/html; charset=utf-8", "js": "text/javascript",
                 "css": "text/css", "svg": "image/svg+xml"}.get(
            path.suffix.lstrip(".").lower(), "application/octet-stream")
        start, end = 0, size - 1
        rng = self.headers.get("Range")
        m = re.match(r"bytes=(\d*)-(\d*)$", rng or "")
        if rng and m:
            if m.group(1):
                start = int(m.group(1))
            if m.group(2):
                end = min(int(m.group(2)), size - 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        else:
            self.send_response(200)
        length = end - start + 1
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(length))
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            remaining = length
            while remaining > 0:
                chunk = f.read(min(65536, remaining))
                if not chunk:
                    break
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    return
                remaining -= len(chunk)

    def do_GET(self):
        raw, _, qs = self.path.partition("?")
        path = urllib.parse.unquote(raw)
        query = urllib.parse.parse_qs(qs)
        try:
            if path == "/":
                self._file(DIST / "index.html")
            elif path.startswith("/assets/"):
                self._file(safe_child(DIST, path.lstrip("/")))
            elif path == "/api/list":
                self._json(list_state())
            elif path == "/api/progress":
                self._json(PROGRESS)
            elif path == "/api/exports":
                self._json({"exports": exports_state()})
            elif path.startswith("/media/video/"):
                self._file(safe_child(VIDEO_DIR, path[len("/media/video/"):]))
            elif path.startswith("/media/musik/"):
                self._file(safe_child(MUSIC_DIR, path[len("/media/musik/"):]))
            elif path.startswith("/media/out/"):
                self._file(safe_child(OUT_DIR, path[len("/media/out/"):]))
            elif path.startswith("/media/overlay/"):
                self._file(safe_child(OVERLAY_DIR, path[len("/media/overlay/"):]))
            elif path.startswith("/thumb/"):
                name = path[len("/thumb/"):]
                base_q = query.get("base", [""])[0]
                if base_q.startswith("out:") and base_q[4:] in (*PLATFORMS, "tiktok"):
                    video = safe_child(OUT_DIR / base_q[4:], name)
                else:
                    video = safe_child(VIDEO_DIR, name)
                t = float(query.get("t", ["1"])[0])
                self._file(make_thumb(video, t))
            else:
                self.send_error(404)
        except FileNotFoundError:
            self.send_error(404)
        except ConnectionError:
            pass

    def do_POST(self):
        global VIDEO_DIR
        req = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        if self.path == "/api/setdir":
            d = Path(req.get("dir", "")).expanduser()
            if not d.is_absolute():
                d = BASE / d
            if not d.is_dir():
                return self._json({"error": f"Kein Ordner: {d}"}, 400)
            VIDEO_DIR = d.resolve()
            return self._json(list_state())
        if self.path == "/api/discard_export":
            name = Path(str(req.get("name", ""))).name
            if not name.endswith(".mp4"):
                return self._json({"error": "Ungültiger Name"}, 400)
            removed = 0
            for pf in (*PLATFORMS, "tiktok"):
                p = OUT_DIR / pf / name
                if p.is_file():
                    p.unlink()
                    removed += 1
            # Quellvideo zurück in den Ungesichtet-Ordner (Original-Name wiederherstellen)
            stem = Path(name).stem
            src = next(PROCESSED_DIR.glob(f"*-{stem}.mp4"), None)
            if src is not None:
                orig = src.name[:-len(f"-{stem}.mp4")] + ".mp4"
                INBOX_DIR.mkdir(parents=True, exist_ok=True)
                target = INBOX_DIR / orig
                n = 1
                while target.exists():
                    target = INBOX_DIR / f"{Path(orig).stem}-{n}.mp4"
                    n += 1
                shutil.move(str(src), str(target))
            if not removed and src is None:
                return self._json({"error": "Export nicht gefunden"}, 404)
            return self._json({"exports": exports_state()})
        if self.path == "/api/reveal":
            name = Path(str(req.get("name", ""))).name
            for pf in ("tiktok", *PLATFORMS):
                p = OUT_DIR / pf / name
                if p.is_file():
                    subprocess.run(["open", "-R", str(p)], check=False)
                    return self._json({"ok": True})
            return self._json({"error": "Datei nicht gefunden"}, 404)
        if self.path == "/api/captions":
            title = str(req.get("title", "")).strip()
            if not title:
                return self._json({"error": "Titel fehlt"}, 400)
            try:
                return self._json(generate_captions(title))
            except (RuntimeError, ValueError, subprocess.TimeoutExpired) as e:
                return self._json({"error": str(e)}, 500)
        if self.path == "/api/star":
            stars = load_stars()
            name = req.get("video", "")
            if req.get("on"):
                stars.add(name)
            else:
                stars.discard(name)
            save_stars(stars)
            return self._json(list_state())
        if self.path == "/api/discard":
            try:
                video = safe_child(VIDEO_DIR, req.get("video", ""))
            except FileNotFoundError:
                return self._json({"error": "Video nicht gefunden"}, 400)
            category = req.get("category", "aussortiert")
            if category not in ("aussortiert", "privat", "never-give-up"):
                return self._json({"error": f"Unbekannte Kategorie: {category}"}, 400)
            dest_dir = PROCESSED_DIR / category
            dest_dir.mkdir(parents=True, exist_ok=True)
            target = dest_dir / video.name
            n = 1
            while target.exists():
                target = dest_dir / f"{video.stem}-{n}{video.suffix}"
                n += 1
            shutil.move(str(video), str(target))
            unstar(video.name)
            MOVES.append({"src": str(video), "dest": str(target)})
            del MOVES[:-50]
            return self._json(list_state())
        if self.path == "/api/undo":
            while MOVES:
                m = MOVES.pop()
                src, dest = Path(m["src"]), Path(m["dest"])
                if dest.exists() and not src.exists():
                    shutil.move(str(dest), str(src))
                    return self._json({**list_state(), "undone": src.name})
            return self._json({**list_state(), "undone": None})
        if self.path != "/api/render":
            return self.send_error(404)
        try:
            video = safe_child(VIDEO_DIR, req["video"])
        except FileNotFoundError:
            return self._json({"error": "Video nicht gefunden"}, 400)
        gain = float(req.get("gain_db", -12))
        fade_out = float(req.get("fade_out", FADE_OUT))
        trim_start = float(req.get("trim_start") or 0)
        trim_end = float(req["trim_end"]) if req.get("trim_end") else None
        # Text-PNGs (Base64 vom Browser-Canvas) in Temp-Dateien auspacken
        texts = []
        tmp_pngs = []
        for t in (req.get("texts") or []):
            if not (isinstance(t, dict) and t.get("png")
                    and t.get("start") is not None):
                continue
            fd, pth = tempfile.mkstemp(suffix=".png")
            os.write(fd, base64.b64decode(t["png"].split(",", 1)[-1]))
            os.close(fd)
            tmp_pngs.append(pth)
            texts.append({"start": t["start"], "hold": t.get("hold", TEXT_HOLD),
                          "png": pth})
        outros = {}
        for pf, dataurl in (req.get("outros") or {}).items():
            if not dataurl:
                continue
            fd, pth = tempfile.mkstemp(suffix=".png")
            os.write(fd, base64.b64decode(dataurl.split(",", 1)[-1]))
            os.close(fd)
            tmp_pngs.append(pth)
            outros[pf] = Path(pth)
        out_name = re.sub(r"[/\\:\x00-\x1f]+", "-", (req.get("out_name") or "").strip())
        out_name = re.sub(r"\.mp4$", "", out_name, flags=re.I)
        # Nummer + "Pumpfoil-<Jahr>-" automatisch; manuell Getipptes gewinnt
        m = NUM_RE.match(out_name)
        if m:
            num, base = m.group(0), out_name[m.end():]
        else:
            num, base = f"{next_number():03d}-", out_name or video.stem
        if not base.lower().startswith("pumpfoil-"):
            base = name_prefix() + base
        out_name = num + base + ".mp4"
        overlay = None
        if req.get("overlay"):
            try:
                overlay = safe_child(OVERLAY_DIR, req["overlay"])
            except FileNotFoundError:
                return self._json({"error": "Overlay nicht gefunden"}, 400)
        results = {}
        for pf in (*PLATFORMS, "tiktok"):
            rel = (req.get("tracks") or {}).get(pf)
            if not rel and pf != "tiktok":
                continue
            PROGRESS.update(active=True, label=pf, pct=0.0)
            try:
                track = None  # tiktok: ohne Musik, O-Ton pur
                if rel:
                    track = safe_child(MUSIC_DIR, rel)
                    if pf not in track_platforms(Path(rel)):
                        raise ValueError(f"Track liegt nicht in einem für {pf} "
                                         "erlaubten Ordner")
                out = OUT_DIR / pf / out_name
                render(video, track, out, gain, fade_out, overlay,
                       trim_start, trim_end, texts, outros.get(pf))
                results[pf] = {"ok": True, "out": str(out.relative_to(BASE))}
            except subprocess.CalledProcessError as e:
                results[pf] = {"ok": False, "error": (e.stderr or "")[-400:]}
            except (ValueError, FileNotFoundError) as e:
                results[pf] = {"ok": False, "error": str(e)}
        for p in tmp_pngs:
            try:
                os.unlink(p)
            except OSError:
                pass
        PROGRESS.update(active=False, label="", pct=0.0)
        # Quellvideo wegräumen, wenn alle angeforderten Renders geklappt haben
        moved = None
        if results and all(r.get("ok") for r in results.values()):
            PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
            new_base = Path(out_name).stem
            name = (video.name if new_base == video.stem
                    else f"{video.stem}-{new_base}.mp4")
            target = PROCESSED_DIR / name
            n = 1
            while target.exists():
                target = PROCESSED_DIR / f"{Path(name).stem}-{n}.mp4"
                n += 1
            shutil.move(str(video), str(target))
            unstar(video.name)
            moved = str(target.relative_to(BASE))
        self._json({"results": results, "moved": moved})


# ---------------------------------------------------------------- main ------

def main():
    global VIDEO_DIR
    if len(sys.argv) >= 5 and sys.argv[1] == "--render":
        video, track, out = (Path(a) for a in sys.argv[2:5])
        gain = float(sys.argv[5]) if len(sys.argv) > 5 else -12.0
        render(video, track, out, gain)
        print(f"✓ {out}")
        return
    if len(sys.argv) > 1:
        d = Path(sys.argv[1]).expanduser().resolve()
        if not d.is_dir():
            sys.exit(f"Kein Ordner: {d}")
        VIDEO_DIR = d
    for d in (VIDEO_DIR, MUSIC_DIR / "youtube", MUSIC_DIR / "instagram", OUT_DIR):
        d.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Shorts+Musik läuft: http://localhost:{PORT}  (Strg-C zum Beenden)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
