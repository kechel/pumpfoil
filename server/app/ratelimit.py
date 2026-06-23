"""Einfacher In-Memory-Rate-Limiter (Sliding Window) je Client-IP + Scope.

Reicht für einen einzelnen uvicorn-Prozess (so läuft der Server). Schützt vor
Brute-Force auf Login/Registrierung/Pairing. Hinter dem Apache-Proxy liefert
uvicorn (--proxy-headers --forwarded-allow-ips) die echte Client-IP.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status

_lock = threading.Lock()
_hits: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(max_hits: int, window_s: int, scope: str):
    """FastAPI-Dependency: erlaubt max_hits pro window_s je Client-IP und Scope,
    sonst HTTP 429 mit Retry-After. Geblockte Versuche verlängern das Fenster nicht."""

    def dep(request: Request) -> None:
        key = f"{scope}:{_client_ip(request)}"
        now = time.monotonic()
        cutoff = now - window_s
        with _lock:
            dq = _hits[key]
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= max_hits:
                retry = int(dq[0] + window_s - now) + 1
                raise HTTPException(
                    status.HTTP_429_TOO_MANY_REQUESTS,
                    "Zu viele Versuche. Bitte kurz warten und erneut versuchen.",
                    headers={"Retry-After": str(max(retry, 1))},
                )
            dq.append(now)
            if not dq:
                _hits.pop(key, None)
            # Selten globale Leichen aufräumen, damit der Speicher nicht wächst.
            if len(_hits) > 10000:
                for k in [k for k, v in list(_hits.items()) if not v or v[-1] < cutoff]:
                    _hits.pop(k, None)

    return dep
