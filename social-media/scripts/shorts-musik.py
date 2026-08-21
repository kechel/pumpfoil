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
import http.client
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
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
CLAUDE_MODEL = "claude-opus-5"  # Modell für Titel/Captions (statt CLI-Default)
CAPTION_LANGS = ["de", "en", "fr", "it", "es", "fi", "nl", "cs",
                 "pt", "ja", "zh", "ru", "id", "pl", "ar", "vi", "tr", "th"]
# Instagram/TikTok bekommen zu Deutsch+Englisch eine dritte Sprache — zufällig
# gezogen, damit über die Videos hinweg gestreut wird. Auswahl nach den Ländern,
# die in den Statistiken tatsächlich auftauchen (PL/FR/CZ/IT auf Facebook,
# ID/PT/ES auf YouTube).
EXTRA_LANGS = {"pl": "Polnisch", "fr": "Französisch", "it": "Italienisch",
               "cs": "Tschechisch", "es": "Spanisch", "id": "Indonesisch",
               "pt": "brasilianisches Portugiesisch", "ar": "Arabisch",
               "vi": "Vietnamesisch", "tr": "Türkisch", "th": "Thai"}
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
LAST_RENDER_FILE = BASE / ".shorts-last-render.json"  # für „letzten Render zurückholen"
CAPTIONS_CACHE_FILE = BASE / ".captions-cache.json"  # generierte Titel/Captions je Export-Name
YT_BATCH_CACHE_FILE = BASE / ".yt-batch-cache.json"  # Caption-Cache des Kanal-Batches (je Video-ID)
YT_BATCH_PROGRESS_FILE = BASE / ".yt-batch-progress.json"  # dort stehen die YT-Titel zu den IDs
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


def _load_json(p: Path, default):
    try:
        return json.loads(p.read_text())
    except (OSError, ValueError):
        return default


def save_captions_cache(name: str, caps: dict):
    cache = _load_json(CAPTIONS_CACHE_FILE, {})
    cache[name] = caps
    CAPTIONS_CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False))


def bilibili_text(caps: dict) -> dict:
    """Titel + Beschreibung für bilibili.tv (ein Feld, keine Lokalisierungen).
    Englisch führt (Verkehrssprache der internationalen Plattform), danach
    Indonesisch und Thai — die beiden SEA-Kernmärkte von bilibili.tv.
    Die laufende Nummer fliegt raus, die ist nur unsere interne Buchführung."""
    t = (caps.get("titles") or {})
    d = (caps.get("descriptions") or {})
    titel = re.sub(r"^-?\d{1,3}\s+[Pp]umpfoil\s+\d{4}\s*", "", t.get("en") or t.get("de") or "")
    titel = (titel[:70].rstrip() + " | Pumpfoil") if titel else "Pumpfoil"
    boiler = _load_json(YT_BOILERPLATE_FILE, {}).get("en", "")
    teile = [d.get("en"), d.get("id"), d.get("th"),
             str(caps.get("hashtags", "")).strip(), boiler]
    text = "\n\n".join(x.strip() for x in teile if x and x.strip())
    if len(text) > 2000:                      # hartes Limit des Upload-Formulars
        ohne = "\n\n".join(x.strip() for x in teile[:-1] if x and x.strip())
        text = ohne if len(ohne) <= 2000 else ohne[:1997] + "…"
    return {"title": titel, "description": text, "chars": len(text)}


def cached_captions(name: str) -> dict:
    """Gecachte Captions zu einem Export: erst UI-Cache (per Name), sonst
    YT-Batch-Cache — Zuordnung über die laufende Nummer im YT-Titel."""
    cache = _load_json(CAPTIONS_CACHE_FILE, {})
    if name in cache:
        return {"cached": cache[name], "source": "ui",
                "bilibili": bilibili_text(cache[name])}
    m = NUM_RE.match(name)
    if m:
        progress = _load_json(YT_BATCH_PROGRESS_FILE, {})
        batch = _load_json(YT_BATCH_CACHE_FILE, {})
        for vid, entry in progress.items():
            if str(entry.get("title", "")).startswith(m.group(1) + " ") and vid in batch:
                return {"cached": batch[vid], "source": "yt-batch",
                        "yt_title": entry["title"],
                        "bilibili": bilibili_text(batch[vid])}
    return {"cached": None}


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


def _vol_expr(windows, key, offset, dur, fade=0.5):
    """ffmpeg-volume-Ausdruck für Pegel-Abschnitte: je Fenster ±dB, weich mit
    0,5-s-Rampen ein-/ausgeblendet. Zeiten beziehen sich aufs Original;
    offset = Trim-Start. Leerer String = keine wirksamen Fenster."""
    parts = []
    for w in windows or []:
        try:
            db = float(w.get(key, 0) or 0)
            # offene Grenzen: ohne Start ab 0, ohne Ende bis zum Videoende
            a = (float(w["start"]) - offset) if w.get("start") is not None else 0.0
            b = (float(w["end"]) - offset) if w.get("end") is not None else dur + fade
        except (TypeError, ValueError):
            continue
        if db == 0 or b <= a or b <= 0 or a >= dur:
            continue
        g = 10 ** (db / 20)
        parts.append(f"(1+({g - 1:.6f})*min(max((t-{a:.3f})/{fade},0),1)"
                     f"*min(max(({b:.3f}+{fade}-t)/{fade},0),1))")
    return "*".join(parts)


