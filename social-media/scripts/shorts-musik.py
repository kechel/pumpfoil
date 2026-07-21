#!/usr/bin/env python3
"""
shorts-musik.py — Musik über fertige Shorts legen, je Plattform eine Variante.

Start:   python3 scripts/shorts-musik.py [video-ordner]   → http://localhost:8765
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
                 "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(
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
                body = PAGE.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif path == "/api/list":
                self._json(list_state())
            elif path == "/api/progress":
                self._json(PROGRESS)
            elif path.startswith("/media/video/"):
                self._file(safe_child(VIDEO_DIR, path[len("/media/video/"):]))
            elif path.startswith("/media/musik/"):
                self._file(safe_child(MUSIC_DIR, path[len("/media/musik/"):]))
            elif path.startswith("/media/out/"):
                self._file(safe_child(OUT_DIR, path[len("/media/out/"):]))
            elif path.startswith("/media/overlay/"):
                self._file(safe_child(OVERLAY_DIR, path[len("/media/overlay/"):]))
            elif path.startswith("/thumb/"):
                video = safe_child(VIDEO_DIR, path[len("/thumb/"):])
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


# ---------------------------------------------------------------- UI --------

PAGE = r"""<!doctype html>
<html lang="de"><head><meta charset="utf-8">
<title>Shorts + Musik</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root{color-scheme:light dark;font-family:-apple-system,system-ui,sans-serif}
  body{margin:0;display:grid;grid-template-columns:290px 1fr 360px;height:100vh}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:14px 12px 6px}
  #dirTitle{text-transform:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #videos,#tracks{display:flex;flex-direction:column;overflow:hidden;border-right:1px solid #8884}
  #tracks{border-right:0;border-left:1px solid #8884}
  #vlist,#tlist{flex:1;overflow-y:auto}
  #dirRow{display:flex;gap:6px;padding:0 12px 8px}
  #dirRow input{flex:1;min-width:0;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit}
  #dirRow button{font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #8886;background:transparent;cursor:pointer}
  #dirRow button:hover{background:#8883}
  #quickRow{display:flex;flex-wrap:wrap;gap:4px;padding:0 12px 8px}
  .chip{font-size:11px;padding:3px 9px;border:1px solid #8886;border-radius:10px;cursor:pointer;background:transparent;color:inherit}
  .chip:hover{background:#8883}
  .chip.on{background:#3b82f6;color:#fff;border-color:#3b82f6}
  #dirBrowser{display:none;max-height:220px;overflow-y:auto;border-bottom:1px solid #8884;background:#8881}
  #dirBrowser .item{padding:5px 12px;font-size:12px}
  #searchRow{padding:8px 12px;border-bottom:1px solid #8882;display:flex;align-items:center;gap:8px}
  #searchRow input[type=search]{flex:1;min-width:0;box-sizing:border-box;font-size:12px;padding:5px 8px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit}
  #searchRow label{font-size:11px;white-space:nowrap;display:flex;align-items:center;gap:3px}
  .item{padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid #8882;word-break:break-word}
  .item:hover{background:#8882}
  .item.active{background:#3b82f633}
  .item.rendering{opacity:.35;pointer-events:none}
  .item.vid .hdr{display:flex;align-items:center;gap:4px}
  .item.vid .vn{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .item.vid .vdur{font-size:11px;opacity:.55;white-space:nowrap}
  .item.vid .thumbs{display:flex;gap:4px;margin-top:5px}
  .item.vid .thumbs img{width:calc(50% - 2px);aspect-ratio:9/16;object-fit:cover;border-radius:6px;background:#0003}
  .vx{border:0;background:transparent;cursor:pointer;opacity:.35;font-size:12px;padding:0 2px}
  .vx:hover{opacity:1}
  .vx.star.on{opacity:1;color:#f59e0b}
  .badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:8px;background:#8883;margin-left:4px}
  .badge.done{background:#22c55e55}
  #center{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:4px;overflow:hidden}
  #stage{display:flex;align-items:center;justify-content:center;gap:18px;max-width:100%;min-height:0}
  #actions{display:flex;flex-direction:column;gap:10px}
  .abtn{display:flex;align-items:center;gap:10px;font-size:14px;padding:12px 18px;border-radius:10px;border:1px solid #8886;background:transparent;color:inherit;cursor:pointer;text-align:left;white-space:nowrap}
  .abtn:hover{background:#8883}
  .abtn svg{width:18px;height:18px;flex:none}
  .abtn.starred{color:#f59e0b;border-color:#f59e0b88}
  .starmark svg{width:11px;height:11px;color:#f59e0b;margin-right:4px;vertical-align:-1px}
  .trk button.play{display:flex;align-items:center;justify-content:center}
  .trk button.play svg{width:11px;height:11px}
  #dirRow button svg{width:14px;height:14px;vertical-align:-2px}
  #dirBrowser .item svg{width:13px;height:13px;margin-right:5px;vertical-align:-2px}
  #aMsg{font-size:11px;opacity:.6;max-width:170px;white-space:pre-wrap}
  #texts{display:flex;flex-direction:column;gap:6px;margin-top:6px;border-top:1px solid #8884;padding-top:10px}
  .txrow{display:flex;align-items:center;gap:5px}
  .txrow textarea{width:110px;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit;resize:vertical;font-family:inherit}
  .txrow .thold{width:42px;font-size:12px;padding:4px 4px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit}
  .txrow .tset{min-width:52px}
  .txov{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;
    font-family:Arial,Helvetica,sans-serif;color:#fff;text-align:center;white-space:pre-line;line-height:1.15;
    text-shadow:0 0 3px rgba(0,0,0,.7),1px 1px 2px rgba(0,0,0,.6);padding:0 8px}
  #vwrap{position:relative;max-width:100%}
  video{max-height:calc(100vh - 40px);max-width:100%;border-radius:12px;background:#000;display:block}
  #pvBar{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.9;max-width:100%}
  #pvBar #vname,#pvBar #pvTrack{opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .mini.sel{background:#3b82f6;color:#fff;border-color:#3b82f6}
  #ovImg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;display:none}
  #outroImg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0}
  #panel select{max-width:180px;font-size:12px;padding:3px 4px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit}
  .mini{font-size:11px;padding:3px 7px;border-radius:6px;border:1px solid #8886;background:transparent;cursor:pointer}
  .mini:hover{background:#8883}
  #selTracks{position:sticky;top:0;z-index:2;background:Canvas;border-bottom:2px solid #3b82f688;box-shadow:0 3px 8px #0003}
  .trk.playing{background:#22c55e2e;font-weight:600}
  .trk.playing button.play{background:#22c55e;color:#fff;border-color:#22c55e}
  #prog{display:none;margin:8px 0}
  #prog .track{height:8px;border-radius:4px;background:#8883;overflow:hidden}
  #prog .fill{height:100%;width:0%;background:#3b82f6;transition:width .3s}
  #prog .txt{font-size:11px;opacity:.7;margin-top:3px}
  .trk{display:flex;align-items:center;gap:6px}
  .trk .name{flex:1;min-width:0}
  .trk button{font-size:11px;padding:3px 7px;border-radius:6px;border:1px solid #8886;background:transparent;cursor:pointer}
  .trk button:hover{background:#8883}
  .trk button.sel{background:#3b82f6;color:#fff;border-color:#3b82f6}
  .trk button.play{width:30px}
  #panel{padding:4px 12px 10px;border-bottom:1px solid #8884;font-size:13px}
  #panel .row{margin:6px 0;display:flex;align-items:center;gap:8px}
  #panel input[type=number]{width:56px;font-size:12px;padding:3px 4px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit}
  #panel input[type=text]{flex:1;min-width:0;font-size:12px;padding:4px 6px;border-radius:6px;border:1px solid #8886;background:transparent;color:inherit}
  #renderBtn{width:100%;padding:10px;font-size:14px;border-radius:8px;border:0;background:#3b82f6;color:#fff;cursor:pointer;margin-top:8px}
  #renderBtn:disabled{opacity:.4;cursor:default}
  #log{font-size:12px;white-space:pre-wrap;opacity:.85;margin-top:8px;max-height:160px;overflow-y:auto}
  .hint{font-size:11px;opacity:.55;margin:4px 12px 10px}
  input[type=range]{flex:1}
  .folder{font-size:10px;opacity:.5}
</style></head><body>
<div id="videos"><h2 id="dirTitle">Shorts</h2>
  <div id="dirRow"><input id="dir" spellcheck="false" title="Ordner mit den Videos"><button id="dirToggle" title="Ordner durchsuchen"></button><button id="dirBtn">Laden</button></div>
  <div id="quickRow"></div>
  <div id="dirBrowser"></div>
  <div id="vlist"></div></div>
<div id="center">
  <div id="stage">
    <div id="vwrap"><video id="vid" controls playsinline loop></video><img id="ovImg" alt=""><img id="outroImg" alt=""></div>
    <div id="actions">
      <button class="abtn" id="aStar"></button>
      <button class="abtn" id="aPrivat"></button>
      <button class="abtn" id="aNgu"></button>
      <button class="abtn" id="aTrash"></button>
      <button class="abtn" id="aUndo"></button>
      <div id="texts"></div>
      <div id="aMsg"></div>
    </div>
  </div>
  <div id="pvBar"><span id="vname"></span>
    <button class="mini" id="pvYT">YT</button><button class="mini" id="pvIG">IG</button><button class="mini" id="pvTT">TT</button>
    <span id="pvTrack">–</span></div>
</div>
<div id="tracks">
  <h2>Musik</h2>
  <div id="panel">
    <div class="row">Musik-Pegel <input type="range" id="gain" min="-30" max="0" step="1" value="-12">
      <span id="gainVal">-12 dB</span></div>
    <div class="row">Fade-out <input type="number" id="fade" min="0" max="15" step="0.5" value="2"> s</div>
    <div class="row"><label><input type="checkbox" id="ovOn" checked> Overlay</label> <select id="ovSel"></select></div>
    <div class="row"><label><input type="checkbox" id="outroOn" checked> Outro-Icons (Like/Follow, letzte 2,5–4 s)</label></div>
    <div class="row">Trim <button class="mini" id="trimStartBtn">[ Start</button><button class="mini" id="trimEndBtn">Ende ]</button><button class="mini" id="trimClrBtn">✕</button> <span id="trimVal" style="opacity:.7">–</span></div>
    <div class="row">Name <span id="nextNum" style="opacity:.6"></span><input type="text" id="outName" placeholder="z.B. sunset-carving" spellcheck="false"></div>
    <button id="renderBtn">Rendern → shorts-mit-musik/</button>
    <div id="prog"><div class="track"><div class="fill" id="progFill"></div></div><div class="txt" id="progTxt"></div></div>
    <div id="log"></div>
  </div>
  <div id="searchRow"><input id="search" type="search" placeholder="Musik durchsuchen …" spellcheck="false">
    <label><input type="checkbox" id="fltYT" checked> YT</label>
    <label><input type="checkbox" id="fltIG" checked> IG</label></div>
  <div id="tlist"></div>
</div>
<audio id="music" loop></audio>
<script>
const $=q=>document.querySelector(q);
const ICONS={
  star:'<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  lock:'<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  dumbbell:'<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  folder:'<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  up:'<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  play:'<polygon points="6 3 20 12 6 21 6 3"/>',
  pause:'<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>'
};
function icon(name,filled){
  return '<svg viewBox="0 0 24 24" '+(filled
    ?'fill="currentColor" stroke="none"'
    :'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')
    +' aria-hidden="true">'+ICONS[name]+'</svg>';
}
const vid=$('#vid'), music=$('#music');
let state=null, curVideo=null, curPlay=null, renderingVideo=null;
const sel={youtube:null, instagram:null};

function db2lin(db){return Math.pow(10,db/20)}
function applyGain(){music.volume=db2lin(+$('#gain').value)}
$('#gain').oninput=()=>{$('#gainVal').textContent=$('#gain').value+' dB';applyGain()};

let browserOpen=false;
function renderOverlays(){
  const sel=$('#ovSel'), prev=sel.value;
  sel.innerHTML='';
  for(const o of state.overlays){
    const opt=document.createElement('option');
    opt.value=o; opt.textContent=o.replace(/\.png$/,'');
    sel.appendChild(opt);
  }
  if(state.overlays.includes(prev)) sel.value=prev;
  else if(state.overlays.includes('youtube-overlay-xxsmall-noshadow-1080x1920.png'))
    sel.value='youtube-overlay-xxsmall-noshadow-1080x1920.png';
  updateOverlayPreview();
}
function updateOverlayPreview(){
  const on=$('#ovOn').checked && $('#ovSel').value;
  $('#ovImg').style.display=on?'block':'none';
  if(on)$('#ovImg').src='/media/overlay/'+encodeURIComponent($('#ovSel').value);
}
$('#ovOn').onchange=updateOverlayPreview;
$('#ovSel').onchange=()=>{if($('#ovSel').value)$('#ovOn').checked=true;updateOverlayPreview()};
function applyState(){
  renderVideoList(); renderTrackList(); renderBrowser(); renderOverlays(); updatePvBar();
  if(document.activeElement!==$('#dir'))$('#dir').value=state.video_dir;
  $('#dirTitle').textContent=state.video_dir.split('/').pop()||'/';
  $('#quickRow').innerHTML='';
  for(const q of state.quick_dirs||[]){
    const c=document.createElement('button');
    c.className='chip'+(q.dir===state.video_dir?' on':'');
    c.textContent=q.label; c.title=q.dir;
    c.onclick=()=>setDir(q.dir);
    $('#quickRow').appendChild(c);
  }
  $('#nextNum').textContent=String(state.next_number).padStart(3,'0')+'-'+state.name_prefix;
  if((!curVideo||!state.videos.includes(curVideo)) && state.videos.length) pickVideo(state.videos[0]);
}
async function load(){
  state=await (await fetch('/api/list')).json();
  applyState();
}
async function setDir(dir){
  const r=await fetch('/api/setdir',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({dir})});
  const d=await r.json();
  if(d.error){$('#log').textContent=d.error;return}
  state=d; curVideo=null; stopMusic(); applyState();
}
function renderBrowser(){
  const el=$('#dirBrowser');
  el.style.display=browserOpen?'block':'none';
  if(!browserOpen||!state)return;
  el.innerHTML='';
  const mk=(ic,label,dir)=>{
    const d=document.createElement('div');d.className='item';
    d.innerHTML=icon(ic);
    d.appendChild(document.createTextNode(' '+label));
    d.onclick=()=>setDir(dir);el.appendChild(d);
  };
  if(state.parent!==state.video_dir) mk('up','..', state.parent);
  for(const s of state.subdirs)
    mk('folder',s.name+(s.mp4s?'  ('+s.mp4s+')':''), state.video_dir+'/'+s.name);
  if(!state.subdirs.length){
    const d=document.createElement('div');d.className='item';
    d.style.opacity=.5;d.style.cursor='default';d.textContent='keine Unterordner';
    el.appendChild(d);
  }
}
$('#dirToggle').onclick=()=>{browserOpen=!browserOpen;renderBrowser()};
$('#search').addEventListener('input',renderTrackList);
$('#fltYT').onchange=renderTrackList;
$('#fltIG').onchange=renderTrackList;
let trimStart=null, trimEnd=null;
function updateTrim(){
  $('#trimVal').textContent=(trimStart==null&&trimEnd==null)?'–':
    (trimStart!=null?trimStart.toFixed(1)+'s':'0s')+' → '+(trimEnd!=null?trimEnd.toFixed(1)+'s':'Ende');
}
$('#trimStartBtn').onclick=()=>{trimStart=vid.currentTime;if(trimEnd!=null&&trimEnd<=trimStart)trimEnd=null;updateTrim();renderTrackList()};
$('#trimEndBtn').onclick=()=>{trimEnd=vid.currentTime;if(trimStart!=null&&trimStart>=trimEnd)trimStart=null;updateTrim();renderTrackList()};
$('#trimClrBtn').onclick=()=>{trimStart=trimEnd=null;updateTrim();renderTrackList()};
vid.addEventListener('loadedmetadata',renderTrackList);
$('#dirBtn').onclick=()=>setDir($('#dir').value);
$('#dir').addEventListener('keydown',e=>{if(e.key==='Enter')$('#dirBtn').click()});
function sortedVids(){
  const starred=new Set(state.stars||[]);
  return [...state.videos].sort((a,b)=>(starred.has(b)-starred.has(a))||a.localeCompare(b));
}
function renderVideoList(){
  $('#vlist').innerHTML='';
  const starred=new Set(state.stars||[]);
  const vids=sortedVids();
  for(const v of vids){
    const d=document.createElement('div');
    d.className='item vid'+(v===curVideo?' active':'')+(v===renderingVideo?' rendering':'');
    const hdr=document.createElement('div');hdr.className='hdr';
    const n=document.createElement('span');n.className='vn';
    if(starred.has(v)){
      const s=document.createElement('span');s.className='starmark';
      s.innerHTML=icon('star',true);n.appendChild(s);
    }
    n.appendChild(document.createTextNode(v.replace(/\.mp4$/,'')));
    for(const pf of state.rendered[v]||[]){
      const b=document.createElement('span');b.className='badge done';
      b.textContent={youtube:'YT',instagram:'IG',tiktok:'TT'}[pf]||pf;n.appendChild(b);
    }
    hdr.appendChild(n);
    const du=state.vdurs&&state.vdurs[v];
    if(du!=null){
      const dd=document.createElement('span');dd.className='vdur';
      const s=Math.round(du);
      dd.textContent=s<60?s+'s':Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
      hdr.appendChild(dd);
    }
    d.appendChild(hdr);
    const th=document.createElement('div');th.className='thumbs';
    for(const t of [1,5]){
      const im=document.createElement('img');
      im.loading='lazy';im.alt='';
      im.src='/thumb/'+encodeURIComponent(v)+'?t='+t;
      im.onerror=()=>{im.style.display='none'};
      th.appendChild(im);
    }
    d.appendChild(th);
    d.onclick=()=>pickVideo(v);
    $('#vlist').appendChild(d);
  }
}
async function toggleStar(v,on){
  const r=await fetch('/api/star',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({video:v,on})});
  state=await r.json(); applyState();
}
$('#aPrivat').innerHTML=icon('lock')+'<span>privat</span>';
$('#aNgu').innerHTML=icon('dumbbell')+'<span>never-give-up</span>';
$('#aTrash').innerHTML=icon('trash')+'<span>aussortieren</span>';
$('#aUndo').innerHTML=icon('undo')+'<span>rückgängig</span>';
$('#dirToggle').innerHTML=icon('folder');
// --- Text-Overlays: Zeiten/Texte je Video, Vorschau mit Render-Fadekurve ---
const TXF=0.5, TXH=2.0, TXS=60, TXN=6;  // fade / hold / fontsize / Slots
const texts=Array.from({length:TXN},()=>({start:null,text:'',hold:TXH}));
for(let i=0;i<TXN;i++){
  const row=document.createElement('div');row.className='txrow';row.dataset.i=i;
  row.innerHTML='<button class="mini tset" title="Startzeit = aktuelle Videoposition">@ –</button>'+
    '<textarea class="txt" rows="2" placeholder="Text …" spellcheck="false"></textarea>'+
    '<input type="number" class="thold" min="0" max="60" step="1" value="'+TXH+'" title="Anzeigedauer in Sekunden (ohne Ein-/Ausblenden)">'+
    '<button class="mini tclr" title="löschen">✕</button>';
  $('#texts').appendChild(row);
  const ov=document.createElement('div');ov.className='txov';ov.id='txov'+i;
  $('#vwrap').appendChild(ov);
}
function renderTextRows(){
  document.querySelectorAll('.txrow').forEach(row=>{
    const i=+row.dataset.i;
    row.querySelector('.tset').textContent='@ '+(texts[i].start==null?'–':texts[i].start.toFixed(1)+'s');
    if(row.querySelector('.txt').value!==texts[i].text)row.querySelector('.txt').value=texts[i].text;
    if(+row.querySelector('.thold').value!==texts[i].hold)row.querySelector('.thold').value=texts[i].hold;
  });
}
document.querySelectorAll('.txrow').forEach(row=>{
  const i=+row.dataset.i;
  row.querySelector('.tset').onclick=()=>{texts[i].start=vid.currentTime;renderTextRows()};
  row.querySelector('.txt').addEventListener('input',e=>{texts[i].text=e.target.value});
  row.querySelector('.thold').addEventListener('input',e=>{texts[i].hold=Math.max(0,+e.target.value||0)});
  row.querySelector('.tclr').onclick=()=>{texts[i]={start:null,text:'',hold:TXH};renderTextRows()};
});
let lastT=0;
function updateTextPreview(){
  const scale=vid.videoWidth?vid.clientWidth/vid.videoWidth:1;
  const t=vid.currentTime;
  // Trim-Loop: am Trim-Ende (bzw. nach nativem Loop auf 0) zurück zum Trim-Start
  if(!vid.paused){
    if(trimEnd!=null&&t>=trimEnd)vid.currentTime=trimStart||0;
    else if(trimStart&&t<trimStart&&lastT>t+1)vid.currentTime=trimStart;
  }
  lastT=t;
  for(let i=0;i<TXN;i++){
    const el=$('#txov'+i), tx=texts[i];
    if(tx.start==null||!tx.text.trim()){el.style.opacity=0;continue}
    const e=tx.start+2*TXF+(tx.hold??TXH);
    const a=Math.max(0,Math.min(Math.min((t-tx.start)/TXF,(e-t)/TXF),1));
    el.textContent=tx.text;
    el.style.fontSize=(TXS*scale)+'px';
    el.style.opacity=a;
  }
  // Outro-Icon-Vorschau (Plattform gemäß YT/IG-Umschalter, trim-bewusst)
  const oi=$('#outroImg'), dur=vid.duration;
  if($('#outroOn').checked&&isFinite(dur)&&dur>0){
    const end=trimEnd!=null?trimEnd:dur;
    const secs=(end-(trimStart||0))>20?4:2.5;
    const st=Math.max(trimStart||0,end-secs);
    const a=Math.max(0,Math.min((t-st)/TXF,1));
    const key=pvPlatform+'|'+vid.videoWidth;
    if(a>0&&oi.dataset.key!==key){oi.src=outroPng(pvPlatform);oi.dataset.key=key}
    oi.style.opacity=a;
  }else oi.style.opacity=0;
}
(function txLoop(){updateTextPreview();requestAnimationFrame(txLoop)})();
// --- Outro-Icons je Plattform (Canvas, Lucide-Pfade) ---
const OPATHS={
  thumbsup:'M7 10v12M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z',
  bell:'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0',
  heart:'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z',
  comment:'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
  send:'m22 2-7 20-4-9-9-4ZM22 2 11 13',
  bookmark:'m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z',
  repost:'m17 2 4 4-4 4M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4M21 13v1a4 4 0 0 1-4 4H3'
};
const OUTROS={
  youtube:[['thumbsup','Like'],['bell','Abonnieren']],
  instagram:[['heart','Like'],['comment','Kommentar'],['send','Teilen'],['bookmark','Speichern']],
  tiktok:[['heart','Like'],['comment','Kommentar'],['repost','Repost'],['send','Teilen']]
};
function outroPng(pf){
  const w=vid.videoWidth||1080, h=vid.videoHeight||1920;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');
  const items=OUTROS[pf], size=110, gap=54;
  const total=items.length*size+(items.length-1)*gap;
  let x=(w-total)/2; const y=h*0.68;
  g.strokeStyle='#fff';
  g.shadowColor='rgba(0,0,0,0.7)';g.shadowBlur=8;g.shadowOffsetX=2;g.shadowOffsetY=2;
  g.lineCap='round';g.lineJoin='round';
  for(const [ic] of items){
    g.save();g.translate(x,y);g.scale(size/24,size/24);g.lineWidth=2;
    g.stroke(new Path2D(OPATHS[ic]));g.restore();
    x+=size+gap;
  }
  return c.toDataURL('image/png');
}
function textPng(tx){
  // Text (inkl. Emojis) auf transparentes Canvas in Videogröße rendern —
  // Look muss zur .txov-Vorschau passen (Arial, weiß, Schatten, zentriert)
  const w=vid.videoWidth||1080, h=vid.videoHeight||1920;
  const c=document.createElement('canvas');c.width=w;c.height=h;
  const g=c.getContext('2d');
  g.font=TXS+'px Arial';g.textAlign='center';g.textBaseline='middle';
  g.fillStyle='#fff';
  g.shadowColor='rgba(0,0,0,0.7)';g.shadowBlur=6;g.shadowOffsetX=2;g.shadowOffsetY=2;
  const lines=tx.text.split('\n'), lh=TXS*1.15;
  const y0=h/2-(lines.length-1)/2*lh;
  lines.forEach((ln,i)=>g.fillText(ln,w/2,y0+i*lh));
  return c.toDataURL('image/png');
}
$('#aStar').onclick=()=>{if(curVideo)toggleStar(curVideo,!(state.stars||[]).includes(curVideo))};
$('#aPrivat').onclick=()=>{if(curVideo)discard(curVideo,'privat')};
$('#aNgu').onclick=()=>{if(curVideo)discard(curVideo,'never-give-up')};
$('#aTrash').onclick=()=>{if(curVideo)discard(curVideo,'aussortiert')};
$('#aUndo').onclick=async()=>{
  const r=await fetch('/api/undo',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  const d=await r.json();
  const u=d.undone; delete d.undone;
  state=d; applyState();
  $('#aMsg').textContent=u?('wiederhergestellt: '+u):'nichts rückgängig zu machen';
  if(u&&state.videos.includes(u))pickVideo(u);
};
async function discard(v,category){
  const order=sortedVids(), idx=order.indexOf(v);
  const r=await fetch('/api/discard',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({video:v,category})});
  const d=await r.json();
  if(d.error){$('#log').textContent=d.error;return}
  state=d;
  // nächstes Video in der Listenreihenfolge auswählen (sonst das davor)
  let next=null;
  for(let i=idx+1;i<order.length;i++) if(state.videos.includes(order[i])){next=order[i];break}
  if(!next) for(let i=idx-1;i>=0;i--) if(state.videos.includes(order[i])){next=order[i];break}
  if(curVideo===v)curVideo=null;
  if(next&&!curVideo)pickVideo(next);
  applyState();
}
let playTimer=null, allowPlay=0;
function pickVideo(v){
  curVideo=v;
  vid.pause();
  vid.src='/media/video/'+encodeURIComponent(v);
  clearTimeout(playTimer);
  // Wächter: bis der Timer abläuft, wird JEDES Play sofort wieder pausiert
  allowPlay=performance.now()+950;
  playTimer=setTimeout(()=>{if(curVideo===v){allowPlay=0;vid.play().catch(()=>{})}},1000);
  $('#vname').textContent=v; stopMusic(); renderVideoList();
  // Trim/Texte/Name/Musikwahl bleiben absichtlich stehen (Korrektur-Workflow);
  // Reset = Seite neu laden
  updatePvBar();
}
function stopMusic(){music.pause();curPlay=null;renderTrackList()}
function effLen(){
  const end=trimEnd!=null?trimEnd:(isFinite(vid.duration)?vid.duration:null);
  if(end==null)return null;
  return end-(trimStart!=null?trimStart:0);
}
function buildTrackRow(t,tooShort){
  const row=document.createElement('div');
  row.className='item trk'+(curPlay===t.rel?' playing':'');
  const play=document.createElement('button');play.className='play';
  play.innerHTML=icon(curPlay===t.rel?'pause':'play',true);
  play.onclick=()=>togglePlay(t);
  const name=document.createElement('div');name.className='name';
  name.innerHTML=t.rel.split('/').pop().replace(/\.[^.]+$/,'')+
    ' <span class="folder">'+t.folder+(t.dur?' · '+Math.round(t.dur)+'s':'')+'</span>'+
    (tooShort?' <span title="kürzer als das Video — wird beim Rendern geloopt">⚠️</span>':'');
  row.append(play,name);
  for(const pf of t.platforms){
    const b=document.createElement('button');
    b.textContent=pf==='youtube'?'YT':'IG';
    if(sel[pf]===t.rel)b.classList.add('sel');
    b.onclick=()=>{
      const selecting=sel[pf]!==t.rel;
      sel[pf]=selecting?t.rel:null;
      if(selecting){
        (pf==='youtube'?$('#fltYT'):$('#fltIG')).checked=false;
        if(!$('#fltYT').checked&&!$('#fltIG').checked){$('#fltYT').checked=true;$('#fltIG').checked=true}
      }
      renderTrackList();updatePvBar()};
    row.appendChild(b);
  }
  return row;
}
function renderTrackList(){
  $('#tlist').innerHTML='';
  const q=$('#search').value.trim().toLowerCase();
  const want=[];
  if($('#fltYT').checked)want.push('youtube');
  if($('#fltIG').checked)want.push('instagram');
  const len=effLen();
  const isSel=t=>sel.youtube===t.rel||sel.instagram===t.rel;
  const tooShort=t=>!!(t.dur&&len&&t.dur<len-0.5);
  // zugeordnete Tracks: immer ganz oben und sticky beim Scrollen
  const selWrap=document.createElement('div');selWrap.id='selTracks';
  for(const t of state.tracks)
    if(isSel(t))selWrap.appendChild(buildTrackRow(t,tooShort(t)));
  if(selWrap.children.length)$('#tlist').appendChild(selWrap);
  for(const t of state.tracks){
    if(isSel(t)) continue;
    if(q && !t.rel.toLowerCase().includes(q)) continue;
    if(!t.platforms.some(p=>want.includes(p))) continue;
    if(tooShort(t)) continue;
    $('#tlist').appendChild(buildTrackRow(t,false));
  }
}
function togglePlay(t){
  if(curPlay===t.rel){stopMusic();return}
  curPlay=t.rel; music.src='/media/musik/'+t.rel.split('/').map(encodeURIComponent).join('/');
  applyGain(); music.play();
  if(vid.src){allowPlay=0;vid.currentTime=trimStart||0;vid.muted=false;vid.play()}
  renderTrackList();
}
let pvPlatform='youtube';
function updatePvBar(){
  $('#pvYT').classList.toggle('sel',pvPlatform==='youtube');
  $('#pvIG').classList.toggle('sel',pvPlatform==='instagram');
  $('#pvTT').classList.toggle('sel',pvPlatform==='tiktok');
  const t=sel[pvPlatform];
  $('#pvTrack').textContent=pvPlatform==='tiktok'?'O-Ton, ohne Musik'
    :(t?t.split('/').pop().replace(/\.[^.]+$/,''):'–');
  const isSt=curVideo&&(state.stars||[]).includes(curVideo);
  $('#aStar').innerHTML=icon('star',!!isSt)+'<span>'+(isSt?'gemerkt':'merken')+'</span>';
  $('#aStar').classList.toggle('starred',!!isSt);
  const ready=curVideo&&sel.youtube&&sel.instagram&&$('#outName').value.trim();
  $('#renderBtn').disabled=!ready;
  $('#renderBtn').title=ready?'':'Erst Name eintragen und für YouTube und Instagram je einen Track wählen';
}
$('#outName').addEventListener('input',updatePvBar);
function playSelected(pf){
  pvPlatform=pf;
  const rel=sel[pf];
  if(pf==='tiktok'||!rel){
    stopMusic();
    if(pf==='tiktok'&&vid.src){allowPlay=0;vid.currentTime=trimStart||0;vid.muted=false;vid.play()}
    updatePvBar();return
  }
  curPlay=rel;
  music.src='/media/musik/'+rel.split('/').map(encodeURIComponent).join('/');
  applyGain(); music.play();
  if(vid.src){allowPlay=0;vid.currentTime=trimStart||0;vid.muted=false;vid.play()}
  renderTrackList(); updatePvBar();
}
$('#pvYT').onclick=()=>playSelected('youtube');
$('#pvIG').onclick=()=>playSelected('instagram');
$('#pvTT').onclick=()=>playSelected('tiktok');
vid.addEventListener('play',()=>{
  if(performance.now()<allowPlay){vid.pause();return}
  if(curPlay&&music.paused)music.play()
});
vid.addEventListener('pause',()=>music.pause());
vid.addEventListener('seeked',()=>{if(curPlay&&music.duration)music.currentTime=Math.max(0,vid.currentTime-(trimStart||0))%music.duration});
$('#renderBtn').onclick=async()=>{
  if(!curVideo||!sel.youtube||!sel.instagram){$('#log').textContent='Erst Video + je einen Track für YouTube und Instagram wählen.';return}
  $('#renderBtn').disabled=true;$('#log').textContent='Rendere …';
  stopMusic(); vid.pause();
  renderingVideo=curVideo; renderVideoList();
  $('#prog').style.display='block';$('#progFill').style.width='0%';$('#progTxt').textContent='';
  const iv=setInterval(async()=>{
    try{
      const p=await(await fetch('/api/progress')).json();
      if(p.active){
        $('#progFill').style.width=p.pct.toFixed(0)+'%';
        $('#progTxt').textContent=({youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok'}[p.label]||p.label)+' '+p.pct.toFixed(0)+' %';
      }
    }catch(e){}
  },400);
  try{
    const r=await(await fetch('/api/render',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({video:curVideo,tracks:sel,gain_db:+$('#gain').value,fade_out:+$('#fade').value,
        overlay:($('#ovOn').checked&&$('#ovSel').value)||null,
        trim_start:trimStart,trim_end:trimEnd,out_name:$('#outName').value,
        texts:texts.filter(t=>t.text.trim()&&t.start!=null)
          .map(t=>({start:t.start,hold:t.hold,png:textPng(t)})),
        outros:$('#outroOn').checked
          ?{youtube:outroPng('youtube'),instagram:outroPng('instagram'),tiktok:outroPng('tiktok')}
          :null})})).json();
    const errs=Object.entries(r.results).filter(([,res])=>!res.ok);
    $('#log').textContent=errs.map(([pf,res])=>'✗ '+pf+': '+res.error).join('\n');
    // verwendeten Namen (inkl. Nummer) behalten → erneutes Rendern
    // überschreibt gezielt dieselben Dateien statt neu zu nummerieren
    const first=Object.values(r.results).find(res=>res.ok&&res.out);
    if(first)$('#outName').value=first.out.split('/').pop().replace(/\.mp4$/,'');
  }catch(e){$('#log').textContent='Fehler: '+e}
  clearInterval(iv);$('#prog').style.display='none';
  renderingVideo=null;
  updatePvBar(); load();
};
load();
</script></body></html>"""


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
