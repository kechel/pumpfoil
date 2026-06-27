"""FastAPI-App. Liefert /api/* und (falls gebaut) die SPA aus web/dist."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .api import admin, auth, chat, community, devices, feedback, foils, ingest, ml, oauth, push, sessions, settings as settings_api
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
    h.setdefault("Permissions-Policy", "microphone=(), camera=(), payment=()")
    h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return resp

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
        p, filename="PumpFoil-fenix7xpro.prg", media_type="application/octet-stream"
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
        p, filename=f"PumpFoil-{device_id}.prg", media_type="application/octet-stream"
    )


app.include_router(auth.router)
app.include_router(devices.router)
app.include_router(ingest.router)
app.include_router(sessions.router)
app.include_router(ml.router)
app.include_router(settings_api.router)
app.include_router(community.router)
app.include_router(admin.router)
app.include_router(feedback.router)
app.include_router(oauth.router)
app.include_router(push.router)
app.include_router(foils.router)
app.include_router(chat.router)

# --- Öffentliche Medien (Fotos, Profilbilder). Unraffbare UUID-Dateinamen. ---
settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


# --- SPA-Auslieferung (Prod). Im Dev läuft das Frontend über den Vite-Dev-Server. ---
if settings.web_dist.exists():
    assets = settings.web_dist / "assets"
    if assets.exists():
        app.mount("/assets", StaticFiles(directory=assets), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):  # noqa: ANN202
        candidate = settings.web_dist / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(settings.web_dist / "index.html")