def render(video: Path, track: Path, out: Path, gain_db: float,
           fade_out: float = FADE_OUT, overlay: Path = None,
           trim_start: float = 0.0, trim_end: float = None,
           texts: list = None, outro: Path = None,
           overlay_alpha: float = 1.0,
           oton_gain_db: float = 0.0, ducks: list = None):
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
    # Pegel-Abschnitte (ducks) senken/heben Musik bzw. O-Ton zeitweise um ±dB
    duck_music = _vol_expr(ducks, "music_db", start, dur)
    duck_oton = _vol_expr(ducks, "oton_db", start, dur)
    oton_parts = []
    if abs(oton_gain_db) >= 0.01:
        oton_parts.append(f"volume={oton_gain_db}dB")
    if duck_oton:
        oton_parts.append(f"volume=volume='{duck_oton}':eval=frame")
    oton = ",".join(oton_parts)
    if track is not None:
        inputs += ["-stream_loop", "-1", "-i", str(track)]
        n_inputs += 1
        music = f"volume={gain_db}dB,"
        if duck_music:
            music += f"volume=volume='{duck_music}':eval=frame,"
        music += (
            f"afade=t=in:d={min(FADE_IN, dur / 4):.3f},"
            f"afade=t=out:st={dur - fade_out:.3f}:d={fade_out:.3f}"
        )
        if has_audio(video):
            osrc = "[0:a]"
            if oton:
                fc_parts.append(f"[0:a]{oton}[oa]")
                osrc = "[oa]"
            fc_parts.append(f"[1:a]{music}[m];"
                            f"{osrc}[m]amix=inputs=2:duration=first:normalize=0[a]")
        else:
            fc_parts.append(f"[1:a]{music}[a]")
        amap = ["-map", "[a]"]
        acodec = ["-c:a", "aac", "-b:a", "192k"]
    elif has_audio(video):
        if oton:
            fc_parts.append(f"[0:a]{oton}[a]")
            amap = ["-map", "[a]"]
            acodec = ["-c:a", "aac", "-b:a", "192k"]
        else:
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
        alpha = max(0.0, min(float(overlay_alpha), 1.0))
        fade_ov = (f",colorchannelmixer=aa={alpha:.3f}" if alpha < 1 else "")
        fc_parts.append(f"[{ov_idx}:v]format=rgba{fade_ov},scale={w}:{h}[ov];"
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


# Pixabay-Dateinamen enden auf die Track-ID ("…-bang-a-bop-298556.mp3").
# Die hängen wir an den Videonamen → bei Content-ID-Claims steht der
# Lizenznachweis direkt im Dateinamen (und damit in jedem Upload).
PIXABAY_ID_RE = re.compile(r"-(\d{4,})$")


def pixabay_ids(rels) -> list:
    ids = []
    for rel in rels:
        if not rel:
            continue
        p = Path(str(rel))
        if not any(part.lower() == "pixabay" for part in p.parts[:-1]):
            continue
        m = PIXABAY_ID_RE.search(p.stem)
        if m and m.group(1) not in ids:
            ids.append(m.group(1))
    return ids


# 900+ ist reserviert für Sonderformate (Stories, Zusammenschnitte, Tests):
# solche Dateien zählen bei der laufenden Nummerierung NICHT mit.
SPECIAL_FROM = 900


def next_number():
    """Höchste Short-Nummer über alle relevanten Ordner + 1 (fortlaufend)."""
    n = 0
    for d in (BASE / "shorts-fertig", OUT_DIR / "youtube",
              OUT_DIR / "instagram", OUT_DIR / "tiktok"):
        if d.is_dir():
            for p in d.iterdir():
                m = NUM_RE.match(p.name)
                if m and int(m.group(1)) < SPECIAL_FROM:
                    n = max(n, int(m.group(1)))
    # Fallback: verschobene Quellvideos heißen <orig>-NNN-<name>.mp4
    if PROCESSED_DIR.is_dir():
        for p in PROCESSED_DIR.iterdir():
            m = re.search(r"-(\d{1,3})-", p.name)
            if m and int(m.group(1)) < SPECIAL_FROM:
                n = max(n, int(m.group(1)))
    return n + 1


def track_platforms(rel: Path):
    # Lizenz-Ordner sind hart plattformgebunden; freie Musik (Pixabay, CC …)
    # ist überall erlaubt — auf YouTube mit Content-ID-Restrisiko (UI warnt).
    top = rel.parts[0] if len(rel.parts) > 1 else ""
    if top == "youtube":
        return ["youtube"]
    if top == "instagram":
        return ["instagram"]
    return ["youtube", "instagram", "tiktok"]


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


# ------------------------------------------------------------ YouTube -------
# Stufe A: Titel-Lokalisierungen auf manuell hochgeladene Videos schreiben.
# OAuth (Desktop-Flow mit PKCE) + Data-API komplett über die Stdlib.

YT_CLIENT_SECRET_FILE = BASE / ".yt-client-secret.json"
YT_TOKEN_FILE = BASE / ".yt-token.json"
YT_SCOPES = ("https://www.googleapis.com/auth/youtube "
             "https://www.googleapis.com/auth/youtube.upload")
YT_PENDING = {}  # state → code_verifier des laufenden Login-Flows
# unsere Sprachcodes → YouTube-BCP-47 (zh braucht die Region)
YT_LANG = {"de": "de", "en": "en", "fr": "fr", "it": "it", "es": "es",
           "fi": "fi", "nl": "nl", "cs": "cs", "pt": "pt",
           "ja": "ja", "zh": "zh-CN", "ru": "ru", "id": "id", "pl": "pl",
           "ar": "ar", "vi": "vi", "tr": "tr", "th": "th"}
YT_ID_RE = re.compile(
    r"(?:youtu\.be/|watch\?v=|/shorts/|studio\.youtube\.com/video/|^)"
    r"([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])")
# Standard-Block, der an jede Video-Beschreibung angehängt wird (13 Sprachen)
YT_BOILERPLATE_FILE = Path(__file__).resolve().parent / "yt-boilerplate.json"


def _http_json(url, data=None, method=None, headers=None, form=False):
    hdrs = {"Content-Type":
            "application/x-www-form-urlencoded" if form else "application/json"}
    if headers:
        hdrs.update(headers)
    body = None
    if isinstance(data, dict):
        body = (urllib.parse.urlencode(data) if form else json.dumps(data)).encode()
    req = urllib.request.Request(url, data=body, headers=hdrs,
                                 method=method or ("POST" if body else "GET"))
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:400]}")


def yt_client():
    d = json.loads(YT_CLIENT_SECRET_FILE.read_text())
    return d.get("installed") or d.get("web")


def yt_login_start():
    c = yt_client()
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(16)
    YT_PENDING[state] = verifier
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": c["client_id"],
        "redirect_uri": f"http://localhost:{PORT}/api/yt/callback",
        "response_type": "code",
        "scope": YT_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })
    subprocess.run(["open", url], check=False)


def yt_login_finish(code, state):
    verifier = YT_PENDING.pop(state, None)
    if verifier is None:
        raise RuntimeError("Unbekannter oder abgelaufener OAuth-State")
    c = yt_client()
    tok = _http_json("https://oauth2.googleapis.com/token", {
        "client_id": c["client_id"], "client_secret": c["client_secret"],
        "code": code, "code_verifier": verifier,
        "redirect_uri": f"http://localhost:{PORT}/api/yt/callback",
        "grant_type": "authorization_code",
    }, form=True)
    tok["expires_at"] = time.time() + tok.get("expires_in", 3600)
    YT_TOKEN_FILE.write_text(json.dumps(tok))


def yt_access_token():
    tok = json.loads(YT_TOKEN_FILE.read_text())
    if tok.get("expires_at", 0) < time.time() + 60:
        c = yt_client()
        new = _http_json("https://oauth2.googleapis.com/token", {
            "client_id": c["client_id"], "client_secret": c["client_secret"],
            "refresh_token": tok["refresh_token"],
            "grant_type": "refresh_token",
        }, form=True)
        tok["access_token"] = new["access_token"]
        tok["expires_at"] = time.time() + new.get("expires_in", 3600)
        YT_TOKEN_FILE.write_text(json.dumps(tok))
    return tok["access_token"]


def yt_compose_description(lang: str, descriptions: dict, hashtags: str = "",
                           fallback: str = "", boiler: dict = None) -> str:
    """Video-Beschreibung je Sprache: Kurztext + Hashtags + Standard-Block."""
    if boiler is None:
        boiler = _load_json(YT_BOILERPLATE_FILE, {})
    parts = [p.strip() for p in ((descriptions or {}).get(lang) or fallback,
                                 hashtags, boiler.get(lang, "")) if p and p.strip()]
    return "\n\n".join(parts)


def yt_localize(video_url: str, titles: dict, descriptions: dict,
                hashtags: str = "", fallback_description: str = ""):
    m = YT_ID_RE.search(video_url.strip())
    if not m:
        raise RuntimeError("Keine Video-ID im Link gefunden")
    vid = m.group(1)
    boiler = _load_json(YT_BOILERPLATE_FILE, {})

    def compose(lang: str) -> str:
        return yt_compose_description(lang, descriptions, hashtags,
                                      fallback_description, boiler)

    auth = {"Authorization": f"Bearer {yt_access_token()}"}
    data = _http_json(
        "https://www.googleapis.com/youtube/v3/videos"
        "?part=snippet,localizations&id=" + vid, headers=auth)
    items = data.get("items") or []
    if not items:
        raise RuntimeError("Video nicht gefunden — gehört es zum verbundenen Kanal?")
    snippet = items[0]["snippet"]
    loc = items[0].get("localizations", {})
    default_lang = (snippet.get("defaultLanguage") or "de").split("-")[0]
    snippet["defaultLanguage"] = snippet.get("defaultLanguage") or "de"
    # Haupt-Titel + Haupt-Beschreibung (Default-Sprache, i.d.R. de) ebenfalls setzen
    main_title = str((titles or {}).get(default_lang, "")).strip()
    if main_title:
        snippet["title"] = main_title[:100]
    main = compose(default_lang)
    if main:
        snippet["description"] = main
    written = []
    for lang, title in titles.items():
        code = YT_LANG.get(lang)
        if not code or code == default_lang or not str(title).strip():
            continue
        loc[code] = {"title": str(title)[:100], "description": compose(lang)}
        written.append(code)
    _http_json("https://www.googleapis.com/youtube/v3/videos"
               "?part=snippet,localizations",
               {"id": vid, "snippet": snippet, "localizations": loc},
               method="PUT", headers=auth)
    return {"ok": True, "video_id": vid, "written": written,
            "default": snippet["defaultLanguage"]}


