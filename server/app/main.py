"""FastAPI-App. Liefert /api/* und (falls gebaut) die SPA aus web/dist."""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .api import admin, appmeta, auth, chat, community, coros, devices, feedback, foils, ingest, ml, oauth, polar, push, sessions, settings as settings_api, strava, suunto, transfers
from .api.deps import require_social
from .config import get_settings
from .db import init_db

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    yield


app = FastAPI(
    title="Pump-Foil-Tracker API",
    version="0.1.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

# JSON-Antworten (Feed/Verlauf/Listen) komprimieren — spart Transfer übers Netz.
app.add_middleware(GZipMiddleware, minimum_size=500)


# Standard-Sicherheits-Header auf alle Antworten.
@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    h = resp.headers
    h.setdefault("X-Content-Type-Options", "nosniff")
    h.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    h.setdefault("X-Frame-Options", "SAMEORIGIN")
    # microphone=(self): fürs Diktat (Web Speech API / getUserMedia) auf der eigenen Origin
    # nötig — microphone=() (leer) sperrt es sonst komplett, auch für uns selbst.
    h.setdefault("Permissions-Policy", "microphone=(self), camera=(), payment=()")
    h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    # CSP erzwingend (nach Report-Only-Verifikation der Kern-Flows, Konsole sauber, 2026-07-08).
    h.setdefault("Content-Security-Policy", _CSP)
    # Medien (Fotos/Avatare) sind inhalts-eindeutig (neuer Upload = neue Datei) -> lange cachebar.
    # Apps/Browser laden ein Bild dann nur einmal (Client-Disk-Cache), nicht bei jedem Anzeigen.
    if request.url.path.startswith("/media/"):
        h["Cache-Control"] = "public, max-age=7776000, immutable"   # 90 Tage
    return resp


# Extern geladen wird clientseitig nur: OSM-Kacheln (img), YouTube-Thumbnails (img) und der
# YouTube-nocookie-Embed (frame, Klick-to-Load). Alles andere von der eigenen Origin.
# style 'unsafe-inline' nötig (React-Inline-Styles + Leaflet) — harmlos vs. Skript.
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://img.youtube.com; "
    "frame-src https://www.youtube-nocookie.com; "
    "connect-src 'self'; "
    "worker-src 'self' blob:; "
    "manifest-src 'self'; "
    "frame-ancestors 'self'; "
    "base-uri 'self'; "
    "object-src 'none'"
)

# Alte Domain (und www) dauerhaft auf die kanonische Domain (base_url) umleiten.
# WICHTIG: /api ausnehmen — die Uhr postet noch auf die alte Domain (.../api/ingest),
# ein 301 würde POST-Uploads brechen. /media (Bilder, GET) wird mit umgeleitet.
_CANON_HOST = settings.base_url.split("://", 1)[-1].rstrip("/")
# Alt-Domains aus der .env (REDIRECT_HOSTS) + www der kanonischen Domain.
_REDIRECT_HOSTS = set(settings.redirect_hosts) | {f"www.{_CANON_HOST}"}


@app.middleware("http")
async def canonical_domain(request: Request, call_next):
    host = (request.headers.get("host") or "").split(":")[0].lower()
    if host in _REDIRECT_HOSTS and host != _CANON_HOST and not request.url.path.startswith("/api"):
        target = f"{settings.base_url}{request.url.path}"
        if request.url.query:
            target += f"?{request.url.query}"
        return RedirectResponse(target, status_code=301)
    return await call_next(request)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


def _device_catalog() -> list[dict]:
    import json

    cat = settings.app_builds_dir / "catalog.json"
    return json.loads(cat.read_text()) if cat.exists() else []


@app.get("/api/app/devices")
def app_devices() -> list[dict]:
    """Liste aller gebauten Geräte-Builds (für die Download-Auswahl mit Suche)."""
    return _device_catalog()


@app.get("/api/app/download")
def download_app() -> FileResponse:
    """Default-Build (fēnix 7X Pro) — Rückwärtskompatibilität."""
    p = settings.app_prg
    if not p.exists():
        from fastapi import HTTPException

        raise HTTPException(404, "App-Build nicht verfügbar")
    # Stabiler Dateiname (ohne Version): beim Sideload überschreibt die neue .prg die
    # alte automatisch (eine Datei pro App-ID). Die Version sieht man in der App selbst.
    return FileResponse(
        p, filename="Pumpfoil-fenix7xpro.prg", media_type="application/octet-stream"
    )


@app.get("/api/app/download/{device_id}")
def download_app_device(device_id: str) -> FileResponse:
    """Gebaute .prg für ein bestimmtes Gerät (gegen Katalog validiert -> kein Path-Traversal)."""
    from fastapi import HTTPException

    ids = {d["id"] for d in _device_catalog()}
    if device_id not in ids:
        raise HTTPException(404, "Unbekanntes Gerät")
    p = settings.app_builds_dir / f"foil-{device_id}.prg"
    if not p.exists():
        raise HTTPException(404, "App-Build nicht verfügbar")
    # Stabiler Dateiname -> neuer Sideload überschreibt die alte Datei.
    return FileResponse(
        p, filename=f"Pumpfoil-{device_id}.prg", media_type="application/octet-stream"
    )