# --------------------------------------------------- Upload (Stufe B) -------
# YouTube: Upload als geplantes Video (privat + publishAt) über die
# Resumable-Upload-API. Achtung: solange das Google-Cloud-Projekt den
# API-Audit nicht bestanden hat, sperrt YouTube API-Uploads auf "privat".

UPLOADS_STATE_FILE = BASE / ".uploads-state.json"  # Upload-Status je Export/Plattform
UPLOAD_PROGRESS = {"active": False, "label": "", "sent": 0, "total": 0}


def _put_with_progress(url: str, path: Path, headers: dict, label: str) -> str:
    """Datei per PUT hochladen, blockweise, mit Fortschritt in UPLOAD_PROGRESS."""
    u = urllib.parse.urlparse(url)
    cls = http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection
    conn = cls(u.netloc, timeout=600)
    size = path.stat().st_size
    try:
        conn.putrequest("PUT", u.path + (f"?{u.query}" if u.query else ""))
        for k, v in {**headers, "Content-Length": str(size)}.items():
            conn.putheader(k, v)
        conn.endheaders()
        sent = 0
        with path.open("rb") as f:
            while chunk := f.read(1024 * 1024):
                conn.send(chunk)
                sent += len(chunk)
                UPLOAD_PROGRESS.update(active=True, label=label,
                                       sent=sent, total=size)
        resp = conn.getresponse()
        body = resp.read().decode()
        if resp.status >= 300:
            raise RuntimeError(f"HTTP {resp.status}: {body[:400]}")
        return body
    finally:
        conn.close()
        UPLOAD_PROGRESS.update(active=False, label="", sent=0, total=0)


def uploads_state() -> dict:
    return _load_json(UPLOADS_STATE_FILE, {})


def save_upload_state(name: str, platform: str, info: dict):
    st = uploads_state()
    st.setdefault(name, {})[platform] = info
    UPLOADS_STATE_FILE.write_text(json.dumps(st, ensure_ascii=False, indent=1))


def yt_upload(path: Path, titles: dict, descriptions: dict, hashtags: str = "",
              publish_at: str = "", fallback_title: str = "",
              privacy: str = "private"):
    """Video zu YouTube hochladen: privat + publishAt = geplantes Video,
    Titel/Beschreibungen aller Sprachen kommen direkt mit."""
    boiler = _load_json(YT_BOILERPLATE_FILE, {})
    main_title = str((titles or {}).get("de") or fallback_title).strip()[:100]
    if not main_title:
        raise RuntimeError("Kein Titel vorhanden — erst Captions generieren")
    snippet = {"title": main_title, "defaultLanguage": "de",
               "description": yt_compose_description("de", descriptions,
                                                     hashtags, boiler=boiler)}
    status = {"privacyStatus": privacy, "selfDeclaredMadeForKids": False}
    if publish_at:
        status["publishAt"] = publish_at
    loc = {}
    for lang, title in (titles or {}).items():
        code = YT_LANG.get(lang)
        if not code or code == "de" or not str(title).strip():
            continue
        loc[code] = {"title": str(title)[:100],
                     "description": yt_compose_description(
                         lang, descriptions, hashtags, boiler=boiler)}
    meta = {"snippet": snippet, "status": status}
    if loc:
        meta["localizations"] = loc
    auth = {"Authorization": f"Bearer {yt_access_token()}"}
    body = json.dumps(meta).encode()
    req = urllib.request.Request(
        "https://www.googleapis.com/upload/youtube/v3/videos"
        "?uploadType=resumable&part=snippet,status,localizations",
        data=body, method="POST",
        headers={**auth, "Content-Type": "application/json; charset=UTF-8",
                 "X-Upload-Content-Type": "video/mp4",
                 "X-Upload-Content-Length": str(path.stat().st_size)})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            upload_url = r.headers["Location"]
    except urllib.error.HTTPError as e:
        raise RuntimeError(f"HTTP {e.code}: {e.read().decode()[:400]}")
    d = json.loads(_put_with_progress(
        upload_url, path, {**auth, "Content-Type": "video/mp4"}, "youtube"))
    return {"video_id": d["id"], "yt_status": d.get("status", {}),
            "written": sorted(loc)}


# ------------------------------------------------------------- TikTok -------
# Content Posting API, Modus "Upload in die Inbox": das Video landet als
# Entwurf in Jans TikTok-App (Benachrichtigung), Feinschliff + Posten manuell.
# OAuth: TikTok verlangt eine HTTPS-Redirect-URI → pumpfoil.org/tiktok-oauth
# reicht den Code an das lokale Studio weiter (bzw. Jan kopiert die URL).

TT_CLIENT_FILE = BASE / ".tiktok-client.json"
TT_TOKEN_FILE = BASE / ".tiktok-token.json"
TT_REDIRECT = "https://pumpfoil.org/tiktok-oauth"
TT_SCOPES = "user.info.basic,user.info.profile,user.info.stats,video.upload,video.list"


def tt_client():
    return json.loads(TT_CLIENT_FILE.read_text())


def tt_save_token(tok: dict):
    tok["expires_at"] = time.time() + tok.get("expires_in", 86400)
    TT_TOKEN_FILE.write_text(json.dumps(tok))


def tt_login_start():
    c = tt_client()
    url = "https://www.tiktok.com/v2/auth/authorize/?" + urllib.parse.urlencode({
        "client_key": c["client_key"], "response_type": "code",
        "scope": c.get("scopes") or TT_SCOPES, "redirect_uri": TT_REDIRECT,
        "state": secrets.token_urlsafe(16)})
    subprocess.run(["open", url], check=False)


def tt_exchange_code(code: str):
    c = tt_client()
    tok = _http_json("https://open.tiktokapis.com/v2/oauth/token/", {
        "client_key": c["client_key"], "client_secret": c["client_secret"],
        "code": code, "grant_type": "authorization_code",
        "redirect_uri": TT_REDIRECT}, form=True)
    if "access_token" not in tok:
        raise RuntimeError(f"TikTok-Login fehlgeschlagen: {json.dumps(tok)[:300]}")
    tt_save_token(tok)


def tt_access_token():
    tok = json.loads(TT_TOKEN_FILE.read_text())
    if tok.get("expires_at", 0) < time.time() + 60:
        c = tt_client()
        new = _http_json("https://open.tiktokapis.com/v2/oauth/token/", {
            "client_key": c["client_key"], "client_secret": c["client_secret"],
            "grant_type": "refresh_token",
            "refresh_token": tok["refresh_token"]}, form=True)
        if "access_token" not in new:
            raise RuntimeError("TikTok-Token abgelaufen — bitte neu verbinden "
                               f"({json.dumps(new)[:200]})")
        tok.update(new)
        tt_save_token(tok)
    return tok["access_token"]


def tt_videos(limit: int = 200) -> list:
    """Schon gepostete TikToks inkl. Aufrufzahlen (braucht den Scope video.list)."""
    fields = ("id,title,video_description,create_time,view_count,like_count,"
              "comment_count,share_count")
    auth = {"Authorization": f"Bearer {tt_access_token()}"}
    out, cursor = [], None
    while len(out) < limit:
        body = {"max_count": 20}
        if cursor:
            body["cursor"] = cursor
        d = _http_json(f"https://open.tiktokapis.com/v2/video/list/?fields={fields}",
                       body, headers=auth)
        err = (d.get("error") or {}).get("code")
        if err and err not in ("ok", ""):
            raise RuntimeError(f"TikTok: {err} — "
                               f"{str((d.get('error') or {}).get('message'))[:150]}")
        data = d.get("data") or {}
        out += data.get("videos") or []
        cursor = data.get("cursor")
        if not data.get("has_more") or not cursor:
            break
    return out[:limit]


def tt_upload_draft(path: Path):
    """Video als Entwurf in die TikTok-Inbox laden (ein Chunk, Dateien < 64 MB)."""
    size = path.stat().st_size
    auth = {"Authorization": f"Bearer {tt_access_token()}"}
    init = _http_json(
        "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
        {"source_info": {"source": "FILE_UPLOAD", "video_size": size,
                         "chunk_size": size, "total_chunk_count": 1}},
        headers=auth)
    err = init.get("error") or {}
    if err.get("code") not in (None, "", "ok"):
        raise RuntimeError(f"TikTok init: {err.get('code')} — "
                           f"{str(err.get('message', ''))[:200]}")
    data = init.get("data") or {}
    _put_with_progress(data["upload_url"], path,
                       {"Content-Type": "video/mp4",
                        "Content-Range": f"bytes 0-{size - 1}/{size}"},
                       "tiktok")
    return {"publish_id": data.get("publish_id")}


# Die Pixabay-ID hängt am Dateinamen je Plattform (nur die dort verwendete),
# die Dateien eines Renders heißen also nicht überall gleich. Für Gruppierung
# und alle Endpunkte zählt der Name OHNE Lizenz-Suffix.
PIXABAY_SUFFIX_RE = re.compile(r"(?:-pixabay-\d+)+$")


def export_key(name: str) -> str:
    return PIXABAY_SUFFIX_RE.sub("", Path(name).stem)


def export_file(pf: str, name: str):
    """Datei einer Plattform zu einem (Basis-)Namen finden."""
    d = OUT_DIR / pf
    p = d / Path(name).name
    if p.is_file():
        return p
    key = export_key(name)
    for q in d.glob(f"{key}*.mp4"):
        if export_key(q.name) == key:
            return q
    return None


# ---------------------------------------------------------- Instagram ------
# Instagram-Business-Login (eigene App, Entwicklungsmodus reicht für eigene
# Konten). Redirect läuft über pumpfoil.org/meta-oauth, weil Meta HTTPS
# verlangt. Kurzlebiges Token wird direkt gegen ein 60-Tage-Token getauscht.

META_CLIENT_FILE = BASE / ".meta-client.json"
META_TOKEN_FILE = BASE / ".meta-token.json"
META_REDIRECT = "https://pumpfoil.org/meta-oauth"
GRAPH = "https://graph.facebook.com/v25.0"
# Facebook-Login: Seiten-Scopes. Die Instagram-Scopes (instagram_basic,
# instagram_content_publish) kennt die App erst, wenn der Instagram-Teil auf
# „API-Setup mit Facebook-Login" umgestellt ist — sonst lehnt Meta den ganzen
# Login mit „Invalid Scopes" ab. Über "scopes" in .meta-client.json ergänzbar.
FB_SCOPES = "pages_show_list,pages_read_engagement,pages_manage_posts"
# Instagram-Login (Fallback, nur IG — braucht eine Instagram-Tester-Rolle)
IG_SCOPES = "instagram_business_basic,instagram_business_content_publish"


def meta_client():
    return _load_json(META_CLIENT_FILE, {})


def meta_mode() -> str:
    """'fb' = Facebook-Login (Seite + Instagram), 'ig' = nur Instagram."""
    return "fb" if meta_client().get("app_id") else "ig"


def meta_login_start():
    c = meta_client()
    if meta_mode() == "fb":
        url = "https://www.facebook.com/v25.0/dialog/oauth?" + urllib.parse.urlencode({
            "client_id": c["app_id"], "redirect_uri": META_REDIRECT,
            "response_type": "code", "scope": c.get("scopes") or FB_SCOPES})
    else:
        url = "https://www.instagram.com/oauth/authorize?" + urllib.parse.urlencode({
            "force_reauth": "true", "client_id": c["ig_app_id"],
            "redirect_uri": META_REDIRECT, "response_type": "code",
            "scope": IG_SCOPES})
    subprocess.run(["open", url], check=False)


def meta_exchange_code(code: str):
    c = meta_client()
    if meta_mode() == "fb":
        short = _http_json(f"{GRAPH}/oauth/access_token?" + urllib.parse.urlencode({
            "client_id": c["app_id"], "client_secret": c["app_secret"],
            "redirect_uri": META_REDIRECT, "code": code}))
        if "access_token" not in short:
            raise RuntimeError(f"Facebook-Login fehlgeschlagen: {json.dumps(short)[:300]}")
        # kurzlebig → langlebig (60 Tage)
        long = _http_json(f"{GRAPH}/oauth/access_token?" + urllib.parse.urlencode({
            "grant_type": "fb_exchange_token", "client_id": c["app_id"],
            "client_secret": c["app_secret"],
            "fb_exchange_token": short["access_token"]}))
        tok = {"mode": "fb",
               "access_token": long.get("access_token", short["access_token"]),
               "expires_at": time.time() + long.get("expires_in", 5184000)}
    else:
        short = _http_json("https://api.instagram.com/oauth/access_token", {
            "client_id": c["ig_app_id"], "client_secret": c["ig_app_secret"],
            "grant_type": "authorization_code", "redirect_uri": META_REDIRECT,
            "code": code}, form=True)
        if "access_token" not in short:
            raise RuntimeError(f"Instagram-Login fehlgeschlagen: {json.dumps(short)[:300]}")
        long = _http_json("https://graph.instagram.com/access_token?"
                          + urllib.parse.urlencode({
                              "grant_type": "ig_exchange_token",
                              "client_secret": c["ig_app_secret"],
                              "access_token": short["access_token"]}))
        tok = {"mode": "ig",
               "access_token": long.get("access_token", short["access_token"]),
               "user_id": short.get("user_id"),
               "expires_at": time.time() + long.get("expires_in", 3600)}
    META_TOKEN_FILE.write_text(json.dumps(tok))
    return tok


def meta_access_token():
    # System-User-Token (aus den Unternehmenseinstellungen) hat Vorrang: läuft
    # nicht ab und braucht keinen Login-Dialog
    sys_token = meta_client().get("system_user_token")
    if sys_token:
        return sys_token
    tok = json.loads(META_TOKEN_FILE.read_text())
    # IG-Tokens lassen sich verlängern; FB-Langzeit-Tokens hält Meta selbst frisch
    if tok.get("mode") != "fb" and tok.get("expires_at", 0) < time.time() + 7 * 86400:
        try:
            new = _http_json("https://graph.instagram.com/refresh_access_token?"
                             + urllib.parse.urlencode({
                                 "grant_type": "ig_refresh_token",
                                 "access_token": tok["access_token"]}))
            if new.get("access_token"):
                tok.update(access_token=new["access_token"],
                           expires_at=time.time() + new.get("expires_in", 5184000))
                META_TOKEN_FILE.write_text(json.dumps(tok))
        except RuntimeError:
            pass  # abgelaufen → der eigentliche Call meldet es
    return tok["access_token"]