@app.get("/demo/wear-fgs.webm")
def wear_fgs_demo() -> FileResponse:
    """Öffentliches Demo-Video (Wear-Aufnahme: Start/Aufzeichnung/Stopp) als Beleg für die
    Play-Foreground-Service-Deklaration. Bewusst NICHT in der App/Website verlinkt — nur eine
    stabile, öffentlich erreichbare URL für die Play Console."""
    from fastapi import HTTPException

    d = Path(__file__).resolve().parents[2] / "screenshots" / "watch" / "wear"
    vids = sorted(d.glob("*.webm"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not vids:
        raise HTTPException(404, "kein Demo-Video")
    return FileResponse(vids[0], media_type="video/webm", filename="pumpfoil-wear-fgs.webm")


# --- Öffentliche Promo-Videos vom YouTube-Kanal (@pumpfoil-org), gecacht. ---
# Quelle: Kanal-RSS-Feed (kein API-Key, keine Quota). Selbst-aktualisierend, sobald Jan
# neue Videos postet. Wird auf der öffentlichen Startseite (Landing) eingebunden.
_YT_CHANNEL_ID = "UCb_1b-TkdGE4kZWX17HDH9g"
_YT_FEED = f"https://www.youtube.com/feeds/videos.xml?channel_id={_YT_CHANNEL_ID}"
_YT_TTL_S = 3600.0
_yt_cache: dict = {"at": 0.0, "videos": []}


@app.get("/api/public/videos")
def public_videos() -> dict:
    """Neueste Videos des YouTube-Kanals als [{id,title,published}] (1h gecacht)."""
    import time
    import httpx
    from xml.etree import ElementTree as ET

    now = time.time()
    if now - _yt_cache["at"] < _YT_TTL_S and _yt_cache["videos"]:
        return {"videos": _yt_cache["videos"], "channel": "https://www.youtube.com/@pumpfoil-org"}
    try:
        r = httpx.get(_YT_FEED, timeout=10)
        if r.status_code == 200:
            ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015"}
            root = ET.fromstring(r.text)
            vids = []
            for e in root.findall("a:entry", ns):
                vid = e.findtext("yt:videoId", default="", namespaces=ns)
                title = e.findtext("a:title", default="", namespaces=ns)
                pub = e.findtext("a:published", default="", namespaces=ns)
                if vid:
                    vids.append({"id": vid, "title": title, "published": pub})
            if vids:
                _yt_cache.update(at=now, videos=vids[:12])
    except Exception:  # noqa: BLE001 — Feed-Ausfall darf die Startseite nicht stören
        pass
    return {"videos": _yt_cache["videos"], "channel": "https://www.youtube.com/@pumpfoil-org"}


@app.get("/api/public/video-thumb/{vid}")
def public_video_thumb(vid: str):
    """YouTube-Vorschaubild über UNSEREN Server ausliefern (gecacht), statt es direkt von
    i.ytimg.com zu laden. So entsteht beim Seitenaufbau KEIN Drittkontakt zu Google vor dem
    Klick aufs Video -> kein Cookie-Banner nötig (Click-to-Load bleibt einwilligungsfrei)."""
    import re
    import httpx
    from fastapi import Response, HTTPException

    if not re.fullmatch(r"[A-Za-z0-9_-]{6,16}", vid):
        raise HTTPException(400, "bad id")
    cached = _yt_thumb_cache.get(vid)
    if cached is None:
        data = b""
        for q in ("hqdefault", "mqdefault"):
            try:
                r = httpx.get(f"https://i.ytimg.com/vi/{vid}/{q}.jpg", timeout=10)
                if r.status_code == 200 and r.content:
                    data = r.content
                    break
            except Exception:  # noqa: BLE001
                pass
        if not data:
            raise HTTPException(404, "no thumb")
        if len(_yt_thumb_cache) < 64:
            _yt_thumb_cache[vid] = data
        cached = data
    return Response(content=cached, media_type="image/jpeg",
                    headers={"Cache-Control": "public, max-age=86400"})


_yt_thumb_cache: dict = {}


app.include_router(auth.router)
app.include_router(devices.router)
app.include_router(ingest.router)
app.include_router(sessions.router)
app.include_router(ml.router)
app.include_router(settings_api.router)
app.include_router(community.router, dependencies=[Depends(require_social)])
app.include_router(admin.router)
app.include_router(feedback.router)
app.include_router(oauth.router)
app.include_router(polar.router)
app.include_router(coros.router)
app.include_router(suunto.router)
app.include_router(strava.router)
app.include_router(push.router)
app.include_router(foils.router)
app.include_router(chat.router, dependencies=[Depends(require_social)])
app.include_router(transfers.router, dependencies=[Depends(require_social)])
app.include_router(appmeta.router)

# --- Öffentliche Medien (Fotos, Profilbilder). Unraffbare UUID-Dateinamen. ---
settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


# --- SPA-Auslieferung (Prod). Im Dev läuft das Frontend über den Vite-Dev-Server. ---
if settings.web_dist.exists():
    assets = settings.web_dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    # Diese Dateien MÜSSEN immer revalidiert werden — sonst hängt die PWA auf einer alten
    # Version fest, weil Browser/Proxy sie cachen und das Service-Worker-Update nie erkannt
    # wird. Die gehashten /assets/* (immutable) bleiben über den StaticFiles-Mount cachebar.
    _NO_CACHE = {"sw.js", "index.html", "version.json", "manifest.webmanifest",
                 "registerSW.js", "push-sw.js", "theme-init.js"}

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ANN202
        candidate = settings.web_dist / full_path
        if full_path and candidate.is_file():
            nc = candidate.name in _NO_CACHE or candidate.name.startswith("workbox-")
            return FileResponse(candidate, headers={"Cache-Control": "no-cache"} if nc else {})
        return FileResponse(settings.web_dist / "index.html", headers={"Cache-Control": "no-cache"})