def _graph_all(url: str, limit: int) -> list:
    out = []
    while url and len(out) < limit:
        d = _http_json(url)
        out += d.get("data") or []
        url = (d.get("paging") or {}).get("next")
    return out[:limit]


def fb_page():
    """Erste Facebook-Seite des Kontos inkl. Seiten-Token + IG-Konto-ID."""
    tok = meta_access_token()
    pages = _http_json(f"{GRAPH}/me/accounts?fields=id,name,access_token,"
                       f"instagram_business_account&access_token={tok}")
    items = pages.get("data") or []
    if not items:
        raise RuntimeError("Keine Facebook-Seite gefunden — hat der Login "
                           "pages_show_list bekommen?")
    return items[0]


def ig_media(limit: int = 200) -> list:
    """Bereits gepostete Instagram-Medien (für den Abgleich mit den Renders)."""
    fields = "id,caption,media_type,timestamp,permalink"
    if meta_mode() == "fb":
        page = fb_page()
        ig = (page.get("instagram_business_account") or {}).get("id")
        if not ig:
            raise RuntimeError(f"Seite {page.get('name')!r} ist mit keinem "
                               "Instagram-Business-Konto verknüpft")
        return _graph_all(f"{GRAPH}/{ig}/media?fields={fields}&limit=100"
                          f"&access_token={page['access_token']}", limit)
    return _graph_all("https://graph.instagram.com/me/media"
                      f"?fields={fields}&limit=100"
                      f"&access_token={meta_access_token()}", limit)


def fb_videos(limit: int = 200) -> list:
    """Bereits gepostete Videos/Reels der Facebook-Seite."""
    page = fb_page()
    return _graph_all(f"{GRAPH}/{page['id']}/videos?fields="
                      "id,title,description,created_time,permalink_url"
                      f"&limit=100&access_token={page['access_token']}", limit)


# ------------------------------------------------- Reichweite & Lücken -----
# „Was lief gut und fehlt noch auf Facebook/Instagram?" — YouTube liefert die
# Abrufzahlen, Meta die schon geposteten Beiträge. Zuordnung über die laufende
# Nummer im Titel bzw. Textähnlichkeit zu den gecachten Captions.

COVERAGE_CACHE = {"at": 0.0, "data": None}
NUM_TITLE_RE = re.compile(r"^(\d{1,3})\s+[Pp]umpfoil")


def _caption_words() -> dict:
    """Nummer → Wortmenge aus YT-Titel und gecachten Captions."""
    def words(s):
        return {w for w in re.sub(r"[^a-zäöüß0-9]+", " ", (s or "").lower()).split()
                if len(w) > 3}

    batch = _load_json(YT_BATCH_CACHE_FILE, {})
    out = {}
    for vid, e in _load_json(YT_BATCH_PROGRESS_FILE, {}).items():
        m = NUM_TITLE_RE.match(str(e.get("title", "")))
        if m:
            c = batch.get(vid) or {}
            out.setdefault(int(m.group(1)), set()).update(
                words(e["title"]) | words(c.get("instagram")))
    for name, c in _load_json(CAPTIONS_CACHE_FILE, {}).items():
        m = NUM_RE.match(name)
        if m:
            out.setdefault(int(m.group(1)), set()).update(
                words(c.get("instagram")) | words(c.get("tiktok")))
    return out


def _posted_numbers(items, key, texts) -> dict:
    """Video-Nummer → Beitrag (Zuordnung über Nummer im Text oder Ähnlichkeit)."""
    def words(s):
        return {w for w in re.sub(r"[^a-zäöüß0-9]+", " ", (s or "").lower()).split()
                if len(w) > 3}

    found = {}
    for it in items:
        t = (it.get(key) or "").strip()
        m = NUM_TITLE_RE.match(t)
        if m:
            found.setdefault(int(m.group(1)), it)
            continue
        w = words(t)
        best, score = None, 0.0
        for n, cw in texts.items():
            if w and cw:
                s = len(w & cw) / min(len(w), len(cw))
                if s > score:
                    best, score = n, s
        if score >= 0.35:
            found.setdefault(best, it)
    return found


def ig_view_count(post) -> int:
    """Views aus den mitgelieferten Insights (0, wenn die Berechtigung fehlt)."""
    for e in ((post.get("insights") or {}).get("data") or []):
        vals = e.get("values") or []
        if vals:
            return int(vals[0].get("value") or 0)
    return 0


def yt_numbered_stats() -> dict:
    """Nummer → Titel/Views/Likes aller Kanalvideos im Nummernschema."""
    auth = {"Authorization": f"Bearer {yt_access_token()}"}
    ch = _http_json("https://www.googleapis.com/youtube/v3/channels"
                    "?part=contentDetails&mine=true", headers=auth)
    up = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    ids, page = {}, ""
    while True:
        d = _http_json("https://www.googleapis.com/youtube/v3/playlistItems"
                       f"?part=snippet&maxResults=50&playlistId={up}"
                       + (f"&pageToken={page}" if page else ""), headers=auth)
        for it in d["items"]:
            m = NUM_TITLE_RE.match(it["snippet"]["title"])
            if m:
                ids[it["snippet"]["resourceId"]["videoId"]] = (int(m.group(1)),
                                                               it["snippet"]["title"])
        page = d.get("nextPageToken", "")
        if not page:
            break
    out, keys = {}, list(ids)
    for i in range(0, len(keys), 50):
        d = _http_json("https://www.googleapis.com/youtube/v3/videos?part=statistics&id="
                       + ",".join(keys[i:i + 50]), headers=auth)
        for it in d["items"]:
            n, title = ids[it["id"]]
            s = it["statistics"]
            out[n] = {"n": n, "title": title, "video_id": it["id"],
                      "views": int(s.get("viewCount", 0)),
                      "likes": int(s.get("likeCount", 0))}
    return out


YT_NUMBERS_CACHE = {"at": 0.0, "data": None}


def yt_numbers(force: bool = False) -> list:
    """Video-Nummern, die schon auf dem Kanal liegen — auch die von Hand
    hochgeladenen. Nur die Playlist, ohne Statistiken (schnell)."""
    if (not force and YT_NUMBERS_CACHE["data"] is not None
            and time.time() - YT_NUMBERS_CACHE["at"] < 900):
        return YT_NUMBERS_CACHE["data"]
    auth = {"Authorization": f"Bearer {yt_access_token()}"}
    ch = _http_json("https://www.googleapis.com/youtube/v3/channels"
                    "?part=contentDetails&mine=true", headers=auth)
    up = ch["items"][0]["contentDetails"]["relatedPlaylists"]["uploads"]
    nums, page = set(), ""
    while True:
        d = _http_json("https://www.googleapis.com/youtube/v3/playlistItems"
                       f"?part=snippet&maxResults=50&playlistId={up}"
                       + (f"&pageToken={page}" if page else ""), headers=auth)
        for it in d["items"]:
            m = NUM_TITLE_RE.match(it["snippet"]["title"])
            if m:
                nums.add(int(m.group(1)))
        page = d.get("nextPageToken", "")
        if not page:
            break
    out = sorted(nums)
    YT_NUMBERS_CACHE.update(at=time.time(), data=out)
    return out


def coverage(force: bool = False) -> dict:
    if not force and COVERAGE_CACHE["data"] and time.time() - COVERAGE_CACHE["at"] < 900:
        return COVERAGE_CACHE["data"]
    videos = yt_numbered_stats()
    texts = _caption_words()
    on_fb, on_ig, note = {}, {}, ""
    try:
        tok = meta_access_token()
        pid = meta_client().get("page_id")
        pg = _http_json(f"{GRAPH}/{pid}?fields=access_token,instagram_business_account"
                        f"&access_token={tok}")
        pt = pg["access_token"]
        # "views" gibt es ohne read_insights, "post_views" ebenfalls
        on_fb = _posted_numbers(
            _graph_all(f"{GRAPH}/{pid}/video_reels?fields=id,description,views"
                       f"&limit=100&access_token={pt}", 500), "description", texts)
        ig = (pg.get("instagram_business_account") or {}).get("id")
        if ig:
            # insights.metric(views) direkt mitziehen — ?ids=… ist ab v26 weg
            fields = "id,caption,like_count,comments_count,insights.metric(views)"
            try:
                media = _graph_all(f"{GRAPH}/{ig}/media?fields={fields}&limit=100"
                                   f"&access_token={pt}", 500)
            except RuntimeError:  # ohne instagram_manage_insights
                media = _graph_all(f"{GRAPH}/{ig}/media?fields=id,caption,like_count,"
                                   f"comments_count&limit=100&access_token={pt}", 500)
            on_ig = _posted_numbers(media, "caption", texts)
            blank = sum(1 for m in media if not (m.get("caption") or "").strip())
            if blank:
                note = (f"{blank} der {len(media)} Instagram-Posts haben keine Caption "
                        "(aus der Zeit vor dem Tool) → für die kann die IG-Spalte "
                        "nichts erkennen; sie sind vermutlich trotzdem gepostet.")
    except (RuntimeError, OSError, ValueError, KeyError) as e:
        note = f"Meta nicht erreichbar: {str(e)[:120]}"
    on_tt = {}
    try:
        on_tt = _posted_numbers(tt_videos(), "video_description", texts)
    except (RuntimeError, OSError, ValueError, KeyError) as e:
        note += (" · " if note else "") + f"TikTok: {str(e)[:110]}"
    rows = sorted(videos.values(), key=lambda v: -v["views"])
    for v in rows:
        fb, ig_post, tt = on_fb.get(v["n"]), on_ig.get(v["n"]), on_tt.get(v["n"])
        v["fb"] = bool(fb)
        v["ig"] = bool(ig_post)
        v["tt"] = bool(tt)
        v["fb_views"] = int(fb.get("views") or 0) if fb else None
        v["ig_likes"] = int(ig_post.get("like_count") or 0) if ig_post else None
        v["ig_views"] = (ig_view_count(ig_post) or None) if ig_post else None
        v["tt_views"] = (int(tt.get("view_count") or 0) or None) if tt else None
    views = sorted(v["views"] for v in rows) or [0]
    fbv = [v["fb_views"] for v in rows if v.get("fb_views")]
    igv = [v["ig_views"] for v in rows if v.get("ig_views")]
    ttv = [v["tt_views"] for v in rows if v.get("tt_views")]
    data = {"videos": rows, "median": views[len(views) // 2], "note": note,
            "counts": {"total": len(rows), "fb": len(on_fb), "ig": len(on_ig),
                       "tt": len(on_tt), "tt_views_total": sum(ttv),
                       "tt_views_median": sorted(ttv)[len(ttv) // 2] if ttv else 0,
                       "fb_views_total": sum(fbv),
                       "fb_views_median": sorted(fbv)[len(fbv) // 2] if fbv else 0,
                       "ig_views_total": sum(igv),
                       "ig_views_median": sorted(igv)[len(igv) // 2] if igv else 0,
                       "yt_views_total": sum(v["views"] for v in rows)},
            "at": time.time()}
    COVERAGE_CACHE.update(at=time.time(), data=data)
    return data


def cover_image(path: Path, t: float) -> Path:
    """Cover fuer Plattformen, die Querformat verlangen (bilibili: min. 1152x648):
    1920x1080, Hochkant-Bild mittig, Hintergrund derselbe Frame unscharf."""
    key = f"{path.name}-{t:.1f}".replace("/", "_")
    out = Path(tempfile.gettempdir()) / f"cover-{abs(hash(key))}.jpg"
    if not out.exists():
        vf = ("[0:v]split=2[bg][fg];"
              "[bg]scale=1920:1080:force_original_aspect_ratio=increase,"
              "crop=1920:1080,boxblur=30:4,eq=brightness=-0.06[b];"
              "[fg]scale=-2:1080[f];[b][f]overlay=(W-w)/2:0")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", f"{t:.2f}", "-i", str(path),
                        "-frames:v", "1", "-filter_complex", vf, "-q:v", "2", str(out)],
                       check=True)
    return out


def exports_state():
    """Fertige Renders, gruppiert über die drei Plattform-Ordner."""
    groups = {}
    for pf in (*PLATFORMS, "tiktok"):
        d = OUT_DIR / pf
        if not d.is_dir():
            continue
        for p in d.glob("*.mp4"):
            key = export_key(p.name)
            g = groups.setdefault(key, {"name": key + ".mp4", "platforms": [],
                                        "mtime": 0, "sizes": {}, "files": {}})
            g["platforms"].append(pf)
            g["files"][pf] = p.name
            g["mtime"] = max(g["mtime"], p.stat().st_mtime)
            g["sizes"][pf] = p.stat().st_size
    # frueher 100 — reichte bei 146 Videos nicht mehr, aeltere fielen aus der Liste
    result = sorted(groups.values(), key=lambda g: -g["mtime"])[:500]
    for g in result:
        stem = Path(g["name"]).stem
        src = next(PROCESSED_DIR.glob(f"*-{stem}.mp4"), None)
        g["source"] = src.name if src else None
        first = OUT_DIR / g["platforms"][0] / g["files"][g["platforms"][0]]
        g["duration"] = track_duration(first)
    return result


def title_prefix(name: str) -> str:
    """'097-Pumpfoil-2026-…' → '097 Pumpfoil 2026' (bisheriges Titel-Schema)."""
    m = re.match(r"^(\d+)-([Pp]umpfoil)-(\d{4})-", name)
    return f"{m.group(1)} Pumpfoil {m.group(3)}" if m else ""


def caption_prompt(title: str, prefix: str = "", extra_lang: str = "") -> str:
    prefix_rule = (f'\n- JEDER Titel beginnt exakt mit "{prefix} " (unübersetzt), '
                   f'danach folgt der übersetzte Titel.' if prefix else "")
    extra = EXTRA_LANGS.get(extra_lang, "")
    extra_ig = (f", danach 1 Satz auf {extra} (dieselbe Aussage, keine Übersetzung "
                "Wort für Wort)" if extra else "")
    extra_tt = f" + 1 kurzer Satz auf {extra}" if extra else ""
    return f"""Du bist Social-Media-Redakteur für pumpfoil.org (Pumpfoiling/Dockstart-Wassersport, Tracking-App).
Für ein kurzes Hochkant-Video (YouTube Short / Instagram Reel / TikTok) mit dem Arbeitstitel "{title}" erzeuge Metadaten.

Antworte AUSSCHLIESSLICH mit gültigem JSON (kein Markdown, keine Code-Fences) in exakt dieser Struktur:
{{"titles": {{{", ".join(f'"{lang}": "..."' for lang in CAPTION_LANGS)}}},
 "descriptions": {{...gleiche Sprachen wie titles...}},
 "hashtags": "...", "instagram": "...", "tiktok": "..."}}

Fachbegriffe (WICHTIG, häufige Fehlerquelle):
- Die Tragfläche unter Wasser heißt "foil" / "hydrofoil" (de: "Foil", "Tragfläche").
  Das Wort "wing" ALLEIN ist verboten — im Foilsport ist der "Wing" das Segel in
  der Luft (Wingfoiling), also eine ANDERE Sportart. Statt "the wing breaches"
  also "the foil breaches" / "the front wing breaches".
- Erlaubt und korrekt sind nur die zusammengesetzten Begriffe "front wing"
  (de: "Frontflügel") und "back wing"/"stabilizer" (de: "Stabi") — dort immer mit
  dem Zusatz "front"/"back", nie verkürzt auf "wing".
- Hashtags mit "wing" sind verboten (#wingfoil, #wing…, #wingdesign): Pumpfoiling
  wird ohne Segel gefahren, solche Tags erreichen das falsche Publikum.
  Richtig sind z. B. #pumpfoil, #hydrofoil, #frontwing, #dockstart.

Regeln:
- titles: knackiger Video-Titel je Sprache, max. 80 Zeichen. pt = brasilianisches Portugiesisch, zh = vereinfachtes Chinesisch, id = Bahasa Indonesia.{prefix_rule}
- descriptions: 1-2 lockere, videospezifische Sätze je Sprache (gleiche Sprachcodes wie titles), passende Emojis erlaubt, KEINE Hashtags darin.
- hashtags: EINE Zeile mit 4-6 Hashtags: #pumpfoil zuerst, danach NUR individuelle, zum konkreten Videoinhalt passende Tags. KEINE generischen Standard-Tags wie #pumpfoiling, #dockstart oder #foil.
- instagram: lockere Caption, 1-2 Sätze Deutsch + 1-2 Sätze Englisch mit passenden Emojis{extra_ig}, Leerzeile, dann 8-12 Hashtags (#pumpfoil zuerst, Rest videospezifisch — nicht #pumpfoiling/#dockstart/#foil).
- tiktok: 1 kurzer englischer Satz (+ optional deutsch){extra_tt}, 4-6 Hashtags (#pumpfoil + videospezifische, keine generischen Standard-Tags).
"""


def generate_captions(title: str, prefix: str = "", extra_lang: str = None) -> dict:
    # dritte Sprache für Instagram/TikTok zufällig ziehen (streut über die Videos)
    if extra_lang is None:
        extra_lang = secrets.choice(sorted(EXTRA_LANGS))
    env = {"HOME": str(Path.home()),
           "USER": Path.home().name,  # ohne USER findet die CLI ihre Keychain-Anmeldung nicht
           "PATH": "/opt/homebrew/bin:/usr/bin:/bin:" + str(Path.home() / ".local/bin")}
    proc = subprocess.run([CLAUDE_BIN, "--model", CLAUDE_MODEL, "-p",
                           caption_prompt(title, prefix, extra_lang)],
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
        # pumpfoil.org/tiktok-oauth darf den Login-Code direkt herreichen
        self.send_header("Access-Control-Allow-Origin", "https://pumpfoil.org")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # CORS-Preflight für die tiktok-oauth-Weiterleitung
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "https://pumpfoil.org")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _file(self, path: Path, download_name: str = ""):
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
        if download_name:
            self.send_header("Content-Disposition",
                             f'attachment; filename="{download_name}"')
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
            elif path == "/api/captions_cache":
                self._json(cached_captions(query.get("name", [""])[0]))
            elif path == "/api/uploads":
                self._json({"state": uploads_state()})
            elif path == "/api/tiktok/status":
                self._json({"configured": TT_CLIENT_FILE.is_file(),
                            "authorized": TT_TOKEN_FILE.is_file()})
            elif path == "/api/meta/status":
                c = meta_client()
                self._json({"configured": bool(c.get("app_id") or c.get("ig_app_id")),
                            "authorized": bool(c.get("system_user_token"))
                            or META_TOKEN_FILE.is_file(),
                            "mode": meta_mode()})
            elif path == "/api/yt/numbers":
                try:
                    self._json({"numbers": yt_numbers()})
                except (RuntimeError, OSError, ValueError, KeyError) as e:
                    self._json({"numbers": [], "error": str(e)})
            elif path == "/api/coverage":
                try:
                    self._json(coverage(force=query.get("refresh", [""])[0] == "1"))
                except (RuntimeError, OSError, ValueError, KeyError) as e:
                    self._json({"error": str(e)}, 500)
            elif path == "/api/meta/media":
                try:
                    self._json({"instagram": ig_media(),
                                "facebook": fb_videos() if meta_mode() == "fb" else []})
                except (RuntimeError, OSError, ValueError, KeyError) as e:
                    self._json({"error": str(e)}, 500)
            elif path == "/api/upload/progress":
                self._json(UPLOAD_PROGRESS)
            elif path == "/api/yt/status":
                self._json({"configured": YT_CLIENT_SECRET_FILE.is_file(),
                            "authorized": YT_TOKEN_FILE.is_file()})
            elif path == "/api/yt/callback":
                try:
                    yt_login_finish(query.get("code", [""])[0],
                                    query.get("state", [""])[0])
                    msg = "✅ YouTube verbunden — dieses Fenster kann zu."
                except RuntimeError as e:
                    msg = f"❌ Login fehlgeschlagen: {e}"
                body = (f"<html><body style='font-family:sans-serif;padding:40px'>"
                        f"<h2>{msg}</h2></body></html>").encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif path.startswith("/media/video/"):
                self._file(safe_child(VIDEO_DIR, path[len("/media/video/"):]))
            elif path.startswith("/media/musik/"):
                self._file(safe_child(MUSIC_DIR, path[len("/media/musik/"):]))
            elif path.startswith("/media/out/"):
                self._file(safe_child(OUT_DIR, path[len("/media/out/"):]))
            elif path.startswith("/media/overlay/"):
                self._file(safe_child(OVERLAY_DIR, path[len("/media/overlay/"):]))
            elif path.startswith("/cover/"):
                name = Path(path[len("/cover/"):]).name
                pf = (query.get("base", ["instagram"])[0] or "instagram")
                src = export_file(pf if pf in (*PLATFORMS, "tiktok") else "instagram", name)
                if src is None:
                    raise FileNotFoundError(name)
                t = float(query.get("t", ["1"])[0])
                # Dateiname fuer den Download: Videotitel + Zeitpunkt
                dl = f"{export_key(name)}-cover-{t:.0f}s.jpg"
                self._file(cover_image(src, t), download_name=dl)
            elif path.startswith("/thumb/"):
                name = path[len("/thumb/"):]
                base_q = query.get("base", [""])[0]
                if base_q.startswith("out:") and base_q[4:] in (*PLATFORMS, "tiktok"):
                    video = export_file(base_q[4:], Path(name).name)
                    if video is None:
                        raise FileNotFoundError(name)
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
        if self.path == "/api/yt/login":
            if not YT_CLIENT_SECRET_FILE.is_file():
                return self._json({"error": "Client-Secret fehlt "
                                   f"({YT_CLIENT_SECRET_FILE})"}, 400)
            yt_login_start()
            return self._json({"ok": True})
        if self.path == "/api/yt/localize":
            try:
                return self._json(yt_localize(
                    str(req.get("url", "")),
                    req.get("titles") or {},
                    req.get("descriptions") or {},
                    str(req.get("hashtags", "")),
                    str(req.get("description", ""))))
            except (RuntimeError, ValueError, OSError) as e:
                return self._json({"error": str(e)}, 500)
        if self.path == "/api/tiktok/login":
            if not TT_CLIENT_FILE.is_file():
                return self._json({"error": f"Client-Datei fehlt ({TT_CLIENT_FILE})"}, 400)
            tt_login_start()
            return self._json({"ok": True})
        if self.path == "/api/tiktok/code":
            raw = str(req.get("code", "")).strip()
            # ganze Redirect-URL eingefügt? → code-Parameter herausziehen
            if "code=" in raw:
                qs = urllib.parse.urlparse(raw).query or raw.split("?", 1)[-1]
                raw = urllib.parse.parse_qs(qs).get("code", [""])[0]
            if not raw:
                return self._json({"error": "Kein Code gefunden"}, 400)
            try:
                tt_exchange_code(raw)
            except (RuntimeError, OSError, ValueError) as e:
                return self._json({"error": str(e)}, 500)
            return self._json({"ok": True})
        if self.path == "/api/meta/login":
            if not meta_client().get("ig_app_id"):
                return self._json({"error": f"Client-Datei fehlt ({META_CLIENT_FILE})"}, 400)
            meta_login_start()
            return self._json({"ok": True})
        if self.path == "/api/meta/code":
            raw = str(req.get("code", "")).strip()
            if "code=" in raw:
                qs = urllib.parse.urlparse(raw).query or raw.split("?", 1)[-1]
                raw = urllib.parse.parse_qs(qs).get("code", [""])[0]
            raw = raw.split("#")[0]  # Instagram hängt "#_" an den Code
            if not raw:
                return self._json({"error": "Kein Code gefunden"}, 400)
            try:
                meta_exchange_code(raw)
            except (RuntimeError, OSError, ValueError, KeyError) as e:
                return self._json({"error": str(e)}, 500)
            return self._json({"ok": True})
        if self.path == "/api/upload/manual":
            # Plattformen ohne API (bilibili …) von Hand vermerken
            name = Path(str(req.get("name", ""))).name
            pf = str(req.get("platform", "")).strip().lower()
            status = str(req.get("status", "")).strip()
            if not name or not pf:
                return self._json({"error": "name und platform noetig"}, 400)
            st = uploads_state()
            if not status:                      # leerer Status = Eintrag loeschen
                st.get(name, {}).pop(pf, None)
                if name in st and not st[name]:
                    st.pop(name)
                UPLOADS_STATE_FILE.write_text(json.dumps(st, ensure_ascii=False, indent=1))
            else:
                save_upload_state(name, pf, {"status": status, "at": time.time()})
            return self._json({"ok": True, "state": uploads_state()})
        if self.path == "/api/upload/tiktok":
            name = Path(str(req.get("name", ""))).name
            path = export_file("tiktok", name)
            if path is None:
                return self._json({"error": f"Datei nicht gefunden: tiktok/{name}"}, 400)
            try:
                r = tt_upload_draft(path)
            except (RuntimeError, OSError, ValueError) as e:
                return self._json({"error": str(e)}, 500)
            info = {"publish_id": r["publish_id"], "uploaded_at": time.time()}
            save_upload_state(name, "tiktok", info)
            return self._json({"ok": True, **info, "state": uploads_state()})
        if self.path == "/api/upload/youtube":
            name = Path(str(req.get("name", ""))).name
            path = export_file("youtube", name)
            if path is None:
                return self._json({"error": f"Datei nicht gefunden: youtube/{name}"}, 400)
            caps = cached_captions(name).get("cached") or {}
            if not caps.get("titles"):
                return self._json({"error": "Keine Captions im Cache — erst im "
                                   "Texte-Tab generieren"}, 400)
            publish_at = str(req.get("publish_at", "")).strip()
            try:
                r = yt_upload(path, caps.get("titles") or {},
                              caps.get("descriptions") or {},
                              str(caps.get("hashtags", "")), publish_at)
            except (RuntimeError, OSError, ValueError) as e:
                return self._json({"error": str(e)}, 500)
            info = {"video_id": r["video_id"], "publish_at": publish_at,
                    "uploaded_at": time.time(), "languages": len(r["written"]),
                    "privacy": r["yt_status"].get("privacyStatus", "?")}
            save_upload_state(name, "youtube", info)
            return self._json({"ok": True, **info, "state": uploads_state()})
        if self.path == "/api/redo_last":
            try:
                info = json.loads(LAST_RENDER_FILE.read_text())
            except (OSError, ValueError):
                return self._json({"error": "Kein letzter Render bekannt"}, 404)
            moved, src = Path(info["moved"]), Path(info["src"])
            if not moved.is_file():
                return self._json({"error": "Quellvideo nicht mehr in "
                                   f"videos-verarbeitet ({moved.name})"}, 404)
            for pf in (*PLATFORMS, "tiktok"):
                p = export_file(pf, info["out_name"])
                if p is not None:
                    p.unlink()
            target = src
            n = 1
            while target.exists():
                target = src.with_name(f"{src.stem}-{n}{src.suffix}")
                n += 1
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(moved), str(target))
            LAST_RENDER_FILE.unlink(missing_ok=True)
            # in den Ursprungs-Ordner wechseln, damit das Video wieder in der Liste ist
            VIDEO_DIR = target.parent.resolve()
            return self._json({**list_state(), "restored": target.name})
        if self.path == "/api/discard_export":
            name = Path(str(req.get("name", ""))).name
            if not name.endswith(".mp4"):
                return self._json({"error": "Ungültiger Name"}, 400)
            removed = 0
            for pf in (*PLATFORMS, "tiktok"):
                p = export_file(pf, name)
                if p is not None:
                    p.unlink()
                    removed += 1
            # Quellvideo zurück in den Ungesichtet-Ordner (Original-Name wiederherstellen)
            stem = export_key(name)
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
                p = export_file(pf, name)
                if p is not None:
                    subprocess.run(["open", "-R", str(p)], check=False)
                    return self._json({"ok": True})
            return self._json({"error": "Datei nicht gefunden"}, 404)
        if self.path == "/api/captions":
            title = str(req.get("title", "")).strip()
            if not title:
                return self._json({"error": "Titel fehlt"}, 400)
            try:
                name = str(req.get("name", ""))
                caps = generate_captions(title, title_prefix(name))
                if name:
                    save_captions_cache(name, caps)
                return self._json({**caps, "bilibili": bilibili_text(caps)})
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
        oton_gain = float(req.get("oton_gain_db", 0) or 0)
        ducks = [d for d in (req.get("ducks") or []) if isinstance(d, dict)]
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
        # aus einem früheren Render mitgeschlepptes Lizenz-Suffix abstreifen —
        # es wird gleich je Plattform aus dem dort gewählten Track neu gebildet
        base = PIXABAY_SUFFIX_RE.sub("", base)
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
            PROGRESS.update(active=True, label=pf, pct=0.0)
            try:
                track = None  # ohne Track: keine Musik, O-Ton pur (jede Plattform)
                if rel:
                    track = safe_child(MUSIC_DIR, rel)
                    if pf not in track_platforms(Path(rel)):
                        raise ValueError(f"Track liegt nicht in einem für {pf} "
                                         "erlaubten Ordner")
                # Lizenznachweis: nur die auf DIESER Plattform genutzte Pixabay-ID
                pf_suffix = "".join(f"-pixabay-{i}" for i in pixabay_ids([rel]))
                out = OUT_DIR / pf / (num + base + pf_suffix + ".mp4")
                # Altbestand mit abweichendem Suffix ersetzen statt doppeln
                old = export_file(pf, out.name)
                if old is not None and old != out:
                    old.unlink()
                render(video, track, out, gain, fade_out, overlay,
                       trim_start, trim_end, texts, outros.get(pf),
                       float(req.get("overlay_alpha", 1.0)),
                       oton_gain_db=oton_gain, ducks=ducks)
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
            LAST_RENDER_FILE.write_text(json.dumps(
                {"out_name": out_name, "src": str(video), "moved": str(target)}))
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
